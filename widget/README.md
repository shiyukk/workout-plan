# iPhone widget (Scriptable)

A **large** home-screen widget for the workout app (design "A", light "day" card). It
logs into the **same Supabase account** as the web app, reads your `workout_state` row,
and shows three sections:

- **本周** — a Mon–Sun history strip, each day colored per muscle block (腿/胸/背/核/氧),
  plus this week's session count and total minutes
- **💪 今日肌肉** — the block you've trained least recently in a 4-block rotation
  (胸/背/臀腿/核心), its exercises with sets×reps, and an estimated time
- **🏃 有氧** — pick-any cardio options (快走/椭圆/单车/划船/跳绳/HIIT) · 20–30′
- an "离线缓存" note when it falls back to the last cached data

No Xcode, no Apple Developer account — it runs in the free **Scriptable** app.
Add it at **Large** size.

### Tapping (deep links)

The large widget has three tap zones, each opening the web app scrolled + briefly
highlighted to the matching section:

- **本周 history** → the training log (`?sec=history`)
- **💪 muscle** → today's recommended block, ready to check in (`?day=<key>`)
- **🏃 cardio** → the cardio section (`?sec=cardio`)

Deep-link handling lives in `index.html`; the widget just points each zone at the
right URL. (`workout-plan.html`, the offline copy, is not deep-link aware.)

When you've already trained a muscle block today, the muscle header switches to
**✅ 明日推荐 · X** and today's history cell shows what you did.

## Install (once)

1. Install **[Scriptable](https://apps.apple.com/app/scriptable/id1405459188)** (free) from the App Store.
2. Open Scriptable → tap **+** → paste the contents of [`WorkoutWidget.js`](./WorkoutWidget.js) → name it **Workout**.
3. **Run it once inside the app** (▶). It asks for the email + password you use to log
   into the web app. These are stored only in this device's iOS Keychain and are sent
   only to Supabase's own login endpoint — the same one the website uses.
4. Long-press the home screen → **+** → **Scriptable** → choose **Small** or **Medium** →
   add it → tap the widget → **Edit Widget** → **Script: Workout**.

## Notes

- Tapping the widget opens the web app.
- It refreshes about every 30 min (iOS decides the exact timing).
- To change the saved login: run the script in-app and pick **重新登录**.
- The Supabase URL + publishable key are baked in (they're public by design; Row Level
  Security means the login only ever exposes your own row).
