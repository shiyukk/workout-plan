// Workout Plan — iOS home-screen widget (Scriptable) · Large · design "A"
// Logs into the same Supabase account as the web app, reads your workout_state,
// and shows three sections on a light "day" card:
//   1. 本周   — a Mon–Sun history strip (colored per muscle block) + count/minutes
//   2. 💪 今日肌肉 — the muscle block you've trained least recently (4-block rotation
//      胸/背/臀腿/核心), its exercises (sets×reps), and an estimated time
//   3. 🏃 有氧 — pick-any cardio options (快走/椭圆/单车/划船/跳绳/HIIT) · 20–30′
//
// SETUP (once):
//   1. Install the free "Scriptable" app from the App Store.
//   2. Scriptable → + → paste this whole file → name it "Workout".
//   3. Run it once inside the app (▶) and enter the email + password you use to log
//      into the web app. They're stored only in this device's iOS Keychain.
//   4. Long-press home screen → + → Scriptable → LARGE → Edit → Script: "Workout".
//   To change the login later: run in-app and pick "重新登录".

// ================= config =================
const SUPABASE_URL = "https://riqebdzoacykfsmlezkp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mI1_Bo2MJ64OH_36g8OiZQ_JFReXQV9";
const K_EMAIL = "wp_email", K_PW = "wp_pw", CACHE_FILE = "workout_widget_cache.json";

// muscle catalog (mirrors index.html DAYS) — [name, sets×reps]
const BLOCKS = {
  legs: { name: "腿 & 臀",   short: "腿", color: "#f2760c", total: 42, ex: [
    ["哑铃高脚杯深蹲", "3×10–12"], ["哑铃罗马尼亚硬拉", "3×10–12"], ["哑铃箭步蹲", "3×每腿10"],
    ["坐姿腿屈伸（伸膝）", "3×12–15"], ["坐姿腿弯举（屈膝）", "3×12–15"] ] },
  push: { name: "胸·肩·三头", short: "胸", color: "#2f6bff", total: 39, ex: [
    ["坐姿推胸器", "3×10–12"], ["上斜哑铃卧推", "3×10–12"], ["坐姿哑铃肩推", "3×10–12"],
    ["哑铃侧平举", "3×12–15"], ["坐姿哑铃臂屈伸", "3×12–15"] ] },
  pull: { name: "背·二头",   short: "背", color: "#12a150", total: 38, ex: [
    ["杠杆下拉机（反握）", "3×10–12"], ["胸垫坐姿划船", "3×10–12"], ["哑铃俯身反向飞鸟", "3×12–15"],
    ["俯身哑铃划船", "3×10–12"], ["哑铃弯举", "3×12–15"] ] },
  abs:  { name: "核心·腹肌", short: "核", color: "#8b3ff0", total: 21, ex: [
    ["仰卧卷腹", "3×15–20"], ["反向卷腹", "3×12–15"], ["俄罗斯转体", "3×每侧12"],
    ["死虫式", "3×每侧8"], ["交替打腿", "3×30秒"], ["平板支撑转体", "3×30–45秒"] ] },
};
const ROTATION = ["legs", "push", "pull", "abs"]; // 4-block rotation incl. core
const CARDIO = { short: "氧", color: "#e11d64", opts: ["快走", "椭圆", "单车", "划船", "跳绳", "HIIT"] };
const WD = ["一", "二", "三", "四", "五", "六", "日"];

// ================= date helpers (match the web app) =================
const pad = n => (n < 10 ? "0" : "") + n;
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const today = () => ymd(new Date());
function mondayOf(s) { const d = new Date(s + "T00:00:00"); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return ymd(d); }
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
function addDays(s, n) { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); }

// ================= credentials =================
const haveCreds = () => Keychain.contains(K_EMAIL) && Keychain.contains(K_PW);
async function promptCreds() {
  const a = new Alert();
  a.title = "登录 Workout Plan";
  a.message = "输入网页版用的邮箱和密码（仅保存在本机 Keychain）";
  a.addTextField("邮箱", Keychain.contains(K_EMAIL) ? Keychain.get(K_EMAIL) : "");
  a.addSecureTextField("密码", "");
  a.addAction("保存"); a.addCancelAction("取消");
  if (await a.present() === -1) return false;
  const email = a.textFieldValue(0).trim(), pw = a.textFieldValue(1);
  if (!email || pw.length < 6) { const e = new Alert(); e.title = "无效"; e.message = "请填邮箱和至少 6 位密码"; e.addAction("好"); await e.present(); return false; }
  Keychain.set(K_EMAIL, email); Keychain.set(K_PW, pw); return true;
}

// ================= data =================
async function signIn(email, pw) {
  const req = new Request(`${SUPABASE_URL}/auth/v1/token?grant_type=password`);
  req.method = "POST";
  req.headers = { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" };
  req.body = JSON.stringify({ email, password: pw });
  const res = await req.loadJSON();
  if (!res || !res.access_token) throw new Error(res && res.msg ? res.msg : "登录失败");
  return res.access_token;
}
async function fetchState(token) {
  const req = new Request(`${SUPABASE_URL}/rest/v1/workout_state?select=data,updated_at`);
  req.headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };
  const rows = await req.loadJSON();
  return (Array.isArray(rows) && rows[0] && rows[0].data) ? rows[0].data : null;
}
function cachePath() { const fm = FileManager.local(); return fm.joinPath(fm.documentsDirectory(), CACHE_FILE); }
function writeCache(o) { try { FileManager.local().writeString(cachePath(), JSON.stringify(o)); } catch (e) {} }
function readCache() { try { const fm = FileManager.local(); const p = cachePath(); if (fm.fileExists(p)) return JSON.parse(fm.readString(p)); } catch (e) {} return null; }
async function loadState() {
  if (haveCreds()) {
    try {
      const token = await signIn(Keychain.get(K_EMAIL), Keychain.get(K_PW));
      const data = await fetchState(token);
      if (data) { writeCache({ state: data }); return { state: data, stale: false }; }
    } catch (e) { /* fall back to cache */ }
  }
  const c = readCache();
  if (c) return { state: c.state, stale: true };
  return null;
}

// ================= derive =================
function derive(state) {
  const sessions = (state && state.sessions) || []; // newest first
  const lastDateOf = k => { const s = sessions.find(x => x.dayKey === k); return s ? s.date : null; };
  let next = ROTATION[0], best = -1;
  for (const k of ROTATION) { const d = lastDateOf(k); const sc = d == null ? 1e9 : daysBetween(d, today()); if (sc > best) { best = sc; next = k; } }
  const mon = mondayOf(today());
  const week = sessions.filter(s => s.date >= mon);
  const mins = week.reduce((a, s) => a + (s.dur || 0), 0);
  // one representative per weekday: prefer a muscle block, else cardio
  const dayCell = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(mon, i);
    const todays = sessions.filter(s => s.date === date);
    const muscle = todays.find(s => BLOCKS[s.dayKey]);
    const cardio = todays.find(s => s.dayKey === "cardio");
    if (muscle) dayCell.push({ short: BLOCKS[muscle.dayKey].short, color: BLOCKS[muscle.dayKey].color });
    else if (cardio) dayCell.push({ short: CARDIO.short, color: CARDIO.color });
    else dayCell.push(null);
    dayCell[i] && (dayCell[i].isToday = date === today());
  }
  const todayIdx = (new Date(today() + "T00:00:00").getDay() + 6) % 7;
  const doneToday = sessions.some(s => s.date === today() && BLOCKS[s.dayKey]); // trained a muscle block today
  return { next, count: week.length, mins, dayCell, todayIdx, doneToday };
}

// ================= color helpers =================
function hx(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function h2(n) { n = Math.max(0, Math.min(255, Math.round(n))); return n.toString(16).padStart(2, "0"); }
function mix(hex, p) { const [r, g, b] = hx(hex); return new Color("#" + h2(r * p + 255 * (1 - p)) + h2(g * p + 255 * (1 - p)) + h2(b * p + 255 * (1 - p))); }

const INK = new Color("#1a1c22"), MUT = new Color("#8a8d96"), FAINT = new Color("#c8cbd2"),
      LINE = new Color("#eef0f3"), EMPTYBG = new Color("#f2f3f5");
function txt(st, s, size, color, w) {
  const t = st.addText(s);
  t.font = w === "b" ? Font.boldSystemFont(size) : w === "sb" ? Font.semiboldSystemFont(size) : w === "m" ? Font.mediumSystemFont(size) : Font.systemFont(size);
  t.textColor = color; return t;
}
function divider(main) { const l = main.addStack(); l.layoutHorizontally(); l.backgroundColor = LINE; l.addSpacer(); l.size = new Size(0, 1); }

// ================= widget (design A, large) =================
const BASE = "https://shiyukk.github.io/workout-plan/";
function buildWidget(d, stale) {
  const b = BLOCKS[d.next];
  const w = new ListWidget();
  const bg = new LinearGradient();
  bg.colors = [new Color("#ffffff"), new Color("#f4f6f9")];
  bg.locations = [0, 1]; bg.startPoint = new Point(0, 0); bg.endPoint = new Point(0, 1);
  w.backgroundGradient = bg;
  w.setPadding(18, 18, 16, 18);
  const CW = 40, CH = 24, CHIPW = 48, CHIPH = 27;
  const main = w.addStack(); main.layoutVertically();

  // ---- 1) 本周 history — tap → history/log ----
  const s1 = main.addStack(); s1.layoutVertically(); s1.url = BASE + "?sec=history";
  const h1 = s1.addStack(); h1.centerAlignContent();
  txt(h1, "本周", 12, MUT, "b");
  h1.addSpacer();
  const rs = h1.addStack(); rs.centerAlignContent();
  txt(rs, String(d.count), 14, INK, "b"); txt(rs, " 练 · " + d.mins + "′", 12.5, MUT, "sb");
  s1.addSpacer(10);
  const week = s1.addStack(); week.layoutHorizontally();
  for (let i = 0; i < 7; i++) {
    if (i > 0) week.addSpacer();
    const col = week.addStack(); col.layoutVertically(); col.centerAlignContent();
    const cell = col.addStack(); cell.layoutHorizontally(); cell.size = new Size(CW, CH); cell.cornerRadius = 9; cell.centerAlignContent();
    const c = d.dayCell[i]; const isToday = i === d.todayIdx;
    let label = "·", tc = FAINT;
    if (isToday && c) { // trained today -> filled + thicker today ring
      cell.backgroundColor = mix(c.color, 0.15); cell.borderWidth = 1.8; cell.borderColor = new Color(c.color); label = c.short; tc = new Color(c.color);
    } else if (isToday) { // not trained yet -> "今" in the recommended color
      cell.backgroundColor = mix(b.color, 0.10); cell.borderWidth = 1.6; cell.borderColor = new Color(b.color); label = "今"; tc = new Color(b.color);
    } else if (c) { // a past day with a session
      cell.backgroundColor = mix(c.color, 0.15); cell.borderWidth = 1; cell.borderColor = mix(c.color, 0.30); label = c.short; tc = new Color(c.color);
    } else { cell.backgroundColor = EMPTYBG; }
    cell.addSpacer(); const ct = cell.addText(label); ct.font = Font.boldSystemFont(12.5); ct.textColor = tc; cell.addSpacer();
    col.addSpacer(5);
    const wdw = col.addStack(); wdw.layoutHorizontally(); wdw.size = new Size(CW, 14); wdw.centerAlignContent();
    wdw.addSpacer(); const wd = wdw.addText(WD[i]); wd.font = Font.semiboldSystemFont(11); wd.textColor = isToday ? new Color(b.color) : new Color("#a6a9b2"); wdw.addSpacer();
  }

  main.addSpacer(); divider(main); main.addSpacer();

  // ---- 2) 💪 muscle — tap → open that block (?day=) ----
  const s2 = main.addStack(); s2.layoutVertically(); s2.url = BASE + "?day=" + d.next;
  const h2s = s2.addStack(); h2s.centerAlignContent();
  const em = d.doneToday ? "✅" : "💪";
  const prefix = d.doneToday ? "明日推荐 · " : "";
  txt(h2s, em + " " + prefix + b.name, 15, new Color(b.color), "b");
  h2s.addSpacer();
  txt(h2s, "≈ " + b.total + "′", 13, MUT, "sb");
  s2.addSpacer(7);
  for (const [name, sr] of b.ex) {
    s2.addSpacer(6);
    const row = s2.addStack(); row.layoutHorizontally(); row.centerAlignContent();
    const tick = row.addStack(); tick.size = new Size(17, 17); tick.cornerRadius = 8.5; tick.borderWidth = 1.7; tick.borderColor = new Color("#cfd3da");
    row.addSpacer(10);
    txt(row, name, 14.5, INK, null);
    row.addSpacer();
    txt(row, sr, 12.5, MUT, null).rightAlignText();
  }

  main.addSpacer(); divider(main); main.addSpacer();

  // ---- 3) 🏃 cardio — tap → cardio section ----
  const s3 = main.addStack(); s3.layoutVertically(); s3.url = BASE + "?sec=cardio";
  const h3 = s3.addStack(); h3.centerAlignContent();
  txt(h3, "🏃 有氧", 15, new Color(CARDIO.color), "b");
  h3.addSpacer();
  txt(h3, "20–30′", 13, MUT, "sb");
  s3.addSpacer(10);
  const chips = s3.addStack(); chips.layoutHorizontally();
  for (let i = 0; i < CARDIO.opts.length; i++) {
    if (i > 0) chips.addSpacer();
    const chip = chips.addStack(); chip.layoutHorizontally(); chip.size = new Size(CHIPW, CHIPH); chip.cornerRadius = 10; chip.centerAlignContent();
    chip.backgroundColor = mix(CARDIO.color, 0.13); chip.borderWidth = 1; chip.borderColor = mix(CARDIO.color, 0.27);
    chip.addSpacer(); const t = chip.addText(CARDIO.opts[i]); t.font = Font.semiboldSystemFont(12.5); t.textColor = new Color(CARDIO.color); chip.addSpacer();
  }

  if (stale) { main.addSpacer(4); const o = main.addText("离线缓存"); o.font = Font.systemFont(9.5); o.textColor = new Color("#f0a020"); }

  w.url = BASE + "?day=" + d.next; // fallback (dividers/gaps): still opens the app at today's block, directly in the browser
  const next = new Date(); next.setMinutes(next.getMinutes() + 30); w.refreshAfterDate = next;
  return w;
}

function buildError(msg) {
  const w = new ListWidget();
  w.backgroundColor = new Color("#ffffff"); w.setPadding(18, 18, 18, 18);
  txt(w, "💪 Workout", 13, MUT, "sb"); w.addSpacer(8);
  txt(w, msg, 14, INK, null); w.addSpacer(6);
  txt(w, "在 Scriptable 里运行一次以登录", 11, MUT, null);
  return w;
}

// ================= main =================
async function main() {
  if (config.runsInApp) {
    if (!haveCreds()) await promptCreds();
    else {
      const a = new Alert();
      a.title = "Workout Widget"; a.message = "已保存登录。";
      a.addAction("预览 Widget"); a.addAction("重新登录"); a.addCancelAction("关闭");
      if (await a.present() === 1) await promptCreds();
    }
  }
  const loaded = await loadState();
  const widget = loaded ? buildWidget(derive(loaded.state), loaded.stale)
                        : buildError(haveCreds() ? "读取失败" : "尚未登录");
  if (config.runsInApp) await widget.presentLarge();
  Script.setWidget(widget);
  Script.complete();
}
await main();
