const STORAGE_KEY = "aks-timer-entries";
const WEEKDAYS = ["søn","man","tir","ons","tor","fre","lør"];
const MONTHS = ["januar","februar","mars","april","mai","juni","juli","august","september","oktober","november","desember"];

let entries = load();
let editingNoteId = null;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
  catch (e) { console.error("Kunne ikke lagre:", e); }
}

function todayStr() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function isoWeek(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7) + "-" + d.getFullYear();
}
function isoWeekNumber(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
function toDateStr(d) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
function getMonday(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toDateStr(d);
}
function shortDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

function render() {
  const list = document.getElementById("list");
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  // summaries
  const today = todayStr();
  const curMonth = today.slice(0, 7);
  const curWeek = isoWeek(today);
  const sumMonth = sorted.filter(e => e.date.slice(0,7) === curMonth).reduce((s,e) => s + e.hours, 0);
  const sumWeek = sorted.filter(e => isoWeek(e.date) === curWeek).reduce((s,e) => s + e.hours, 0);
  document.getElementById("sumMonth").textContent = fmt(sumMonth);
  document.getElementById("sumWeek").textContent = fmt(sumWeek);
  document.getElementById("sumCount").textContent = entries.length;

  if (sorted.length === 0) {
    list.innerHTML = '<div class="empty">Ingen vakter registrert ennå.</div>';
    return;
  }

  let html = "";
  let lastMonthKey = null;
  const groups = [];
  let curGroup = null;
  for (const e of sorted) {
    const mk = e.date.slice(0, 7);
    if (mk !== lastMonthKey) {
      curGroup = { key: mk, items: [], sum: 0 };
      groups.push(curGroup);
      lastMonthKey = mk;
    }
    curGroup.items.push(e);
    curGroup.sum += e.hours;
  }

  for (const g of groups) {
    const [y, m] = g.key.split("-");
    html += `<div class="month-title"><span>${MONTHS[parseInt(m,10)-1]} ${y}</span><span>${fmt(g.sum)} t</span></div>`;
    html += '<div class="card" style="padding:0;">';
    for (const e of g.items) {
      const d = new Date(e.date + "T00:00:00");
      const noteHtml = e.id === editingNoteId
        ? `<input type="text" class="note-input" data-id="${e.id}" value="${escapeHtml(e.note || "")}" placeholder="Navn" autofocus>`
        : e.note
          ? `<button type="button" class="note note-set" data-id="${e.id}">${escapeHtml(e.note)}</button>`
          : `<button type="button" class="note note-empty" data-id="${e.id}">+ navn</button>`;
      html += `
        <div class="entry">
          <div class="date">
            <div class="wd">${WEEKDAYS[d.getDay()]}</div>
            <div class="dm">${d.getDate()}.${d.getMonth()+1}</div>
          </div>
          ${noteHtml}
          <div class="hours">${fmt(e.hours)} t</div>
          <button class="del" data-id="${e.id}" aria-label="Slett">✕</button>
        </div>`;
    }
    html += "</div>";
  }
  list.innerHTML = html;

  list.querySelectorAll(".del").forEach(btn => {
    btn.addEventListener("click", () => {
      entries = entries.filter(e => e.id !== btn.dataset.id);
      save();
      render();
    });
  });

  list.querySelectorAll(".note-set, .note-empty").forEach(btn => {
    btn.addEventListener("click", () => {
      editingNoteId = btn.dataset.id;
      render();
    });
  });

  const noteInput = list.querySelector(".note-input");
  if (noteInput) {
    noteInput.focus();
    noteInput.setSelectionRange(noteInput.value.length, noteInput.value.length);
    const commit = () => {
      const entry = entries.find(e => e.id === noteInput.dataset.id);
      if (entry) entry.note = noteInput.value.trim();
      editingNoteId = null;
      save();
      render();
    };
    noteInput.addEventListener("blur", commit);
    noteInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); noteInput.blur(); }
      if (ev.key === "Escape") { editingNoteId = null; render(); }
    });
  }
}

function fmt(n) {
  return (Math.round(n * 100) / 100).toString().replace(".", ",");
}
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

document.getElementById("date").value = todayStr();

document.getElementById("entryForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const date = document.getElementById("date").value;
  const hours = parseFloat(document.getElementById("hours").value);
  const note = document.getElementById("note").value.trim();
  if (!date || isNaN(hours) || hours <= 0) return;

  entries.push({ id: crypto.randomUUID(), date, hours, note });
  save();
  render();

  document.getElementById("hours").value = "";
  document.getElementById("note").value = "";
  document.getElementById("date").value = todayStr();
  document.getElementById("hours").focus();
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let csv = "Dato;Timer;Notat\n";
  for (const e of sorted) {
    csv += `${e.date};${fmt(e.hours)};${(e.note||"").replace(/;/g, ",")}\n`;
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "aks-timer.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ---- Batch/ukevisning ----
let currentWeekStart = getMonday(todayStr());

function entriesForDate(dateStr) {
  return entries.filter(e => e.date === dateStr);
}

function renderBatch() {
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  const wn = isoWeekNumber(currentWeekStart);
  document.getElementById("weekLabel").textContent =
    `Uke ${wn} · ${shortDate(weekDates[0])}–${shortDate(weekDates[6])}`;

  const today = todayStr();
  const rows = document.getElementById("weekRows");
  rows.innerHTML = weekDates.map(date => {
    const existing = entriesForDate(date);
    const sum = existing.reduce((s, e) => s + e.hours, 0);
    const d = new Date(date + "T00:00:00");
    return `
      <div class="week-row${date === today ? " is-today" : ""}" data-date="${date}">
        <div class="wr-date">
          <div class="wd">${WEEKDAYS[d.getDay()]}</div>
          <div class="dm">${d.getDate()}.${d.getMonth()+1}</div>
        </div>
        <input type="number" class="wr-hours" step="0.25" min="0" max="24" inputmode="decimal"
               placeholder="–" value="${sum > 0 ? fmt(sum).replace(",", ".") : ""}">
        <button type="button" class="wr-clear" data-date="${date}" aria-label="Fjern">✕</button>
      </div>`;
  }).join("");

  const weekSum = weekDates.reduce((s, date) => s + entriesForDate(date).reduce((s2, e) => s2 + e.hours, 0), 0);
  document.getElementById("weekTotal").textContent = fmt(weekSum) + " t";

  rows.querySelectorAll(".wr-clear").forEach(btn => {
    btn.addEventListener("click", () => {
      const date = btn.dataset.date;
      entries = entries.filter(e => e.date !== date);
      save();
      render();
      renderBatch();
    });
  });
}

document.getElementById("modeSingleBtn").addEventListener("click", () => {
  document.getElementById("modeSingleBtn").classList.add("active");
  document.getElementById("modeBatchBtn").classList.remove("active");
  document.getElementById("entryForm").style.display = "";
  document.getElementById("batchView").style.display = "none";
});
document.getElementById("modeBatchBtn").addEventListener("click", () => {
  document.getElementById("modeBatchBtn").classList.add("active");
  document.getElementById("modeSingleBtn").classList.remove("active");
  document.getElementById("entryForm").style.display = "none";
  document.getElementById("batchView").style.display = "";
  renderBatch();
});
document.getElementById("prevWeekBtn").addEventListener("click", () => {
  currentWeekStart = addDays(currentWeekStart, -7);
  renderBatch();
});
document.getElementById("nextWeekBtn").addEventListener("click", () => {
  currentWeekStart = addDays(currentWeekStart, 7);
  renderBatch();
});
document.getElementById("saveWeekBtn").addEventListener("click", () => {
  document.querySelectorAll("#weekRows .week-row").forEach(row => {
    const date = row.dataset.date;
    const input = row.querySelector(".wr-hours");
    const val = parseFloat(input.value);
    if (input.value.trim() === "" || isNaN(val) || val <= 0) return;
    entries = entries.filter(e => e.date !== date);
    entries.push({ id: crypto.randomUUID(), date, hours: val, note: "" });
  });
  save();
  render();
  renderBatch();
});

render();
