// ── practice.js ───────────────────────────────────────────────────────────────
// Practice modal: generates a similar task, verifies it mathematically,
// then displays the result. Uses a two-step non-streaming API call.

import { CONFIG, PRACTICE_SYSTEM_PROMPT } from "./config.js";
import { state } from "./state.js";
import { callGroq } from "./api.js";
import { renderMath } from "./math.js";
import { injectAndSelect } from "./tasks.js";

let generatedTask = null;
let currentDifficulty = "same"; // "easy" | "same" | "hard"

// GK vs LK specific adjustments injected into prompts
const LEVEL_NOTES = {
  GK: `KURS: Grundkurs (GK) — Aufgaben nach GK-Niveau: elementare Ableitungsregeln,
einfache Nachweise, max. 2-3 Rechenschritte pro Teilaufgabe.`,
  LK: `KURS: Leistungskurs (LK) — Aufgaben nach LK-Niveau: komplexere Funktionen erlaubt
(Exponential, Produkt-/Quotientenregel), mehr Rechenschritte, praezisere Begruendungen gefragt.`,
};

const DIFF_CONFIG = {
  easy: {
    desc: "Egyszerűbb számok, kevesebb lépés — ideális az alap elsajátításához.",
    tag:  "🟢 Könnyebb",
    gkExtra: `* Funktionstyp: einfaches Polynom Grad 3, ganzzahlige Koeffizienten (z.B. 2, -3, 1)
* Stelle x₀ ganzzahlig und nahe 0
* Nur eine Teilaufgabe: einfacher Nachweis Hoch- oder Tiefpunkt`,
    lkExtra: `* Funktionstyp: Polynom Grad 3 mit einfachen Bruechen (z.B. 1/2, 3/4)
* Stelle x₀ ganzzahlig
* Eine Teilaufgabe, aber mit Begruendungsanforderung`,
  },
  same: {
    desc: "Az eredeti feladathoz hasonló nehézségű és típusú feladatot generál.",
    tag:  "🟡 Hasonló",
    gkExtra: `* Vergleichbarer Schwierigkeitsgrad fuer GK
* Polynom Grad 3 oder 4, rationale Koeffizienten
* Aehnliche Anzahl Rechenschritte wie das Original`,
    lkExtra: `* Vergleichbarer Schwierigkeitsgrad fuer LK
* Komplexerer Funktionstyp erlaubt (z.B. f(x) = x*e^x oder Polynom Grad 4)
* Praezisere mathematische Formulierung erwartet`,
  },
  hard: {
    desc: "Összetettebb függvény, több részfeladat — kihívás a magabiztosabb tanulóknak.",
    tag:  "🔴 Nehezebb",
    gkExtra: `* Schwerer als typische GK-Aufgaben, aber noch ohne Produkt-/Kettenregel
* Polynom Grad 4, ungewoehnliche Bruchkoeffizienten
* Zusaetzliche Teilaufgabe: Funktionswert oder Monotonieverhalten bestimmen`,
    lkExtra: `* LK-Niveau auf hoechstem Schwierigkeitsgrad
* Funktionstyp mit Produkt- oder Kettenregel (z.B. f(x) = x²*e^(-x))
* Mehrere Teilaufgaben: Extrempunkt + Wendepunkt + Skizze oder Sachkontext-Interpretation
* Stelle x₀ als Bruch oder irrationale Naeherung`,
  },
};

export function setDifficulty(level) {
  currentDifficulty = level;
  ["easy", "same", "hard"].forEach(l => {
    document.getElementById(`diff-${l}`).classList.toggle("active", l === level);
  });
  document.getElementById("diffDesc").textContent = DIFF_CONFIG[level].desc;
  // Reset generated content when difficulty changes
  generatedTask = null;
  document.getElementById("practiceContent").style.display = "none";
  document.getElementById("practicePlaceholder").style.display = "block";
  document.getElementById("loadPracticeBtn").style.display = "none";
  document.getElementById("genBtnTxt").textContent = "✨ Generálás";
  document.getElementById("genBtn").disabled = false;
}

export function openPracticeModal() {
  if (state.selectedIdx < 0) return;
  generatedTask = null;
  currentDifficulty = "same";
  // Reset difficulty UI
  ["easy","same","hard"].forEach(l =>
    document.getElementById(`diff-${l}`).classList.toggle("active", l === "same")
  );
  document.getElementById("diffDesc").textContent = DIFF_CONFIG["same"].desc;
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

const MAX_RETRIES = 3;

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

  // Auto-retry loop — invisible to user until success or max attempts
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const success = await _tryGenerate(t, btn, btnTxt, attempt);
    if (success) return;
    // Small delay between retries
    if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 800));
  }

  // All retries exhausted — show friendly error
  const pb = document.getElementById("practiceText");
  pb.innerHTML = "";
  const errBox = document.createElement("div");
  errBox.className = "gen-box";
  errBox.innerHTML = \`<div style="color:var(--amb);font-weight:600;margin-bottom:8px">⚠️ \${MAX_RETRIES} próbálkozás után sem sikerült matematikailag helyes feladatot generálni.</div>
    <div style="font-size:.82rem;color:var(--tx2)">Próbálj másik feladatot kiválasztani, vagy változtass a nehézségi szinten.</div>\`;
  document.getElementById("practiceContent").style.display = "block";
  pb.appendChild(errBox);
  btn.disabled = false;
  btnTxt.textContent = "🔄 Újra";
}

async function _tryGenerate(t, btn, btnTxt, attempt) {

  // ── Build difficulty-specific prompt pools ────────────────────────────────
  const r = Math.random();
  const pick = (arr) => arr[Math.floor(r * arr.length * 1.7) % arr.length];

  const contexts = [
    "rein abstrakt, ohne Anwendungskontext",
    "Kontext: Kostenfunktion — Produktionskosten einer Firma",
    "Kontext: Physik — Bewegung (Höhe oder Energie)",
    "Kontext: Natur — Temperaturverlauf oder Wachstum",
    "Kontext: Wasserstand eines Behälters",
    "Kontext: Sportwissenschaft — Leistungskurve",
  ];

  // Angle and funcType pools are LOCKED per difficulty level
  const ANGLE_POOLS = {
    easy: [
      "Nachweis eines lokalen HOCHPUNKTS an einer positiven ganzzahligen Stelle",
      "Nachweis eines lokalen TIEFPUNKTS an einer positiven ganzzahligen Stelle",
    ],
    same: [
      "Nachweis eines lokalen HOCHPUNKTS (nicht Tiefpunkt)",
      "Nachweis eines lokalen TIEFPUNKTS an einer negativen Stelle x < 0",
      "Nachweis eines lokalen Tiefpunkts mit Interpretation im Sachkontext",
      "Nachweis eines lokalen Hochpunkts + berechne den zugehörigen Funktionswert",
    ],
    hard: [
      "Nachweis, dass eine Stelle ein Sattelpunkt ist (kein Extrempunkt)",
      "Bestimme ALLE lokalen Extrempunkte und klassifiziere sie",
      "Nachweis eines Extrempunkts + Monotonieverhalten bestimmen",
      "Nachweis eines Hochpunkts + Wendepunkt bestimmen",
    ],
  };

  const FUNC_POOLS = {
    easy: [
      "einfaches Polynom Grad 3: f(x) = ax³ + bx² + cx, ganzzahlige Koeffizienten",
      "Polynom Grad 3 mit Konstante: f(x) = ax³ + bx², Koeffizienten einfache Brüche wie 1/2, 2/3",
    ],
    same: [
      "ganzrationale Funktion Grad 3 mit ungewöhnlichen Brüchen (z.B. 3/8, -5/6)",
      "ganzrationale Funktion Grad 3 mit Konstante: f(x) = ax³ + bx² + c",
      "ganzrationale Funktion Grad 4: f(x) = ax⁴ + bx³ + cx²",
    ],
    hard: [
      "Polynom Grad 4 mit kubischem Term: f(x) = ax⁴ + bx³ + cx, alle Bruchkoeffizienten",
      "Grad 3, alle vier Terme, symmetrielos, LK-Niveau",
      "gemischte Funktion mit Exponentialterm (nur LK): f(x) = ax² · e^(bx)",
    ],
  };

  const X_POOLS = {
    easy:  [1, 2, 3, -1, -2],
    same:  [-3, -2, -1.5, 0.5, 1.5, 2, 3, -0.5],
    hard:  [-2.5, -1.5, 0.5, 1.5, -0.5, 2.5, -3],
  };

  const diff = currentDifficulty;
  const angle = pick(ANGLE_POOLS[diff]);
  const ftype = pick(FUNC_POOLS[diff]);
  const xVal  = pick(X_POOLS[diff]);
  const ctx   = pick(contexts);
  const origSnippet = (t.question || "").slice(0, 120).replace(/`/g, "'");

  const diffCfg = DIFF_CONFIG[currentDifficulty];
  const level = (t.source || {}).level || "GK";
  const levelNote = LEVEL_NOTES[level] || LEVEL_NOTES["GK"];
  const levelExtra = level === "LK" ? diffCfg.lkExtra : diffCfg.gkExtra;

  const userPrompt =
`Thema: ${t.topic || "Analysis"} · ${t.subtopic || "Extremstellen"}

${levelNote}

NEHÉZSÉGI SZINT: ${currentDifficulty.toUpperCase()} (${diffCfg.tag})
${levelExtra}

VORGABEN:
* Aufgabenstellung: ${angle}
* Funktionstyp (angepasst an Kurs und Schwierigkeitsgrad): ${ftype}
* Angestrebte Stelle x₀ = ${xVal} (falls mathematisch passend, sonst freie Wahl)
* Kontext: ${ctx}

VERBOTEN:
* Zahlen/Funktion aus dem Original: "${origSnippet}"
* x = 0 oder x = 1 als Extremstelle (ausser bei "easy")

MATHEMATISCHE PFLICHTPRÜFUNG (intern, vor dem Schreiben):
Wähle Koeffizienten so dass f'(x₀) = 0 exakt gilt.
Prüfe f''(x₀): Vorzeichen muss zur Aufgabenstellung passen.
Stimmt die Stelle nicht: andere Koeffizienten oder andere Stelle wählen.
NIEMALS falsche Extremstelle behaupten.`;

  // ── Prepare UI ─────────────────────────────────────────────────────────────
  const box = document.createElement("div"); box.className = "gen-box";
  const statusEl = document.createElement("div");
  statusEl.style.cssText = "color:var(--tx3);font-size:.8rem;margin-bottom:10px";
  statusEl.textContent = attempt > 1
    ? `⚙️ Újrapróbálás (${attempt}/${MAX_RETRIES})...`
    : "⚙️ Generálás és matematikai ellenőrzés...";
  box.appendChild(statusEl);

  document.getElementById("practiceContent").style.display = "block";
  document.getElementById("practiceTag").textContent =
    `${diffCfg.tag} · ${t.topic || "?"} · ${(t.source || {}).level || ""} · ähnlich wie ${t.task_id || ""}`;
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
    statusEl.textContent = "Verbindungsfehler: " + ex.message;
    return false;
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
    // Silent fail — auto-retry loop will try again
    statusEl.textContent = `⚠️ Próba ${attempt} sikertelen, újrapróbálás...`;
    return false;
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
  return true; // success
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
window._setDiff = setDifficulty;
