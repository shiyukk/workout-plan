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
// Rendered as a flat DrawContext image + a single ListWidget.url — the same approach
// as the schedule-planner widget, which opens its URL directly on tap. Nested-stack
// widgets on some Scriptable builds route the tap through the app first; a flat image
// with one url does not.
const BASE = "https://shiyukk.github.io/workout-plan/";

function dtext(ctx, s, x, y, w, size, color, weight, align) {
  ctx.setFont(weight === "b" ? Font.boldSystemFont(size) : weight === "sb" ? Font.semiboldSystemFont(size) : Font.systemFont(size));
  ctx.setTextColor(color);
  if (align === "r") ctx.setTextAlignedRight(); else if (align === "c") ctx.setTextAlignedCenter(); else ctx.setTextAlignedLeft();
  ctx.drawTextInRect(String(s), new Rect(x, y, w, size + 7));
}
function roundedFill(ctx, x, y, w, h, r, fill, stroke, lw) {
  const p = new Path(); p.addRoundedRect(new Rect(x, y, w, h), r, r);
  ctx.addPath(p); ctx.setFillColor(fill); ctx.fillPath();
  if (stroke) { const p2 = new Path(); p2.addRoundedRect(new Rect(x + lw / 2, y + lw / 2, w - lw, h - lw), r, r); ctx.addPath(p2); ctx.setStrokeColor(stroke); ctx.setLineWidth(lw); ctx.strokePath(); }
}
function fitText(str, maxW, size) {
  let wsum = 0, out = "";
  for (const ch of String(str)) {
    const cw = /[\x00-\xff]/.test(ch) ? size * 0.56 : size;
    if (wsum + cw > maxW) return out + "…";
    wsum += cw; out += ch;
  }
  return out;
}

function buildWidget(d, stale) {
  const b = BLOCKS[d.next];
  const W = 329, H = 345, PAD = 14, RIGHT = W - PAD, CW = 301;
  const ctx = new DrawContext();
  ctx.size = new Size(W, H); ctx.opaque = false; ctx.respectScreenScale = true;
  ctx.setFillColor(new Color("#fbfcfd")); ctx.fillRect(new Rect(0, 0, W, H)); // light "day" bg

  // ---- 1) 本周 history ----
  dtext(ctx, stale ? "本周 · 离线" : "本周", PAD, 16, 160, 11, MUT, "b", "l");
  dtext(ctx, d.count + " 练 · " + d.mins + "′", RIGHT - 170, 16, 170, 11.5, new Color("#3a3d45"), "sb", "r");
  const cellW = 37, cgap = 6, cy = 38, ch = 24;
  const wStart = PAD + (CW - (7 * cellW + 6 * cgap)) / 2;
  for (let i = 0; i < 7; i++) {
    const x = wStart + i * (cellW + cgap);
    const c = d.dayCell[i], isToday = i === d.todayIdx;
    let label = "·", tcol = FAINT;
    if (isToday && c) { roundedFill(ctx, x, cy, cellW, ch, 8, mix(c.color, 0.15), new Color(c.color), 1.8); label = c.short; tcol = new Color(c.color); }
    else if (isToday) { roundedFill(ctx, x, cy, cellW, ch, 8, mix(b.color, 0.10), new Color(b.color), 1.6); label = "今"; tcol = new Color(b.color); }
    else if (c) { roundedFill(ctx, x, cy, cellW, ch, 8, mix(c.color, 0.15), mix(c.color, 0.34), 1); label = c.short; tcol = new Color(c.color); }
    else { roundedFill(ctx, x, cy, cellW, ch, 8, EMPTYBG, null, 0); }
    dtext(ctx, label, x, cy + 6, cellW, 11, tcol, "b", "c");
    dtext(ctx, WD[i], x, cy + ch + 6, cellW, 9.5, isToday ? new Color(b.color) : new Color("#a6a9b2"), "sb", "c");
  }

  ctx.setFillColor(LINE); ctx.fillRect(new Rect(PAD, 92, CW, 1)); // divider

  // ---- 2) 💪 muscle ----
  const head = (d.doneToday ? "✅ 明日推荐 · " : "💪 ") + b.name;
  dtext(ctx, fitText(head, 205, 13), PAD, 103, 210, 13, new Color(b.color), "b", "l");
  dtext(ctx, "≈ " + b.total + "′", RIGHT - 82, 104, 82, 12, MUT, "sb", "r");
  const exTop = 126, exBot = 270, n = b.ex.length, rowH = (exBot - exTop) / n;
  for (let i = 0; i < n; i++) {
    const midY = exTop + i * rowH + rowH / 2;
    const ring = new Path(); ring.addEllipse(new Rect(PAD, midY - 7.5, 15, 15));
    ctx.addPath(ring); ctx.setStrokeColor(new Color("#cfd3da")); ctx.setLineWidth(1.6); ctx.strokePath();
    dtext(ctx, fitText(b.ex[i][0], 180, 13), PAD + 24, midY - 9, 190, 13, INK, null, "l");
    dtext(ctx, b.ex[i][1], RIGHT - 92, midY - 8, 92, 11.5, MUT, null, "r");
  }

  ctx.setFillColor(LINE); ctx.fillRect(new Rect(PAD, 280, CW, 1)); // divider

  // ---- 3) 🏃 cardio ----
  dtext(ctx, "🏃 有氧", PAD, 288, 160, 13, new Color(CARDIO.color), "b", "l");
  dtext(ctx, "20–30′", RIGHT - 80, 289, 80, 12, MUT, "sb", "r");
  const chn = CARDIO.opts.length, chgap = 6, chw = (CW - (chn - 1) * chgap) / chn, chy = 309, chh = 25;
  for (let i = 0; i < chn; i++) {
    const x = PAD + i * (chw + chgap);
    roundedFill(ctx, x, chy, chw, chh, 9, mix(CARDIO.color, 0.13), mix(CARDIO.color, 0.30), 1);
    dtext(ctx, CARDIO.opts[i], x, chy + 6, chw, 11, new Color(CARDIO.color), "sb", "c");
  }

  const w = new ListWidget();
  w.backgroundColor = new Color("#fbfcfd");
  w.setPadding(0, 0, 0, 0);
  w.backgroundImage = ctx.getImage();
  w.url = BASE + "?day=" + d.next; // tap → open the app at today's block, directly
  const nx = new Date(); nx.setMinutes(nx.getMinutes() + 30); w.refreshAfterDate = nx;
  return w;
}

function buildError(msg) {
  const w = new ListWidget();
  w.backgroundColor = new Color("#fbfcfd"); w.setPadding(18, 18, 18, 18);
  txt(w, "💪 Workout", 13, MUT, "sb"); w.addSpacer(8);
  txt(w, msg, 14, INK, null); w.addSpacer(6);
  txt(w, "在 Scriptable 里运行一次以登录", 11, MUT, null);
  w.url = BASE;
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
  if (config.runsInWidget) Script.setWidget(widget);
  else await widget.presentLarge();
  Script.complete();
}
await main();
