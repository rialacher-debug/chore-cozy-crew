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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Flame, Plus, LogOut, CalendarDays, Trash2, ListTodo, UserPlus, Copy, Check,
  Repeat, Bell, Coffee,
} from "lucide-react";
import {
  format, isPast, isToday, isThisWeek, isThisMonth, parseISO,
  addDays, addWeeks, addMonths, addYears, differenceInCalendarDays,
} from "date-fns";
import { cn } from "@/lib/utils";
import confetti from "canvas-confetti";

export const Route = createFileRoute("/")({
  component: HomePage,
});

type Recurrence = "none" | "daily" | "weekly" | "monthly" | "yearly";

type Task = {
  id: string;
  title: string;
  assigned_to: string;
  due_date: string | null;
  done: boolean;
  created_at: string;
  family_id: string;
  recurrence: Recurrence;
};

type Member = { id: string; user_id: string; display_name: string };
type View = "today" | "week" | "month" | "someday";

function HomePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [view, setView] = useState<View>("today");

  // Form state
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
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
    const { data: myMembership, error: mErr } = await supabase
      .from("family_members")
      .select("family_id")
      .eq("user_id", uid)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (mErr) { toast.error(mErr.message); setLoading(false); return; }
    if (!myMembership) { toast.error("No family found."); setLoading(false); return; }

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

  // Filter by person + view
  const byPerson = useMemo(
    () => (filter === "all" ? tasks : tasks.filter((t) => t.assigned_to === filter)),
    [tasks, filter]
  );

  const visible = useMemo(() => {
    return byPerson.filter((t) => {
      if (view === "someday") return !t.due_date;
      if (!t.due_date) return false;
      const d = parseISO(t.due_date);
      if (view === "today") return isToday(d) || (isPast(d) && !t.done);
      if (view === "week") return isThisWeek(d, { weekStartsOn: 1 });
      if (view === "month") return isThisMonth(d);
      return true;
    });
  }, [byPerson, view]);

  // Overdue tasks (across everyone) for the nag banner
  const overdueByPerson = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.done || !t.due_date) continue;
      const d = parseISO(t.due_date);
      if (isPast(d) && !isToday(d)) {
        const list = map.get(t.assigned_to) ?? [];
        list.push(t);
        map.set(t.assigned_to, list);
      }
    }
    return map;
  }, [tasks]);

  const counts: Record<View, number> = useMemo(() => {
    const c = { today: 0, week: 0, month: 0, someday: 0 } as Record<View, number>;
    for (const t of byPerson) {
      if (t.done) continue;
      if (!t.due_date) { c.someday++; continue; }
      const d = parseISO(t.due_date);
      if (isToday(d) || isPast(d)) c.today++;
      if (isThisWeek(d, { weekStartsOn: 1 })) c.week++;
      if (isThisMonth(d)) c.month++;
    }
    return c;
  }, [byPerson]);

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !familyId) return;
    if (!title.trim() || !assignee.trim()) {
      toast.error("Add a task and who it's for.");
      return;
    }
    if (recurrence !== "none" && !dueDate) {
      toast.error("Recurring tasks need a start date.");
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
        recurrence,
      })
      .select()
      .single();
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setTasks((prev) => [data as Task, ...prev]);
    setTitle("");
    setDueDate("");
    setRecurrence("none");
    toast.success("Task added");
  };

  const fireConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.7 },
      colors: ["#c2654a", "#e8a87c", "#87a878", "#f0d78c"],
      scalar: 0.9,
    });
  };

  const nextDueDate = (iso: string, r: Recurrence): string => {
    const d = parseISO(iso);
    const map: Record<Exclude<Recurrence, "none">, Date> = {
      daily: addDays(d, 1),
      weekly: addWeeks(d, 1),
      monthly: addMonths(d, 1),
      yearly: addYears(d, 1),
    };
    const next = map[r as Exclude<Recurrence, "none">];
    return format(next, "yyyy-MM-dd");
  };

  const toggleDone = async (task: Task) => {
    const optimistic = !task.done;

    // Recurring + completing → roll the due date forward instead of marking done.
    if (optimistic && task.recurrence !== "none" && task.due_date) {
      const newDue = nextDueDate(task.due_date, task.recurrence);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, due_date: newDue } : t)));
      fireConfetti();
      toast.success(`Nice! Next one ${format(parseISO(newDue), "MMM d")}.`);
      const { error } = await supabase
        .from("tasks")
        .update({ due_date: newDue })
        .eq("id", task.id);
      if (error) {
        toast.error(error.message);
        setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      }
      return;
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: optimistic } : t)));
    if (optimistic) fireConfetti();
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
    if (error) { toast.error(error.message); setTasks(prev); }
  };

  const nudge = async (task: Task) => {
    if (!user || !familyId) return;
    const { error } = await supabase.from("nudges").insert({
      family_id: familyId,
      task_id: task.id,
      from_user_id: user.id,
      to_name: task.assigned_to,
    });
    if (error) return toast.error(error.message);
    toast.success(`Nudged ${task.assigned_to} 👀`);
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] ?? "there";

  return (
    <main className="min-h-screen">
      <header className="border-b bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Flame className="h-4 w-4" />
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
            Hi {firstName} —{" "}
            <span className="text-primary italic">
              {counts.today === 0 ? "all caught up." : `${counts.today} thing${counts.today === 1 ? "" : "s"} today.`}
            </span>
          </h1>
        </section>

        {/* Nag banner */}
        <NagBanner overdueByPerson={overdueByPerson} myName={members.find((m) => m.user_id === user?.id)?.display_name} />

        {/* Add task form */}
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
                placeholder="Take out the trash bins…"
                className="mt-1.5 h-11 rounded-xl bg-background"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="assignee" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Assigned to
                </Label>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger id="assignee" className="mt-1.5 h-11 rounded-xl bg-background">
                    <SelectValue placeholder="Who?" />
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
                  Due
                </Label>
                <Input
                  id="due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1.5 h-11 rounded-xl bg-background"
                />
              </div>
              <div>
                <Label htmlFor="rec" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Repeats
                </Label>
                <Select value={recurrence} onValueChange={(v) => setRecurrence(v as Recurrence)}>
                  <SelectTrigger id="rec" className="mt-1.5 h-11 rounded-xl bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">One-time</SelectItem>
                    <SelectItem value="daily">Every day</SelectItem>
                    <SelectItem value="weekly">Every week</SelectItem>
                    <SelectItem value="monthly">Every month</SelectItem>
                    <SelectItem value="yearly">Every year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" disabled={submitting} className="h-11 w-full gap-2 rounded-xl sm:w-auto">
              <Plus className="h-4 w-4" />
              {submitting ? "Adding…" : "Add task"}
            </Button>
          </form>
        </section>

        {/* Time-horizon tabs */}
        <section className="mb-4">
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList className="h-11 w-full justify-start gap-1 rounded-xl bg-card p-1 sm:w-auto">
              <TabsTrigger value="today" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Today {counts.today > 0 && <span className="ml-1.5 text-xs opacity-80">{counts.today}</span>}
              </TabsTrigger>
              <TabsTrigger value="week" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Week {counts.week > 0 && <span className="ml-1.5 text-xs opacity-80">{counts.week}</span>}
              </TabsTrigger>
              <TabsTrigger value="month" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Month {counts.month > 0 && <span className="ml-1.5 text-xs opacity-80">{counts.month}</span>}
              </TabsTrigger>
              <TabsTrigger value="someday" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Someday {counts.someday > 0 && <span className="ml-1.5 text-xs opacity-80">{counts.someday}</span>}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </section>

        <section className="mb-4 flex items-center justify-end gap-3">
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
            <EmptyState view={view} />
          ) : (
            visible.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                isMine={members.find((m) => m.user_id === user?.id)?.display_name === task.assigned_to}
                onToggle={() => toggleDone(task)}
                onDelete={() => removeTask(task.id)}
                onNudge={() => nudge(task)}
              />
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function NagBanner({
  overdueByPerson,
  myName,
}: {
  overdueByPerson: Map<string, Task[]>;
  myName?: string;
}) {
  const others = Array.from(overdueByPerson.entries()).filter(([name]) => name !== myName);
  if (others.length === 0) return null;
  const [name, list] = others[0];
  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-warm/40 bg-warm/15 p-4">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warm/30 text-warm-foreground">
        <Bell className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {name} has {list.length} overdue chore{list.length === 1 ? "" : "s"} 👀
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Tap the bell on a task to give them a gentle nudge.
        </p>
      </div>
    </div>
  );
}

function EmptyState({ view }: { view: View }) {
  const copy: Record<View, { title: string; sub: string }> = {
    today: { title: "All caught up! ☕", sub: "Pour a coffee — nothing's due today." },
    week: { title: "A peaceful week ahead", sub: "Nothing scheduled this week yet." },
    month: { title: "Wide open month", sub: "Plan ahead — add tasks with a due date." },
    someday: { title: "No dreams parked here", sub: "Add tasks without a date to plan for someday." },
  };
  const c = copy[view];
  return (
    <div className="rounded-2xl border border-dashed bg-card/40 p-12 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Coffee className="h-5 w-5" />
      </div>
      <p className="font-display text-lg">{c.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{c.sub}</p>
    </div>
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
                placeholder="adrian@example.com"
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

function TaskRow({
  task, isMine, onToggle, onDelete, onNudge,
}: {
  task: Task;
  isMine: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onNudge: () => void;
}) {
  const due = task.due_date ? parseISO(task.due_date) : null;
  const overdue = due && !task.done && isPast(due) && !isToday(due);
  const today = due && isToday(due);
  const daysLate = overdue && due ? Math.abs(differenceInCalendarDays(new Date(), due)) : 0;

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-2xl border bg-card px-4 py-3.5 shadow-sm transition",
        task.done && "opacity-60",
        overdue && "border-destructive/30 bg-destructive/5 animate-wiggle"
      )}
    >
      <Checkbox
        checked={task.done}
        onCheckedChange={onToggle}
        className="h-5 w-5 rounded-full data-[state=checked]:bg-primary data-[state=checked]:border-primary"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn("truncate font-medium", task.done && "line-through")}>{task.title}</p>
          {task.recurrence !== "none" && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
              <Repeat className="h-2.5 w-2.5" />
              {task.recurrence}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold uppercase text-secondary-foreground">
              {task.assigned_to.slice(0, 1)}
            </span>
            {task.assigned_to}
          </span>
          {due && (
            <span className={cn(
              "inline-flex items-center gap-1",
              overdue && "text-destructive font-semibold",
              today && "text-primary font-medium"
            )}>
              <CalendarDays className="h-3.5 w-3.5" />
              {overdue
                ? `${daysLate}d overdue`
                : today
                  ? "Today"
                  : format(due, "MMM d")}
            </span>
          )}
        </div>
      </div>
      {overdue && !isMine && (
        <button
          onClick={onNudge}
          aria-label="Nudge"
          className="rounded-lg bg-warm/20 p-2 text-warm-foreground transition hover:bg-warm/30"
          title={`Nudge ${task.assigned_to}`}
        >
          <Bell className="h-4 w-4" />
        </button>
      )}
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
