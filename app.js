const STORAGE_KEY = "ninetofiveish-entries";
const WEEKDAYS = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
const MONTHS = [
  "januar",
  "februar",
  "mars",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "desember",
];

// Eldre nøkler fra før rebrand – data herfra flettes inn ved oppstart
const LEGACY_KEYS = ["aks-timer-entries"];

let entries = load();
let editingNoteId = null;

function readKey(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  // Ugyldig innhold: ta vare på det i stedet for å overskrive det ved neste lagring
  localStorage.setItem(`${key}-corrupt-${Date.now()}`, raw);
  return [];
}
// Fletter to lister per id – nyeste updatedAt vinner. Slettede oppføringer
// beholdes som tombstones (deleted: true) så slettingen også synkes.
function mergeEntries(a, b) {
  const byId = new Map();
  for (const e of [...a, ...b]) {
    const cur = byId.get(e.id);
    if (!cur || (e.updatedAt || 0) > (cur.updatedAt || 0)) byId.set(e.id, e);
  }
  return [...byId.values()];
}
function load() {
  try {
    let merged = [];
    for (const key of [...LEGACY_KEYS, STORAGE_KEY]) {
      merged = mergeEntries(merged, readKey(key));
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch (e) {
    console.error("Kunne ikke laste:", e);
    return [];
  }
}
function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.error("Kunne ikke lagre:", e);
    alert("Kunne ikke lagre! Eksporter dataene dine som backup.");
  }
}
function save() {
  saveLocal();
  scheduleSync();
}

function touch(e, changes = {}) {
  return { ...e, ...changes, updatedAt: Date.now() };
}
function visible() {
  return entries.filter((e) => !e.deleted);
}
function removeWhere(pred) {
  entries = entries.map((e) =>
    !e.deleted && pred(e) ? touch(e, { deleted: true }) : e,
  );
}

// Be nettleseren om å ikke slette data automatisk ved lite lagringsplass
navigator.storage?.persist?.();

function todayStr() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function isoWeek(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return (
    Math.ceil(((d - yearStart) / 86400000 + 1) / 7) + "-" + d.getFullYear()
  );
}
function isoWeekNumber(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
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
  const sorted = visible().sort((a, b) => b.date.localeCompare(a.date));

  // summaries
  const today = todayStr();
  const curMonth = today.slice(0, 7);
  const curWeek = isoWeek(today);
  const sumMonth = sorted
    .filter((e) => e.date.slice(0, 7) === curMonth)
    .reduce((s, e) => s + e.hours, 0);
  const sumWeek = sorted
    .filter((e) => isoWeek(e.date) === curWeek)
    .reduce((s, e) => s + e.hours, 0);
  document.getElementById("sumMonth").textContent = fmt(sumMonth);
  document.getElementById("sumWeek").textContent = fmt(sumWeek);
  document.getElementById("sumCount").textContent = sorted.length;

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
    html += `<div class="month-title"><span>${MONTHS[parseInt(m, 10) - 1]} ${y}</span><span>${fmt(g.sum)} t</span></div>`;
    html += '<div class="card" style="padding:0;">';
    // Ukesum innenfor måneden – en uke som krysser månedsskiftet vises
    // med sin del under hver måned
    const weekSums = new Map();
    for (const e of g.items) {
      const wn = isoWeekNumber(e.date);
      weekSums.set(wn, (weekSums.get(wn) || 0) + e.hours);
    }
    let lastWeek = null;
    for (const e of g.items) {
      const wn = isoWeekNumber(e.date);
      if (wn !== lastWeek) {
        html += `<div class="week-head"><span>Uke ${wn}</span><span>${fmt(weekSums.get(wn))} t</span></div>`;
        lastWeek = wn;
      }
      const d = new Date(e.date + "T00:00:00");
      const noteHtml =
        e.id === editingNoteId
          ? `<input type="text" class="note-input" data-id="${e.id}" value="${escapeHtml(e.note || "")}" placeholder="Navn" autofocus>`
          : e.note
            ? `<button type="button" class="note note-set" data-id="${e.id}">${escapeHtml(e.note)}</button>`
            : `<button type="button" class="note note-empty" data-id="${e.id}">+ navn</button>`;
      html += `
        <div class="entry">
          <div class="date">
            <div class="wd">${WEEKDAYS[d.getDay()]}</div>
            <div class="dm">${d.getDate()}.${d.getMonth() + 1}</div>
          </div>
          ${noteHtml}
          <div class="hours">${fmt(e.hours)} t</div>
          <button class="del" data-id="${e.id}" aria-label="Slett">✕</button>
        </div>`;
    }
    html += "</div>";
  }
  list.innerHTML = html;

  list.querySelectorAll(".del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const before = entries;
      removeWhere((e) => e.id === btn.dataset.id);
      save();
      render();
      showUndo("Oppføring slettet", before);
    });
  });

  list.querySelectorAll(".note-set, .note-empty").forEach((btn) => {
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
      const id = noteInput.dataset.id;
      const note = noteInput.value.trim();
      entries = entries.map((e) =>
        e.id === id && e.note !== note ? touch(e, { note }) : e,
      );
      editingNoteId = null;
      save();
      render();
    };
    noteInput.addEventListener("blur", commit);
    noteInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        noteInput.blur();
      }
      if (ev.key === "Escape") {
        editingNoteId = null;
        render();
      }
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

let undoState = null;
let undoTimer = null;

function showUndo(message, snapshot) {
  undoState = snapshot;
  document.getElementById("toastMsg").textContent = message;
  document.getElementById("toast").hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndo, 6000);
}
function hideUndo() {
  undoState = null;
  document.getElementById("toast").hidden = true;
}
document.getElementById("toastUndo").addEventListener("click", () => {
  if (undoState) {
    // Det som angres må bli nyest, ellers vinner forrige versjon ved neste
    // synk. Oppføringer som ikke fantes i snapshotet (f.eks. importerte)
    // blir tombstones i stedet for å forsvinne, så de ikke kommer tilbake.
    const current = new Map(entries.map((e) => [e.id, e]));
    const snapshotIds = new Set(undoState.map((e) => e.id));
    entries = [
      ...undoState.map((e) => (current.get(e.id) === e ? e : touch(e))),
      ...entries
        .filter((e) => !snapshotIds.has(e.id))
        .map((e) => (e.deleted ? e : touch(e, { deleted: true }))),
    ];
    save();
    render();
    renderBatch();
  }
  hideUndo();
});

document.getElementById("date").value = todayStr();

document.getElementById("entryForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const date = document.getElementById("date").value;
  const hours = parseFloat(document.getElementById("hours").value);
  const note = document.getElementById("note").value.trim();
  if (!date || isNaN(hours) || hours <= 0) return;

  entries.push({
    id: crypto.randomUUID(),
    date,
    hours,
    note,
    updatedAt: Date.now(),
  });
  save();
  render();

  document.getElementById("hours").value = "";
  document.getElementById("note").value = "";
  document.getElementById("date").value = todayStr();
  document.getElementById("hours").focus();
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const sorted = visible().sort((a, b) => a.date.localeCompare(b.date));
  let csv = "Dato;Timer;Notat\n";
  for (const e of sorted) {
    csv += `${e.date};${fmt(e.hours)};${(e.note || "").replace(/;/g, ",")}\n`;
  }
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ninetofiveish.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Leser formatet fra eksporten: Dato;Timer;Notat, med komma eller punktum
// som desimaltegn. Rader som allerede finnes (samme dato, timer og notat)
// hoppes over, så samme fil kan importeres flere ganger uten duplikater.
function parseCsv(text) {
  const rows = [];
  let invalid = 0;
  for (const line of text.replace(/^﻿/, "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [date, hoursStr, ...noteParts] = line.split(";");
    const hours = parseFloat((hoursStr || "").trim().replace(",", "."));
    const d = date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(hours) || hours <= 0) {
      if (!/^dato$/i.test(d)) invalid++;
      continue;
    }
    rows.push({ date: d, hours, note: noteParts.join(",").trim() });
  }
  return { rows, invalid };
}

document.getElementById("importBtn").addEventListener("click", () => {
  document.getElementById("importFile").click();
});
document.getElementById("importFile").addEventListener("change", async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = "";
  if (!file) return;

  const { rows, invalid } = parseCsv(await file.text());
  const key = (e) => `${e.date}|${e.hours}|${e.note || ""}`;
  const existing = new Set(visible().map(key));
  const fresh = rows.filter((r) => {
    if (existing.has(key(r))) return false;
    existing.add(key(r));
    return true;
  });

  const skipped = rows.length - fresh.length;
  const details = [];
  if (skipped) details.push(`${skipped} fantes fra før`);
  if (invalid) details.push(`${invalid} ugyldige rader`);
  const suffix = details.length ? ` (${details.join(", ")})` : "";
  if (fresh.length === 0) {
    alert(`Ingen nye vakter å importere${suffix}.`);
    return;
  }

  const before = entries;
  const now = Date.now();
  entries = [
    ...entries,
    ...fresh.map((r) => ({ id: crypto.randomUUID(), ...r, updatedAt: now })),
  ];
  save();
  render();
  renderBatch();
  showUndo(`Importerte ${fresh.length} vakter${suffix}`, before);
});

// ---- Batch/ukevisning ----
let currentWeekStart = getMonday(todayStr());

function entriesForDate(dateStr) {
  return visible().filter((e) => e.date === dateStr);
}

// Summen følger det som står i feltene, så den oppdateres mens man skriver.
// Tomme felt teller som lagret verdi, siden «Lagre uke» lar dem være urørt.
function updateWeekTotal() {
  let sum = 0;
  document.querySelectorAll("#weekRows .week-row").forEach((row) => {
    const val = parseFloat(row.querySelector(".wr-hours").value);
    sum +=
      val > 0
        ? val
        : entriesForDate(row.dataset.date).reduce((s, e) => s + e.hours, 0);
  });
  document.getElementById("weekTotal").textContent = fmt(sum) + " t";
}

function renderBatch() {
  const weekDates = Array.from({ length: 7 }, (_, i) =>
    addDays(currentWeekStart, i),
  );
  const wn = isoWeekNumber(currentWeekStart);
  document.getElementById("weekLabel").textContent =
    `Uke ${wn} · ${shortDate(weekDates[0])}–${shortDate(weekDates[6])}`;

  const today = todayStr();
  const rows = document.getElementById("weekRows");
  rows.innerHTML = weekDates
    .map((date) => {
      const existing = entriesForDate(date);
      const sum = existing.reduce((s, e) => s + e.hours, 0);
      const d = new Date(date + "T00:00:00");
      return `
      <div class="week-row${date === today ? " is-today" : ""}" data-date="${date}">
        <div class="wr-date">
          <div class="wd">${WEEKDAYS[d.getDay()]}</div>
          <div class="dm">${d.getDate()}.${d.getMonth() + 1}</div>
        </div>
        <input type="number" class="wr-hours" step="0.25" min="0" max="24" inputmode="decimal"
               placeholder="–" value="${sum > 0 ? fmt(sum).replace(",", ".") : ""}">
        <button type="button" class="wr-clear" data-date="${date}" aria-label="Fjern">✕</button>
      </div>`;
    })
    .join("");

  updateWeekTotal();
  rows.querySelectorAll(".wr-hours").forEach((input) => {
    input.addEventListener("input", updateWeekTotal);
  });

  rows.querySelectorAll(".wr-clear").forEach((btn) => {
    btn.addEventListener("click", () => {
      const date = btn.dataset.date;
      const before = entries;
      removeWhere((e) => e.date === date);
      save();
      render();
      renderBatch();
      showUndo("Dag slettet", before);
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
  document.querySelectorAll("#weekRows .week-row").forEach((row) => {
    const date = row.dataset.date;
    const input = row.querySelector(".wr-hours");
    const val = parseFloat(input.value);
    if (input.value.trim() === "" || isNaN(val) || val <= 0) return;

    const existing = entriesForDate(date);
    const currentSum = existing.reduce((s, e) => s + e.hours, 0);
    if (Math.abs(val - currentSum) < 0.001) return;

    const note = existing[0]?.note || "";
    removeWhere((e) => e.date === date);
    entries.push({
      id: crypto.randomUUID(),
      date,
      hours: val,
      note,
      updatedAt: Date.now(),
    });
  });
  save();
  render();
  renderBatch();
});

render();
initSync();
