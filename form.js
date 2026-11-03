// ---- Timeskjema ----
// Utskrift i samme oppsett som papirskjemaet for AKS. En periode går fra den
// 11. i én måned til og med den 10. i neste.

const NAME_KEY = "ninetofiveish-name";

let formPeriodStart = null;

function currentPeriodStart() {
  const [y, m, d] = todayStr().split("-").map(Number);
  return toDateStr(new Date(y, m - 1 - (d < 11 ? 1 : 0), 11));
}
function shiftPeriod(start, n) {
  const [y, m] = start.split("-").map(Number);
  return toDateStr(new Date(y, m - 1 + n, 11));
}
function periodEnd(start) {
  return shiftPeriod(start, 1).slice(0, 8) + "10";
}
function periodEntries(start) {
  const end = periodEnd(start);
  return visible().filter((e) => e.date >= start && e.date <= end);
}

// Én tabellrad. Dager som ikke finnes (f.eks. 31. november) blir stående tomme
// slik de gjør på papirskjemaet.
function formRow(year, month, day) {
  const d = new Date(year, month - 1, day);
  const items =
    d.getMonth() === month - 1
      ? entriesForDate(toDateStr(d)).sort((a, b) =>
          (a.from || "").localeCompare(b.from || ""),
        )
      : [];
  const timed = items.filter((e) => e.from);
  const hours = items.reduce((s, e) => s + e.hours, 0);
  const notes = [...new Set(items.map((e) => e.note).filter(Boolean))];
  const cell = (v) => `<td>${escapeHtml(v || "")}</td>`;
  return `<tr>
    <td>${day}.</td>
    ${cell(timed[0]?.from)}${cell(timed[0]?.to)}
    ${cell(timed[1]?.from)}${cell(timed[1]?.to)}
    ${cell(hours > 0 ? fmt(hours) : "")}
    ${cell(notes.join(", "))}
  </tr>`;
}

function formBlock(year, month, firstDay, lastDay, periodText) {
  let rows = "";
  for (let day = firstDay; day <= lastDay; day++) {
    rows += formRow(year, month, day);
  }
  return `<table>
    <colgroup>
      <col style="width: 8%" />
      <col style="width: 11%" /><col style="width: 11%" />
      <col style="width: 11%" /><col style="width: 11%" />
      <col style="width: 12%" /><col style="width: 36%" />
    </colgroup>
    <tr class="head">
      <th colspan="5">${year} MÅNED: ${MONTHS[month - 1].toUpperCase()}</th>
      <th colspan="2">PERIODE: ${periodText}</th>
    </tr>
    <tr class="head">
      <th>Dato</th><th>Fra kl.</th><th>Til kl.</th><th>Fra kl.</th><th>Til kl.</th>
      <th>Antall timer</th><th>Informasjon om arbeidet</th>
    </tr>
    ${rows}
  </table>`;
}

function leaderTable() {
  const cols = (label) => `<td>${label}:</td><td>${label}:</td>`;
  return `<table class="leader">
    <tr>${cols("Lønnsart")}</tr>
    <tr>${cols("Antall timer")}</tr>
    <tr>${cols("Tekst")}</tr>
  </table>`;
}

function buildPrintForm() {
  const start = formPeriodStart || currentPeriodStart();
  const end = periodEnd(start);
  const [y1, m1] = start.split("-").map(Number);
  const [y2, m2] = end.split("-").map(Number);
  const name = (localStorage.getItem(NAME_KEY) || "").toUpperCase();
  const signature = (who, year) =>
    `<p class="sign">Dato: &nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp; ${year} &nbsp; Underskrift fra ${who}: <span></span></p>`;

  document.getElementById("printForm").innerHTML = `
    <h2>Aktivitetsskolen</h2>
    <h3>REGISTRERING AV TIMELØNN FOR ARBEID PÅ AKS ${y1}</h3>
    <p class="small">Skjema må leveres utfylt og underskrevet til AKS-leder første arbeidsdag etter ferdig periode.</p>
    <p class="name">NAVN: <strong>${escapeHtml(name)}</strong></p>
    ${formBlock(y1, m1, 11, 31, "fra og med 11. – til og med 30./31.")}
    ${formBlock(y2, m2, 1, 10, "fra og med 1. – til og med 10.")}
    ${signature("arbeidstaker", y2)}
    <p class="leader-title"><strong>Fylles ut av AKS-leder:</strong> (skjema leveres kontrollert og utfylt senest den 15. i måneden)</p>
    ${leaderTable()}
    ${leaderTable()}
    ${signature("AKS-leder", y2)}`;
}

function renderFormPanel() {
  if (document.getElementById("formPanel").hidden) return;
  const start = formPeriodStart || currentPeriodStart();
  const items = periodEntries(start);
  const sum = items.reduce((s, e) => s + e.hours, 0);
  document.getElementById("periodLabel").textContent =
    `${shortDate(start)}–${shortDate(periodEnd(start))} ${periodEnd(start).slice(0, 4)}`;
  document.getElementById("periodCount").textContent =
    `${items.length} ${items.length === 1 ? "vakt" : "vakter"}`;
  document.getElementById("periodTotal").textContent = fmt(sum) + " t";

  const warnings = [];
  const missing = items.filter((e) => !e.from).length;
  if (missing) {
    warnings.push(
      `${missing} ${missing === 1 ? "vakt mangler" : "vakter mangler"} klokkeslett. Fyll inn fra og til under «Uke».`,
    );
  }
  const perDay = new Map();
  for (const e of items.filter((e) => e.from)) {
    perDay.set(e.date, (perDay.get(e.date) || 0) + 1);
  }
  const crowded = [...perDay.values()].filter((n) => n > 2).length;
  if (crowded) {
    warnings.push(
      `${crowded} ${crowded === 1 ? "dag har" : "dager har"} flere enn to vakter. Skjemaet har bare plass til to klokkeslett per dag, men alle timene telles med.`,
    );
  }
  document.getElementById("formWarnings").innerHTML = warnings
    .map((w) => `<li>${escapeHtml(w)}</li>`)
    .join("");
}

function initForm() {
  const panel = document.getElementById("formPanel");
  const nameInput = document.getElementById("formName");
  nameInput.value = localStorage.getItem(NAME_KEY) || "";

  document.getElementById("formBtn").addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    renderFormPanel();
    if (!panel.hidden) panel.scrollIntoView({ behavior: "smooth" });
  });
  nameInput.addEventListener("input", () => {
    localStorage.setItem(NAME_KEY, nameInput.value.trim());
  });
  const move = (n) => {
    formPeriodStart = shiftPeriod(formPeriodStart || currentPeriodStart(), n);
    renderFormPanel();
  };
  document
    .getElementById("prevPeriodBtn")
    .addEventListener("click", () => move(-1));
  document
    .getElementById("nextPeriodBtn")
    .addEventListener("click", () => move(1));
  document.getElementById("printFormBtn").addEventListener("click", () => {
    window.print();
  });
  // Dekker også utskrift fra nettleserens egen meny
  window.addEventListener("beforeprint", buildPrintForm);
}
