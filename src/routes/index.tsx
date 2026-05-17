import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Flame, Plus, LogOut, CalendarDays, Trash2, ListTodo, UserPlus, Copy, Check } from "lucide-react";
import { format, isPast, isToday, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: HomePage,
});

type Task = {
  id: string;
  title: string;
  assigned_to: string;
  due_date: string | null;
  done: boolean;
  created_at: string;
  family_id: string;
};

type Member = { id: string; user_id: string; display_name: string };

function HomePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState<string>("all");

  // Form state
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (!session) navigate({ to: "/login" });
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setUser(data.session?.user ?? null);
      if (!data.session) {
        navigate({ to: "/login" });
        return;
      }
      await bootstrap(data.session.user.id);
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bootstrap = async (uid: string) => {
    setLoading(true);
    // Find this user's family (created automatically on signup)
    const { data: myMembership, error: mErr } = await supabase
      .from("family_members")
      .select("family_id")
      .eq("user_id", uid)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (mErr) {
      toast.error(mErr.message);
      setLoading(false);
      return;
    }
    if (!myMembership) {
      toast.error("No family found for your account.");
      setLoading(false);
      return;
    }
    const fid = myMembership.family_id;
    setFamilyId(fid);

    const [{ data: mems }, { data: ts, error: tErr }] = await Promise.all([
      supabase.from("family_members").select("id,user_id,display_name").eq("family_id", fid),
      supabase
        .from("tasks")
        .select("*")
        .eq("family_id", fid)
        .order("done", { ascending: true })
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false }),
    ]);

    setMembers((mems ?? []) as Member[]);
    if (tErr) toast.error(tErr.message);
    else setTasks((ts ?? []) as Task[]);
    setLoading(false);
  };

  const visible = useMemo(
    () => (filter === "all" ? tasks : tasks.filter((t) => t.assigned_to === filter)),
    [tasks, filter]
  );

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !familyId) return;
    if (!title.trim() || !assignee.trim()) {
      toast.error("Add a task and who it's for.");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        family_id: familyId,
        title: title.trim(),
        assigned_to: assignee.trim(),
        due_date: dueDate || null,
      })
      .select()
      .single();
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setTasks((prev) => [data as Task, ...prev]);
    setTitle("");
    setDueDate("");
    toast.success("Task added");
  };

  const toggleDone = async (task: Task) => {
    const optimistic = !task.done;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: optimistic } : t)));
    const { error } = await supabase.from("tasks").update({ done: optimistic }).eq("id", task.id);
    if (error) {
      toast.error(error.message);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: task.done } : t)));
    }
  };

  const removeTask = async (id: string) => {
    const prev = tasks;
    setTasks((p) => p.filter((t) => t.id !== id));
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      setTasks(prev);
    }
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  const openCount = tasks.filter((t) => !t.done).length;

  return (
    <main className="min-h-screen">
      <header className="border-b bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Flame className="h-4.5 w-4.5" />
            </span>
            <span className="font-display text-xl font-semibold">Hearth</span>
          </div>
          <div className="flex items-center gap-1">
            {familyId && <InviteButton familyId={familyId} userId={user?.id ?? ""} />}
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-24 pt-8">
        <section className="mb-8">
          <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, MMMM d")}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">
            Hi {user?.user_metadata?.full_name?.split(" ")[0] ?? "there"} —{" "}
            <span className="text-primary italic">
              {openCount === 0 ? "all caught up." : `${openCount} thing${openCount === 1 ? "" : "s"} to do.`}
            </span>
          </h1>
        </section>

        <section className="mb-6 rounded-2xl border bg-card p-5 shadow-sm">
          <form onSubmit={addTask} className="space-y-4">
            <div>
              <Label htmlFor="title" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                New task
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Empty the dishwasher…"
                className="mt-1.5 h-11 rounded-xl bg-background"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="assignee" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Assigned to
                </Label>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger id="assignee" className="mt-1.5 h-11 rounded-xl bg-background">
                    <SelectValue placeholder="Pick a family member" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.length === 0 ? (
                      <div className="p-2 text-xs text-muted-foreground">Invite someone first</div>
                    ) : (
                      members.map((m) => (
                        <SelectItem key={m.id} value={m.display_name}>{m.display_name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="due" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Due date
                </Label>
                <Input
                  id="due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1.5 h-11 rounded-xl bg-background"
                />
              </div>
            </div>
            <Button type="submit" disabled={submitting} className="h-11 w-full gap-2 rounded-xl sm:w-auto">
              <Plus className="h-4 w-4" />
              {submitting ? "Adding…" : "Add task"}
            </Button>
          </form>
        </section>

        <section className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Tasks</h2>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-10 w-[180px] rounded-xl bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.display_name}>{m.display_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        <section className="space-y-2.5">
          {loading ? (
            <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card/40 p-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                <ListTodo className="h-5 w-5" />
              </div>
              <p className="font-medium">Nothing here yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add the first task above and watch it appear.
              </p>
            </div>
          ) : (
            visible.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={() => toggleDone(task)} onDelete={() => removeTask(task.id)} />
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function InviteButton({ familyId, userId }: { familyId: string; userId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    if (!userId) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("family_invites")
      .insert({ family_id: familyId, created_by: userId, email: email.trim() || null })
      .select("token")
      .single();
    setCreating(false);
    if (error) return toast.error(error.message);
    setLink(`${window.location.origin}/join/${encodeURIComponent(data.token)}`);
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 1500);
  };

  const reset = () => { setLink(null); setEmail(""); setCopied(false); };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <UserPlus className="h-4 w-4" />
          <span className="hidden sm:inline">Invite</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Invite a family member</DialogTitle>
          <DialogDescription>
            Create a private link and share it however you like. It expires in 7 days.
          </DialogDescription>
        </DialogHeader>
        {!link ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="invite-email" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Their email (optional, for your reference)
              </Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="grandma@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 h-11 rounded-xl"
              />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border bg-muted/40 p-3">
            <p className="break-all text-sm">{link}</p>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          {!link ? (
            <Button onClick={create} disabled={creating} className="w-full sm:w-auto">
              {creating ? "Creating…" : "Create invite link"}
            </Button>
          ) : (
            <Button onClick={copy} className="w-full gap-2 sm:w-auto">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskRow({ task, onToggle, onDelete }: { task: Task; onToggle: () => void; onDelete: () => void }) {
  const due = task.due_date ? parseISO(task.due_date) : null;
  const overdue = due && !task.done && isPast(due) && !isToday(due);
  const today = due && isToday(due);

  return (
    <div className={cn("group flex items-center gap-3 rounded-2xl border bg-card px-4 py-3.5 shadow-sm transition", task.done && "opacity-60")}>
      <Checkbox
        checked={task.done}
        onCheckedChange={onToggle}
        className="h-5 w-5 rounded-full data-[state=checked]:bg-primary data-[state=checked]:border-primary"
      />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-medium", task.done && "line-through")}>{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold uppercase text-secondary-foreground">
              {task.assigned_to.slice(0, 1)}
            </span>
            {task.assigned_to}
          </span>
          {due && (
            <span className={cn("inline-flex items-center gap-1", overdue && "text-destructive font-medium", today && "text-primary font-medium")}>
              <CalendarDays className="h-3.5 w-3.5" />
              {today ? "Today" : format(due, "MMM d")}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onDelete}
        aria-label="Delete task"
        className="rounded-lg p-2 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-destructive group-hover:opacity-100 sm:opacity-0"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
