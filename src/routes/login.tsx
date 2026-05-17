import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Flame } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const signIn = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Sign-in failed", { description: result.error.message });
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Warm background ornament */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-warm/40 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-secondary/60 blur-3xl" />
      </div>

      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Flame className="h-5 w-5" />
            </span>
            <span className="font-display text-2xl font-semibold">Hearth</span>
          </div>

          <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            The cozy<br />
            <span className="italic text-primary">to-do list</span><br />
            for your family.
          </h1>
          <p className="mt-5 max-w-sm text-base text-muted-foreground">
            Keep dinner, dishes, and dance recitals in one warm place everyone can see.
          </p>

          <div className="mt-10 rounded-2xl border bg-card p-6 shadow-sm">
            <Button
              size="lg"
              className="w-full gap-3 rounded-xl text-base"
              onClick={signIn}
              disabled={loading}
            >
              <GoogleIcon />
              {loading ? "Opening Google…" : "Continue with Google"}
            </Button>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              By continuing you agree to keep your chores wholesome.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#fff" d="M21.6 12.227c0-.709-.064-1.39-.182-2.045H12v3.868h5.385a4.604 4.604 0 0 1-1.996 3.018v2.51h3.232c1.891-1.742 2.98-4.305 2.98-7.351Z"/>
      <path fill="#fff" d="M12 22c2.7 0 4.964-.895 6.62-2.422l-3.232-2.51c-.895.6-2.04.955-3.388.955-2.605 0-4.81-1.76-5.595-4.123H3.064v2.59A9.996 9.996 0 0 0 12 22Z"/>
      <path fill="#fff" d="M6.405 13.9A5.999 5.999 0 0 1 6.09 12c0-.66.114-1.3.314-1.9V7.51H3.064A9.996 9.996 0 0 0 2 12c0 1.614.386 3.14 1.064 4.49l3.341-2.59Z"/>
      <path fill="#fff" d="M12 5.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C16.96 2.99 14.696 2 12 2A9.996 9.996 0 0 0 3.064 7.51l3.341 2.59C7.191 7.737 9.395 5.977 12 5.977Z"/>
    </svg>
  );
}
