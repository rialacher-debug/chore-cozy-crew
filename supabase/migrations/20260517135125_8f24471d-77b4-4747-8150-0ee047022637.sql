
-- Families
CREATE TABLE public.families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'My Family',
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

-- Family members
CREATE TABLE public.family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, user_id)
);
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX family_members_user_idx ON public.family_members(user_id);
CREATE INDEX family_members_family_idx ON public.family_members(family_id);

-- Invites
CREATE TABLE public.family_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18), 'base64'),
  email text,
  created_by uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.family_invites ENABLE ROW LEVEL SECURITY;
CREATE INDEX family_invites_family_idx ON public.family_invites(family_id);

-- Helper: is the user a member of the family?
CREATE OR REPLACE FUNCTION public.is_family_member(_family_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = _family_id AND user_id = _user_id
  );
$$;

-- RLS: families
CREATE POLICY "Members view their families" ON public.families
  FOR SELECT USING (public.is_family_member(id, auth.uid()));
CREATE POLICY "Owner updates family" ON public.families
  FOR UPDATE USING (owner_id = auth.uid());

-- RLS: family_members
CREATE POLICY "Members view co-members" ON public.family_members
  FOR SELECT USING (public.is_family_member(family_id, auth.uid()));

-- RLS: family_invites
CREATE POLICY "Members view family invites" ON public.family_invites
  FOR SELECT USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "Members create invites" ON public.family_invites
  FOR INSERT WITH CHECK (
    public.is_family_member(family_id, auth.uid())
    AND created_by = auth.uid()
  );
CREATE POLICY "Members delete invites" ON public.family_invites
  FOR DELETE USING (public.is_family_member(family_id, auth.uid()));

-- Auto-create family on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_family_id uuid;
  display text;
BEGIN
  display := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1),
    'Me'
  );
  INSERT INTO public.families (name, owner_id)
  VALUES (display || '''s Family', NEW.id)
  RETURNING id INTO new_family_id;
  INSERT INTO public.family_members (family_id, user_id, display_name)
  VALUES (new_family_id, NEW.id, display);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: create families for existing users without one
INSERT INTO public.families (name, owner_id)
SELECT COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1), 'Me') || '''s Family', u.id
FROM auth.users u
LEFT JOIN public.family_members fm ON fm.user_id = u.id
WHERE fm.id IS NULL;

INSERT INTO public.family_members (family_id, user_id, display_name)
SELECT f.id, f.owner_id, COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1), 'Me')
FROM public.families f
JOIN auth.users u ON u.id = f.owner_id
LEFT JOIN public.family_members fm ON fm.family_id = f.id AND fm.user_id = f.owner_id
WHERE fm.id IS NULL;

-- Tasks: add family_id, rewire RLS
ALTER TABLE public.tasks ADD COLUMN family_id uuid REFERENCES public.families(id) ON DELETE CASCADE;

-- Backfill family_id for existing tasks based on owner
UPDATE public.tasks t
SET family_id = fm.family_id
FROM public.family_members fm
WHERE fm.user_id = t.user_id AND t.family_id IS NULL;

ALTER TABLE public.tasks ALTER COLUMN family_id SET NOT NULL;
CREATE INDEX tasks_family_idx ON public.tasks(family_id);

DROP POLICY IF EXISTS "Users view own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users insert own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users update own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users delete own tasks" ON public.tasks;

CREATE POLICY "Family members view tasks" ON public.tasks
  FOR SELECT USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "Family members insert tasks" ON public.tasks
  FOR INSERT WITH CHECK (public.is_family_member(family_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "Family members update tasks" ON public.tasks
  FOR UPDATE USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "Family members delete tasks" ON public.tasks
  FOR DELETE USING (public.is_family_member(family_id, auth.uid()));

-- Invite lookup + accept RPCs (security definer so anonymous-but-authed users can use them)
CREATE OR REPLACE FUNCTION public.get_invite_info(_token text)
RETURNS TABLE(family_id uuid, family_name text, expires_at timestamptz, accepted_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.family_id, f.name, i.expires_at, i.accepted_at
  FROM public.family_invites i
  JOIN public.families f ON f.id = i.family_id
  WHERE i.token = _token;
$$;

CREATE OR REPLACE FUNCTION public.accept_invite(_token text, _display_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv public.family_invites%ROWTYPE;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO inv FROM public.family_invites WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found'; END IF;
  IF inv.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Invite already used'; END IF;
  IF inv.expires_at < now() THEN RAISE EXCEPTION 'Invite expired'; END IF;

  INSERT INTO public.family_members (family_id, user_id, display_name)
  VALUES (inv.family_id, uid, COALESCE(NULLIF(trim(_display_name), ''), 'New member'))
  ON CONFLICT (family_id, user_id) DO NOTHING;

  UPDATE public.family_invites
  SET accepted_at = now(), accepted_by = uid
  WHERE id = inv.id;

  RETURN inv.family_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_info(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.accept_invite(text, text) TO authenticated;
