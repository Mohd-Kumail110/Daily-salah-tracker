/* =============================================================
   Salah Tracker
   Single state object -> render(). Local-storage keyed per day
   (salah:day:YYYY-MM-DD) plus one settings record (salah:settings)
   holding default prayer times and the charity amount so you
   don't have to re-enter them every day.
   ============================================================= */

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const DEFAULT_TIMES = { Fajr: "05:00", Dhuhr: "13:15", Asr: "16:30", Maghrib: "18:00", Isha: "20:00" };
const DAY_KEY_PREFIX = "salah:day:";
const SETTINGS_KEY = "salah:settings";
// Timeline plots the day from 04:00 to 22:00.
const TIMELINE_START_MIN = 4 * 60;
const TIMELINE_END_MIN = 22 * 60;

const els = {};
let settings = loadSettings();
let today = loadDay(dateKey(new Date()));

// ---------- storage ----------

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { charityPerMissed: 10, times: { ...DEFAULT_TIMES }, ...JSON.parse(raw) };
  } catch (e) {
    console.error("Could not read settings", e);
  }
  return { charityPerMissed: 10, times: { ...DEFAULT_TIMES } };
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadDay(key) {
  try {
    const raw = localStorage.getItem(DAY_KEY_PREFIX + key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Could not read day", key, e);
  }
  const prayers = {};
  PRAYERS.forEach((name) => {
    prayers[name] = { time: settings.times[name] || DEFAULT_TIMES[name], status: "pending" };
  });
  return { date: key, prayers };
}

function saveDay(day) {
  localStorage.setItem(DAY_KEY_PREFIX + day.date, JSON.stringify(day));
}

// ---------- derived data ----------

function summarize(day) {
  let prayed = 0, missed = 0, pending = 0;
  PRAYERS.forEach((name) => {
    const st = day.prayers[name].status;
    if (st === "prayed") prayed++;
    else if (st === "missed") missed++;
    else pending++;
  });
  return { prayed, missed, pending, charity: missed * (Number(settings.charityPerMissed) || 0) };
}

function minutesOf(timeStr) {
  const [h, m] = (timeStr || "").split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function timelinePct(mins) {
  const span = TIMELINE_END_MIN - TIMELINE_START_MIN;
  return Math.min(100, Math.max(0, ((mins - TIMELINE_START_MIN) / span) * 100));
}

// ---------- rendering ----------

function renderHeader() {
  const now = new Date();
  els.todayDate.textContent = now.toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "short", day: "numeric",
  });
  els.todayDow.textContent = now.toLocaleDateString(undefined, { weekday: "short" });
}

function renderTally() {
  const s = summarize(today);
  els.prayedCount.textContent = s.prayed;
  els.missedCount.textContent = s.missed;
  els.pendingCount.textContent = s.pending;
  els.charityToday.textContent = s.charity;
}

function renderPrayerRows() {
  els.rows.forEach((row) => {
    const name = row.dataset.prayer;
    const entry = today.prayers[name];

    const timeInput = row.querySelector(".prayer-time");
    if (document.activeElement !== timeInput) timeInput.value = entry.time;

    row.dataset.currentStatus = entry.status;

    const statusWord = row.querySelector("[data-status-text]");
    statusWord.textContent = entry.status === "prayed" ? "Prayed"
      : entry.status === "missed" ? "Missed"
      : "Pending";

    row.querySelectorAll(".btn-status").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.status === entry.status);
    });
  });
}

function renderTimeline() {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const w = 600, y = 40, left = 22, right = 578;

  let markers = "";
  let nextName = null, nextMins = Infinity;

  PRAYERS.forEach((name) => {
    const mins = minutesOf(today.prayers[name].time);
    if (mins === null) return;
    const x = left + (timelinePct(mins) / 100) * (right - left);
    const status = today.prayers[name].status;
    const fill = status === "prayed" ? "var(--prayed)" : status === "missed" ? "var(--missed)" : "var(--bg)";
    const stroke = status === "prayed" ? "var(--prayed)" : status === "missed" ? "var(--missed)" : "var(--gold)";
    markers += `
      <circle cx="${x}" cy="${y}" r="7" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />
      <text x="${x}" y="${y - 16}" text-anchor="middle" fill="var(--muted)" font-size="11" font-family="Inter, sans-serif">${name}</text>
      <text x="${x}" y="${y + 26}" text-anchor="middle" fill="var(--muted-dim)" font-size="10" font-family="Inter, sans-serif">${today.prayers[name].time}</text>
    `;

    if (mins > nowMins && mins < nextMins && dateKey(now) === today.date) {
      nextMins = mins;
      nextName = name;
    }
  });

  let nowMarker = "";
  if (dateKey(now) === today.date && nowMins >= TIMELINE_START_MIN && nowMins <= TIMELINE_END_MIN) {
    const nx = left + (timelinePct(nowMins) / 100) * (right - left);
    nowMarker = `<line x1="${nx}" y1="8" x2="${nx}" y2="72" stroke="var(--gold)" stroke-width="1" stroke-dasharray="2 3" />`;
  }

  els.timelineSvg.innerHTML = `
    <line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="var(--teal-line)" stroke-width="1.5" />
    ${nowMarker}
    ${markers}
  `;

  if (dateKey(now) !== today.date) {
    els.timelineCaption.innerHTML = `Viewing a saved day.`;
  } else if (nextName) {
    const diff = nextMins - nowMins;
    const h = Math.floor(diff / 60), m = diff % 60;
    els.timelineCaption.innerHTML = `Next: <strong>${nextName}</strong> at ${today.prayers[nextName].time} &middot; <span class="countdown">${h}h ${m}m</span>`;
  } else {
    els.timelineCaption.textContent = "No Salah left on today's timetable.";
  }
}

function renderWeek() {
  const now = new Date();
  const todayKey = dateKey(now);
  let html = "";

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = dateKey(d);
    const raw = localStorage.getItem(DAY_KEY_PREFIX + key);
    const dayData = raw ? JSON.parse(raw) : null;

    const dots = PRAYERS.map((name) => {
      const st = dayData?.prayers?.[name]?.status;
      const cls = st === "prayed" ? "prayed" : st === "missed" ? "missed" : "";
      return `<span class="${cls}"></span>`;
    }).join("");

    html += `
      <div class="week-day${key === todayKey ? " is-today" : ""}">
        <span class="dow">${d.toLocaleDateString(undefined, { weekday: "narrow" })}</span>
        <span class="dom">${d.getDate()}</span>
        <div class="week-dots">${dots}</div>
      </div>
    `;
  }

  els.weekGrid.innerHTML = html;
}

function render() {
  renderTally();
  renderPrayerRows();
  renderTimeline();
  renderWeek();
}

// ---------- events ----------

function handleStatusClick(e) {
  const btn = e.target.closest(".btn-status");
  if (!btn) return;
  const row = btn.closest(".prayer-row");
  const name = row.dataset.prayer;
  today.prayers[name].status = btn.dataset.status;
  saveDay(today);
  row.classList.remove("just-set");
  void row.offsetWidth; // restart animation
  row.classList.add("just-set");
  render();
}

function handleTimeChange(e) {
  if (!e.target.classList.contains("prayer-time")) return;
  const row = e.target.closest(".prayer-row");
  const name = row.dataset.prayer;
  today.prayers[name].time = e.target.value;
  settings.times[name] = e.target.value; // remembered as tomorrow's default
  saveDay(today);
  saveSettings();
  renderTimeline();
}

function handleCharityChange(e) {
  const val = Number(e.target.value);
  settings.charityPerMissed = Number.isNaN(val) ? 0 : val;
  saveSettings();
  renderTally();
}

// ---------- init ----------

function cacheEls() {
  els.todayDate = document.getElementById("todayDate");
  els.todayDow = document.getElementById("todayDow");
  els.prayedCount = document.getElementById("prayedCount");
  els.missedCount = document.getElementById("missedCount");
  els.pendingCount = document.getElementById("pendingCount");
  els.charityToday = document.getElementById("charityToday");
  els.timelineSvg = document.getElementById("timelineSvg");
  els.timelineCaption = document.getElementById("timelineCaption");
  els.weekGrid = document.getElementById("weekGrid");
  els.charityInput = document.getElementById("charityPerMissed");
  els.rows = document.querySelectorAll(".prayer-row");
  els.prayerList = document.querySelector(".prayer-list");
}

function init() {
  cacheEls();
  renderHeader();

  els.charityInput.value = settings.charityPerMissed;
  els.charityInput.addEventListener("input", handleCharityChange);

  els.prayerList.addEventListener("click", handleStatusClick);
  els.prayerList.addEventListener("change", handleTimeChange);

  render();
  setInterval(renderTimeline, 60000); // refresh the countdown every minute
}

document.addEventListener("DOMContentLoaded", init);
