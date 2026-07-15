# Workout Plan

A single-page personal workout plan: a 3-day split + a core day + cardio, with animated exercise demos, step-by-step instructions, weight logging with progressive-overload suggestions, a pausable session timer, history, and adaptive tips.

https://shiyukk.github.io/workout-plan/

## Features

- **4 training days** — Legs & Glutes / Push / Pull / Core, plus a **Cardio** section. Rotate freely; no fixed weekly schedule.
- **Per exercise** — animated demo GIF, Chinese step-by-step instructions, sets × reps × rest, and a time estimate. Each day shows a total time estimate.
- **Weight logging + smart suggestions** — record the weight used and how it felt (easy / just-right / hard); the app suggests the next weight using progressive overload.
- **Check-in with a pausable timer**, plus a training history log.
- **Period mode** — one tap lightens the plan (fewer sets, hold weight).
- **Adaptive insights** — frequency, cardio, weight progress, and pacing tips based on your logs.
- **Light/dark themes**, and **export/import backup**.
- **Cloud sync** — log in on any device to sync automatically.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The app, served by GitHub Pages. Reads cloud config from `config.js`. |
| `workout-plan.html` | Local-only version (no login/sync) — open the file directly if you just want it offline. |
| `config.js` | Supabase Project URL + publishable key. Empty = local-only mode. |
| `.gitignore` | — |

## Cloud sync setup (optional)

Cross-device sync uses a free [Supabase](https://supabase.com) project; the site is hosted free on GitHub Pages.

1. **Create the database.** In Supabase → SQL Editor, run:

   ```sql
   create table if not exists public.workout_state (
     user_id uuid primary key references auth.users(id) on delete cascade,
     data jsonb,
     updated_at timestamptz default now()
   );
   alter table public.workout_state enable row level security;
   create policy "own row read"   on public.workout_state for select using (auth.uid() = user_id);
   create policy "own row insert" on public.workout_state for insert with check (auth.uid() = user_id);
   create policy "own row update" on public.workout_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
   ```

2. **Add your keys.** Put your **Project URL** and **publishable/anon key** (Project Settings → API) into `config.js`.
3. **Host it.** Repo Settings → Pages → Deploy from branch → `main` / `root`.
4. Open the site → top-right cloud icon → sign up / log in. Log in with the same account on any device to sync.

**Security:** the publishable/anon key is meant to be public; Row Level Security ensures each user can only read/write their own row. Never commit the `service_role` (secret) key. To stop others from creating accounts, disable "Allow new users to sign up" in Supabase after registering.

## Tech notes

- Single self-contained HTML file, no build step. Exercise GIFs are embedded as base64 data URIs (compressed to 140px).
- Cloud sync uses `supabase-js` (loaded from CDN); state is stored as one JSON blob per user and pushed on change (debounced), pulled on login.

## Data & attribution

Exercise GIFs and multilingual instructions come from the open-source [exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (MIT). GIFs © Gym Visual, redistributed at 180×180 with permission.

For personal use and informational purposes only — not medical or professional fitness advice. Consult a doctor if you have any injury or health condition.
