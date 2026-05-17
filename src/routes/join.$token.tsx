import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Flame } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/join/$token")({
  component: JoinPage,
});

type InviteInfo = {
  family_id: string;
  family_name: string;
  expires_at: string;
  accepted_at: string | null;
};

function JoinPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "invalid" | "expired" | "used">("loading");
  const [authed, setAuthed] = useState<boolean>(false);
  const [displayName, setDisplayName] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setAuthed(!!u);
      const name = (u?.user_metadata?.full_name as string | undefined) ?? "";
      if (name) setDisplayName(name.split(" ")[0]);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s));

    (async () => {
      const { data, error } = await supabase.rpc("get_invite_info", { _token: token });
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setStatus("invalid");
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as InviteInfo;
      setInfo(row);
      if (row.accepted_at) setStatus("used");
      else if (new Date(row.expires_at) < new Date()) setStatus("expired");
      else setStatus("ready");
    })();

    return () => sub.subscription.unsubscribe();
  }, [token]);

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    if (error) toast.error(error.message);
  };

  const accept = async () => {
    if (!displayName.trim()) return toast.error("Please enter your name.");
    setJoining(true);
    const { error } = await supabase.rpc("accept_invite", {
      _token: token,
      _display_name: displayName.trim(),
    });
    setJoining(false);
    if (error) return toast.error(error.message);
    toast.success(`Welcome to ${info?.family_name}!`);
    navigate({ to: "/" });
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Flame className="h-5 w-5" />
          </span>
          <span className="font-display text-2xl font-semibold">Hearth</span>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          {status === "loading" && (
            <p className="text-center text-sm text-muted-foreground">Checking invite…</p>
          )}

          {status === "invalid" && (
            <div className="text-center">
              <h1 className="font-display text-2xl font-semibold">Invite not found</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This link doesn't look right. Ask whoever sent it to share it again.
              </p>
            </div>
          )}

          {status === "expired" && (
            <div className="text-center">
              <h1 className="font-display text-2xl font-semibold">Invite expired</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Ask for a fresh invite link — this one is older than 7 days.
              </p>
            </div>
          )}

          {status === "used" && (
            <div className="text-center">
              <h1 className="font-display text-2xl font-semibold">Already used</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This invite has already been claimed.
              </p>
            </div>
          )}

          {status === "ready" && info && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                You're invited to
              </p>
              <h1 className="mt-1 font-display text-2xl font-semibold">{info.family_name}</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Join to share tasks with everyone in this family.
              </p>

              {!authed ? (
                <Button onClick={signIn} className="mt-6 h-11 w-full rounded-xl">
                  Sign in with Google to continue
                </Button>
              ) : (
                <div className="mt-6 space-y-4">
                  <div>
                    <Label htmlFor="name" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Your name in this family
                    </Label>
                    <Input
                      id="name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Mom, Sam"
                      className="mt-1.5 h-11 rounded-xl"
                    />
                  </div>
                  <Button onClick={accept} disabled={joining} className="h-11 w-full rounded-xl">
                    {joining ? "Joining…" : `Join ${info.family_name}`}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
