# Family Tracker — Upgrade Plan

Based on your answers (you + Adrian + Gabi, planning across day/week/month/year, recurring chores, and *please nag Adrian so you don't have to*), here's what I'll build:

## 1. Recurring tasks ♻️
Add a "Repeats" option when creating a task:
- None / Daily / Weekly (pick day) / Monthly (pick date) / Yearly
- When someone marks a recurring task done, the next occurrence auto-generates with the new due date
- Example: "Take out trash bins" every Tuesday → checks off Tuesday, reappears for next Tuesday automatically

## 2. Time-horizon views 📅
Instead of one flat list, add tabs:
- **Today** — what's due today + overdue
- **This Week** — grouped by day
- **This Month** — calendar-ish view
- **Someday / Year** — long-term goals (e.g. "book Gabi's birthday venue")

Filter-by-person dropdown stays and works across all views.

## 3. Auto-nagging system 🔔 (the fun part)
Two layers so Adrian can't escape:

**a. In-app nagging (always on, no setup):**
- Overdue tasks get a red "X days overdue" badge + gentle shake animation
- Home screen shows a friendly nag banner: *"Adrian has 2 overdue chores 👀"*
- A "Nudge" button next to each person's overdue tasks (logs a nudge count — playful pressure)

**b. Email reminders (optional, needs ~5 min setup):**
- Daily morning digest to each family member: "Here's what you owe the family today"
- Overdue escalation: if a task is 2+ days late, send a reminder email
- Runs on a scheduled job in the background

> For email I'll need to set up an email domain (one-time, ~5 min of DNS records at your registrar). If you'd rather skip that for now, in-app nagging alone is already pretty effective — we can add email later.

## 4. Warm & cozy redesign 🏡
- Palette: warm cream background, terracotta + sage accents, soft browns for text (think "kitchen on a Sunday morning")
- Typography: a friendly serif for headings (DM Serif Display), clean sans for body (Work Sans)
- Rounded cards, soft shadows, subtle paper texture
- Small delightful touches: a tiny illustration when the list is empty ("All caught up! ☕"), gentle confetti when Gabi (or anyone) completes a task

## Technical notes
- Recurring logic via a `recurrence_rule` column on `tasks` + a DB function that spawns the next instance on completion
- Email reminders via a scheduled job (pg_cron) hitting a server route that queries overdue tasks and sends via Lovable's email system
- All new tables/columns RLS-scoped to your family

## One question before I start
**Email reminders — do you want them now, or start with in-app nagging only and add email later?**

Reply "email now" (I'll walk you through the 5-min domain setup) or "in-app only" (I'll skip email and we ship faster).