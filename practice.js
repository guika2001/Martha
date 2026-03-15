// ── practice.js ───────────────────────────────────────────────────────────────
// Practice modal: generates a similar task, verifies it mathematically,
// then displays the result. Uses a two-step non-streaming API call.

import { CONFIG, PRACTICE_SYSTEM_PROMPT } from "./config.js";
import { state } from "./state.js";
import { callGroq } from "./api.js";
import { renderMath } from "./math.js";
import { injectAndSelect } from "./tasks.js";

let generatedTask = null;

export function openPracticeModal() {
  if (state.selectedIdx < 0) return;
  generatedTask = null;
  document.getElementById("practiceContent").style.display = "none";
  document.getElementById("practicePlaceholder").style.display = "block";
  document.getElementById("loadPracticeBtn").style.display = "none";
  document.getElementById("genBtnTxt").textContent = "✨ Generálás";
  document.getElementById("genBtn").disabled = false;
  document.getElementById("practiceModal").style.display = "flex";
}

export function closePracticeModal() {
  document.getElementById("practiceModal").style.display = "none";
}

export async function generatePractice() {
  if (state.selectedIdx < 0) return;
  const t = state.tasks[state.selectedIdx];
  const btn = document.getElementById("genBtn");
  const btnTxt = document.getElementById("genBtnTxt");
  btn.disabled = true;
  btnTxt.innerHTML = '<span class="spin"></span> Generálás...';
  document.getElementById("practicePlaceholder").style.display = "none";
  document.getElementById("practiceContent").style.display = "none";
  document.getElementById("loadPracticeBtn").style.display = "none";

  // ── Build a varied prompt ──────────────────────────────────────────────────
  const r = Math.random();
  const contexts = [
    "rein abstrakt, ohne Anwendungskontext",
    "Kontext: Kostenfunktion — Verlauf der Produktionskosten einer Firma",
    "Kontext: Physik — Bewegung (Höhe, Geschwindigkeit oder Energie)",
    "Kontext: Natur — Bevölkerungswachstum oder Temperaturverlauf",
    "Kontext: Wasserstand oder Füllmenge eines Behälters",
    "Kontext: Sportwissenschaft — Leistungskurve oder Erschöpfungsmodell",
  ];
  const taskAngles = [
    "Nachweis eines lokalen HOCHPUNKTS (nicht Tiefpunkt)",
    "Nachweis eines lokalen TIEFPUNKTS an einer negativen Stelle x < 0",
    "Nachweis, dass eine Stelle ein Sattelpunkt ist (kein Extrempunkt)",
    "Bestimme ALLE lokalen Extrempunkte und klassifiziere sie (Hoch- oder Tiefpunkt)",
    "Nachweis eines lokalen Tiefpunkts mit Interpretation im Sachkontext",
    "Nachweis eines lokalen Hochpunkts + berechne den zugehörigen Funktionswert",
  ];
  const funcTypes = [
    "ganzrationale Funktion Grad 3: f(x) = ax³ + bx² + cx",
    "ganzrationale Funktion Grad 3 mit Konstante: f(x) = ax³ + bx² + c",
    "ganzrationale Funktion Grad 4 mit kubischem Term: f(x) = ax⁴ + bx³ + cx",
    "ganzrationale Funktion Grad 3, alle Koeffizienten ungewöhnliche Brüche",
    "ganzrationale Funktion Grad 4: f(x) = ax⁴ + bx³ + cx²",
    "Grad 3, symmetrielos, alle vier Terme vorhanden (inkl. Konstante)",
  ];

  const ctx   = contexts[   Math.floor(r * 6.7) % contexts.length];
  const angle = taskAngles[ Math.floor(r * 5.3) % taskAngles.length];
  const ftype = funcTypes[  Math.floor(r * 7.1) % funcTypes.length];
  const xVals = [-3, -2, -1.5, 0.5, 1.5, 2, 3, -0.5];
  const xVal  = xVals[Math.floor(r * xVals.length)];
  const origSnippet = (t.question || "").slice(0, 120).replace(/`/g, "'");

  const userPrompt =
`Thema: ${t.topic || "Analysis"} · ${t.subtopic || "Extremstellen"} · Kurs: ${(t.source || {}).level || "GK"}

VORGABEN:
* Aufgabenstellung: ${angle}
* Funktionstyp: ${ftype}
* Stelle x₀ = ${xVal}
* Kontext: ${ctx}
* Koeffizienten: Wähle UNGEWÖHNLICHE rationale Zahlen (z.B. 3/8, -5/6, 7/4, 2/9)

VERBOTEN:
* Zahlen/Funktion aus: "${origSnippet}"
* x = 0 oder x = 1 als Extremstelle
* Koeffizient 1/2, 1/3 oder 2/5

MATHEMATISCHE PFLICHTPRÜFUNG (intern):
Wähle Koeffizienten so dass f'(x₀) = 0 exakt gilt.
Prüfe f''(x₀): Vorzeichen muss zur Aufgabenstellung passen.
Stimmt die Stelle nicht: andere Koeffizienten oder andere Stelle wählen.
NIEMALS falsche Extremstelle behaupten.`;

  // ── Prepare UI ─────────────────────────────────────────────────────────────
  const box = document.createElement("div"); box.className = "gen-box";
  const statusEl = document.createElement("div");
  statusEl.style.cssText = "color:var(--tx3);font-size:.8rem;margin-bottom:10px";
  statusEl.textContent = "⚙️ Generálás és matematikai ellenőrzés...";
  box.appendChild(statusEl);

  document.getElementById("practiceContent").style.display = "block";
  document.getElementById("practiceTag").textContent =
    `${t.topic || "?"} · ${(t.source || {}).level || ""} · ähnlich wie ${t.task_id || ""}`;
  const pb = document.getElementById("practiceText");
  pb.innerHTML = ""; pb.appendChild(box);

  // ── API call — non-streaming JSON response ─────────────────────────────────
  let rawJSON = "";
  try {
    rawJSON = await callGroq({
      systemPrompt: PRACTICE_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.7,
      maxTokens: 900,
    });
  } catch (ex) {
    box.textContent = "Verbindungsfehler: " + ex.message;
    btn.disabled = false; btnTxt.textContent = "🔁 Újra";
    return;
  }

  // ── Parse JSON ─────────────────────────────────────────────────────────────
  let aufgabe = "", verDict = {};
  try {
    const clean = rawJSON.replace(/^```json\s*/, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(clean);
    aufgabe = parsed.aufgabe || "";
    verDict = parsed.verifikation || {};
  } catch (_) {
    // Fallback: try regex extraction
    const m = rawJSON.match(/"aufgabe"\s*:\s*"([\s\S]+?)(?:",\s*"verifikation|"\s*})/);
    aufgabe = m ? m[1].replace(/\\n/g, "\n") : "";
    verDict = { urteil: "JSON_PARSE_ERROR" };
  }

  const verdict = (verDict.urteil || "").toUpperCase();
  if (verdict.startsWith("FEHLER") || !aufgabe) {
    statusEl.textContent = "⚠️ Matematikai hiba: " + (verDict.urteil || "ismeretlen");
    const retryHint = document.createElement("div");
    retryHint.style.cssText = "color:var(--tx3);font-size:.78rem;margin-top:6px";
    retryHint.textContent = "Próbálj újra — más koefficienseket generál.";
    box.appendChild(retryHint);
    btn.disabled = false; btnTxt.textContent = "🔄 Újra generálás";
    return;
  }

  // ── Show verification badge + render task ──────────────────────────────────
  statusEl.innerHTML =
    `<span style="color:var(--grn);font-weight:600">✓ Matematikailag ellenőrzött</span>` +
    (verDict.f_prime ? ` &nbsp;·&nbsp; f'(x) = ${verDict.f_prime}` : "") +
    (verDict.f_prime_at_x0 ? ` &nbsp;·&nbsp; f'(x₀) = ${verDict.f_prime_at_x0}` : "");

  const finalEl = document.createElement("div");
  finalEl.style.cssText = "line-height:1.9;margin-top:8px;padding-top:8px;border-top:1px solid var(--bd)";
  finalEl.textContent = aufgabe;
  box.appendChild(finalEl);
  renderMath(finalEl);

  generatedTask = {
    task_id: "🔁 Üben · " + (t.task_id || "?"),
    topic: t.topic, subtopic: t.subtopic,
    source: { level: (t.source || {}).level, year: "generiert" },
    points: t.points, question: aufgabe, expected_answer: "",
  };
  document.getElementById("loadPracticeBtn").style.display = "inline-flex";
  btn.disabled = false; btnTxt.textContent = "🔄 Újra generálás";
}

export function loadGeneratedTask() {
  if (!generatedTask) return;
  injectAndSelect(generatedTask);
  closePracticeModal();
}

// Expose to inline HTML onclick handlers
window._openPracticeModal = openPracticeModal;
window._closePracticeModal = closePracticeModal;
window._generatePractice = generatePractice;
window._loadGeneratedTask = loadGeneratedTask;
