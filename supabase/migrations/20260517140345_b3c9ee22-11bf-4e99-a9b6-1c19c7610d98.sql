
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurrence text
    CHECK (recurrence IN ('none','daily','weekly','monthly','yearly'))
    NOT NULL DEFAULT 'none';

CREATE TABLE IF NOT EXISTS public.nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL,
  to_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nudges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family members view nudges"
  ON public.nudges FOR SELECT
  USING (public.is_family_member(family_id, auth.uid()));

CREATE POLICY "Family members send nudges"
  ON public.nudges FOR INSERT
  WITH CHECK (public.is_family_member(family_id, auth.uid()) AND from_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_nudges_task ON public.nudges(task_id);
CREATE INDEX IF NOT EXISTS idx_nudges_family_created ON public.nudges(family_id, created_at DESC);
