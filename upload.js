// ── upload.js ─────────────────────────────────────────────────────────────────
// Upload modal: handles image (vision), PDF (PDF.js), and Word (mammoth.js)
// task extraction and optional function plotting.

import { CONFIG } from "./config.js";
import { streamToElement } from "./api.js";
import { renderMath, renderPlotsFromText } from "./math.js";
import { injectAndSelect } from "./tasks.js";

// Multi-file state: arrays of file objects ready for processing
let uploadedFiles = [];     // [{base64, mimeType, name, type, text}]
let currentFileIdx = 0;     // which file is being previewed/analyzed
let extractedTask = null;
// Legacy single-file vars (kept for analyzeUpload compatibility)
let photoBase64 = null;
let photoMimeType = "image/jpeg";
let docExtractedText = null;
let currentFileType = null; // "image" | "pdf" | "docx"

// ── Modal open/close ──────────────────────────────────────────────────────────

export function openUploadModal() {
  uploadedFiles = []; currentFileIdx = 0;
  photoBase64 = null; extractedTask = null; docExtractedText = null; currentFileType = null;
  _el("photoPreview").style.display = "none";
  _el("photoResult").style.display = "none";
  _el("analyzeBtn").style.display = "none";
  _el("loadPhotoBtn").style.display = "none";
  _el("uploadZone").style.display = "block";
  _el("fileTypeBadge").style.display = "none";
  _el("docTextPreview").style.display = "none";
  _el("fileQueue").style.display = "none";
  _el("fileQueue").innerHTML = "";
  _el("photoInput").value = "";
  _el("photoModal").style.display = "flex";
}

export function closeUploadModal() {
  _el("photoModal").style.display = "none";
}

// ── File handling ─────────────────────────────────────────────────────────────

export function handleDrop(ev) {
  ev.preventDefault();
  _el("uploadZone").classList.remove("drag");
  const files = [...ev.dataTransfer.files];
  if (files.length) processFiles(files);
}

export function handleFileInput(ev) {
  const files = [...ev.target.files];
  if (files.length) processFiles(files);
}

// Entry point for multi-file processing
async function processFiles(files) {
  // Filter supported types
  const supported = files.filter(f => {
    const n = f.name.toLowerCase();
    return f.type.startsWith("image/") ||
      f.type === "application/pdf" || n.endsWith(".pdf") ||
      n.endsWith(".docx") || n.endsWith(".doc");
  });
  if (!supported.length) {
    alert("Nem támogatott formátum! JPG, PNG, PDF vagy DOCX fájlokat válassz.");
    return;
  }
  if (supported.length > 10) {
    alert("Egyszerre maximum 10 fájl tölthető fel!");
    return;
  }

  // If single file, use existing flow directly
  if (supported.length === 1) {
    processFile(supported[0]);
    return;
  }

  // Multi-file: show queue, process one by one
  uploadedFiles = [];
  _el("uploadZone").style.display = "none";
  _el("fileTypeBadge").style.display = "none";
  _el("photoPreview").style.display = "none";
  _el("docTextPreview").style.display = "none";
  _el("photoResult").style.display = "none";
  _el("loadPhotoBtn").style.display = "none";

  // Build queue UI
  const queue = _el("fileQueue");
  queue.style.display = "block";
  queue.innerHTML = `<div style="font-size:.8rem;color:var(--tx3);margin-bottom:8px">📎 ${supported.length} fájl kiválasztva:</div>`;

  for (let i = 0; i < supported.length; i++) {
    const row = document.createElement("div");
    row.id = `fq-${i}`;
    row.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;background:var(--s2);margin-bottom:4px;font-size:.82rem";
    const icon = supported[i].type.startsWith("image/") ? "📷" :
      supported[i].name.toLowerCase().endsWith(".pdf") ? "📄" : "📝";
    row.innerHTML = `<span>${icon}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${supported[i].name}</span><span id="fq-status-${i}" style="color:var(--tx3)">⏳</span>`;
    queue.appendChild(row);
  }

  // Show analyze button for batch
  _el("analyzeBtn").style.display = "inline-flex";
  _el("analyzeBtnTxt").textContent = `🔍 ${supported.length} fájl elemzése`;
  _el("analyzeBtn").disabled = false;

  // Store files for batch processing
  uploadedFiles = supported;
}

async function processFile(file) {
  if (file.size > 20 * 1024 * 1024) { alert("A fájl túl nagy (max 20 MB)!"); return; }
  const name = file.name.toLowerCase();
  const isPDF = file.type === "application/pdf" || name.endsWith(".pdf");
  const isDocx = name.endsWith(".docx") || name.endsWith(".doc") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isImage = file.type.startsWith("image/");

  // Reset UI
  _el("uploadZone").style.display = "none";
  _el("photoPreview").style.display = "none";
  _el("docTextPreview").style.display = "none";
  _el("photoResult").style.display = "none";
  _el("loadPhotoBtn").style.display = "none";
  extractedTask = null; docExtractedText = null;

  const badge = _el("fileTypeBadge");

  if (isImage) {
    currentFileType = "image";
    badge.textContent = "📷 Kép"; badge.style.display = "block";
    photoMimeType = file.type || "image/jpeg";
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target.result;
      photoBase64 = url.split(",")[1];
      _el("photoPreview").src = url;
      _el("photoPreview").style.display = "block";
      _showAnalyzeBtn("🔍 Feladat kiolvasása");
    };
    reader.readAsDataURL(file);

  } else if (isPDF) {
    currentFileType = "pdf";
    badge.textContent = "📄 PDF"; badge.style.display = "block";
    const preview = _el("docTextPreview");
    preview.textContent = "PDF feldolgozása..."; preview.style.display = "block";
    try {
      await _loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
      const lib = window["pdfjs-dist/build/pdf"];
      lib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const arrayBuf = await file.arrayBuffer();
      const pdf = await lib.getDocument({ data: arrayBuf }).promise;
      let text = "";
      for (let p = 1; p <= Math.min(pdf.numPages, 8); p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        text += tc.items.map(it => it.str).join(" ") + "\n";
      }
      text = text.trim();
      if (!text) { preview.textContent = "⚠️ A PDF nem tartalmaz kiolvasható szöveget. Próbálj képként feltölteni!"; return; }
      docExtractedText = text;
      preview.textContent = text.slice(0, 500) + (text.length > 500 ? "…" : "");
      _showAnalyzeBtn("🔍 Feladat elemzése");
    } catch (ex) { preview.textContent = "PDF hiba: " + ex.message; }

  } else if (isDocx) {
    currentFileType = "docx";
    badge.textContent = "📝 Word"; badge.style.display = "block";
    const preview = _el("docTextPreview");
    preview.textContent = "Word fájl feldolgozása..."; preview.style.display = "block";
    try {
      if (!window.mammoth) await _loadScript("https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js");
      const arrayBuf = await file.arrayBuffer();
      const result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuf });
      const text = result.value.trim();
      if (!text) { preview.textContent = "⚠️ Nem sikerült szöveget kinyerni."; return; }
      docExtractedText = text;
      preview.textContent = text.slice(0, 500) + (text.length > 500 ? "…" : "");
      _showAnalyzeBtn("🔍 Feladat elemzése");
    } catch (ex) { preview.textContent = "Word hiba: " + ex.message; }

  } else {
    alert("Nem támogatott formátum. Kérlek JPG, PNG, PDF vagy DOCX fájlt tölts fel!");
    _el("uploadZone").style.display = "block";
  }
}

// ── Analysis ──────────────────────────────────────────────────────────────────

const EXTRACT_PROMPT = `Analysiere dieses Bild und extrahiere den Aufgabentext fuer einen Mathe-Tutor.

═══ SCHRITT 1: SEITENTYP ERKENNEN ═══

Ist die Seite eine LOESUNGSSEITE?
Merkmale: Kopfzeile "Lösungen", fertig ausgerechnete Ergebnisse, "Fazit:" mit Antworten,
ausgefuellte Luecken, Musterloesung mit konkreten Zahlenwerten.
→ Falls ja: schreibe NUR das Wort MEGOLDAS_OLDAL

Kein Mathe-Inhalt erkennbar?
→ schreibe NUR: KEIN_AUFGABE

═══ SCHRITT 2: AUFGABENTEXT EXTRAHIEREN ═══

LUECKEN UND LEERE FELDER:
- Leere Luecken (___) → schreibe: ______
- Leere Kaestchen (□) → schreibe: [ ]
- Leere Raster/Millimeterpapier → ignorieren, nicht erwaehnen
- Noch nicht ausgefuellte Antwortzeilen → als Leerzeile lassen

LATEX — einmal, korrekt, nie doppelt:
- Jeden Ausdruck GENAU EINMAL schreiben — entweder als LaTeX ODER als Text, nie beides
- Inline: $\vec{a} = \vec{p} + 1 \cdot \vec{u}$
- Display (eigene Zeile): $$g\colon \vec{x} = \vec{p} + t \cdot \vec{u}, \quad t \in \mathbb{R}$$
- Vektoren IMMER mit Pfeil: $\vec{a}$, $\vec{u}$, $\vec{p}$
- Spaltenvektoren: $\begin{pmatrix} 1 \\ -2 \\ 4 \end{pmatrix}$
- Punkte: $P(1 \mid -2 \mid 4)$
- NIEMALS Unicode-Zeichen fuer Mathe: kein ⃗, kein ×, kein ∈ als Text — immer LaTeX

ABBILDUNGEN UND GRAFIKEN:
- Koordinatensystem mit eingetragenen Punkten/Vektoren (Geometrie):
  Beschreibe kurz was sichtbar ist, z.B.: "[Abbildung: Koordinatensystem mit Punkten P, A, B, C, D, E und Vektoren $\vec{p}$, $\vec{u}$]"
  KEIN PLOT-Befehl bei Geometrie-Abbildungen!
- Funktionsgraph $f(x)$ (Analysis): PLOT(ausdruck, xmin, xmax) auf eigener Zeile
  Beispiel: PLOT(x^3-3*x, -3, 3) — nur wenn Funktion klar ablesbar

INHALT:
- Aufgabennummern (1, 2, 3...) und Aufgabentext vollstaendig uebernehmen
- Aufgabenstellung inkl. "Zeigen Sie...", "Bestimmen Sie...", "Begründen Sie..." etc.
- Informationsboxen (z.B. "Parametergleichung einer Geraden") mit Inhalt uebernehmen
- Gespraeche/Denkblasen (wie Kim und Janne) vollstaendig uebernehmen
- KEINE Loesungen, KEINE ausgefuellten Ergebnisse, KEIN "Fazit:" mit Antworten
- Starte direkt mit dem ersten Aufgabentitel, kein Praefix`;

export async function analyzeUpload() {
  // If multi-file batch — process all in sequence
  if (uploadedFiles.length > 1) {
    await analyzeBatch();
    return;
  }

  const btn = _el("analyzeBtn");
  const btnTxt = _el("analyzeBtnTxt");
  btn.disabled = true;
  btnTxt.innerHTML = '<span class="spin"></span> Elemzés...';

  const resultEl = _el("photoResult");
  resultEl.style.display = "block";
  resultEl.textContent = "Martha olvassa a feladatot...";
  _el("loadPhotoBtn").style.display = "none";

  const sysMsg = "Du bist Martha, eine NRW Abitur Mathematiklehrerin. Antworte auf Deutsch.";

  let userContent;
  let model;
  if (currentFileType === "image") {
    if (!photoBase64) { btn.disabled = false; btnTxt.textContent = "🔍 Újra"; return; }
    userContent = [
      { type: "image_url", image_url: { url: `data:${photoMimeType};base64,${photoBase64}` } },
      { type: "text", text: EXTRACT_PROMPT },
    ];
    model = CONFIG.VISION_MODEL;
  } else {
    if (!docExtractedText) { btn.disabled = false; btnTxt.textContent = "🔍 Újra"; return; }
    userContent = `${EXTRACT_PROMPT}\n\nEXTRAHIERTER TEXT:\n"""\n${docExtractedText.slice(0, 4000)}\n"""`;
    model = CONFIG.MODEL;
  }

  let full = "";
  try {
    full = await streamToElement({
      systemPrompt: sysMsg,
      userContent,
      model,
      targetEl: resultEl,
      temperature: 0.1,
      maxTokens: 1000,
    });
  } catch (ex) {
    resultEl.textContent = "Hiba: " + ex.message;
    btn.disabled = false; btnTxt.textContent = "🔍 Újra";
    return;
  }

  if (full && !full.includes("KEIN_AUFGABE") && !full.includes("MEGOLDAS_OLDAL")) {
    // Render LaTeX
    resultEl.textContent = full;
    renderMath(resultEl);

    // Render plots
    renderPlotsFromText(full, resultEl.parentNode, "📈 Függvény a feladatból:");

    // Warn if figure was unreadable
    if (full.includes("ABBILDUNG_NICHT_LESBAR")) {
      const warn = document.createElement("div");
      warn.className = "abw";
      warn.textContent = "⚠️ Az ábra nem volt egyértelműen olvasható — a függvényt kézzel is megadhatod Marthának.";
      resultEl.after(warn);
    }

    const icons = { image: "📷", pdf: "📄", docx: "📝" };
    extractedTask = {
      task_id: (icons[currentFileType] || "📎") + " Feltöltött feladat",
      topic: "Egyedi feladat", subtopic: "Feltöltött fájlból",
      source: { level: "", year: "" },
      points: null, question: full, expected_answer: "",
    };
    _el("loadPhotoBtn").style.display = "inline-flex";
  } else if (full.includes("MEGOLDAS_OLDAL")) {
    resultEl.innerHTML = `<div style="text-align:center;padding:20px">
      <div style="font-size:2rem;margin-bottom:10px">📖</div>
      <div style="font-weight:600;color:var(--amb);margin-bottom:8px">Ez egy megoldásoldal</div>
      <div style="font-size:.85rem;color:var(--tx2)">A feltöltött kép megoldásokat tartalmaz, nem feladatokat.<br>
      Kérlek egy <strong>feladatoldalt</strong> tölts fel!</div>
    </div>`;
  } else if (full.includes("KEIN_AUFGABE")) {
    resultEl.textContent = "⚠️ Nem találtam matematikai feladatot ebben a fájlban.";
  }

  btn.disabled = false; btnTxt.textContent = "🔄 Újra";
}

export function loadExtractedTask() {
  if (!extractedTask) return;
  injectAndSelect(extractedTask);
  closeUploadModal();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _el(id) { return document.getElementById(id); }

function _showAnalyzeBtn(label) {
  const btn = _el("analyzeBtn");
  btn.style.display = "inline-flex";
  btn.disabled = false;
  _el("analyzeBtnTxt").textContent = label;
}

function _loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ── Batch processing ─────────────────────────────────────────────────────────

async function analyzeBatch() {
  const btn = _el("analyzeBtn");
  btn.disabled = true;
  _el("analyzeBtnTxt").innerHTML = '<span class="spin"></span> Feldolgozás...';

  const sysMsg = "Du bist Martha, eine NRW Abitur Mathematiklehrerin. Antworte auf Deutsch.";
  const allResults = [];

  for (let i = 0; i < uploadedFiles.length; i++) {
    const file = uploadedFiles[i];
    const statusEl = document.getElementById(`fq-status-${i}`);
    if (statusEl) statusEl.textContent = "⏳ Feldolgozás...";

    try {
      let userContent, model;
      const name = file.name.toLowerCase();
      const isPDF = file.type === "application/pdf" || name.endsWith(".pdf");
      const isDocx = name.endsWith(".docx") || name.endsWith(".doc");
      const isImage = file.type.startsWith("image/");

      if (isImage) {
        const b64 = await _fileToBase64(file);
        userContent = [
          { type: "image_url", image_url: { url: `data:${file.type};base64,${b64}` } },
          { type: "text", text: EXTRACT_PROMPT },
        ];
        model = CONFIG.VISION_MODEL;
      } else if (isPDF) {
        const text = await _extractPDFText(file);
        if (!text) { if (statusEl) statusEl.textContent = "⚠️ Üres"; continue; }
        userContent = `${EXTRACT_PROMPT}\n\nEXTRAHIERTER TEXT:\n"""\n${text.slice(0, 4000)}\n"""`;
        model = CONFIG.MODEL;
      } else if (isDocx) {
        const text = await _extractDocxText(file);
        if (!text) { if (statusEl) statusEl.textContent = "⚠️ Üres"; continue; }
        userContent = `${EXTRACT_PROMPT}\n\nEXTRAHIERTER TEXT:\n"""\n${text.slice(0, 4000)}\n"""`;
        model = CONFIG.MODEL;
      } else { continue; }

      // Non-streaming call for batch
      const resp = await fetch(CONFIG.API_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role:"system", content:sysMsg }, { role:"user", content:userContent }], stream:false, temperature:0.1, max_tokens:1000 }),
      });
      const data = await resp.json();
      const full = data.choices?.[0]?.message?.content || "";

      if (full.includes("MEGOLDAS_OLDAL")) {
        if (statusEl) statusEl.textContent = "📖 Megoldásoldal";
      } else if (full.includes("KEIN_AUFGABE") || !full.trim()) {
        if (statusEl) statusEl.textContent = "❌ Nem feladat";
      } else {
        if (statusEl) statusEl.textContent = "✅ Kész";
        allResults.push({ name: file.name, content: full });
      }
    } catch (ex) {
      if (statusEl) statusEl.textContent = "❌ Hiba";
    }
  }

  btn.disabled = false;
  _el("analyzeBtnTxt").textContent = "🔄 Újra";

  if (!allResults.length) {
    _el("photoResult").style.display = "block";
    _el("photoResult").textContent = "⚠️ Egy feladatot sem sikerült kiolvasni.";
    return;
  }

  // Show all results and create a combined task
  const resultEl = _el("photoResult");
  resultEl.style.display = "block";
  resultEl.textContent = "";

  const combined = allResults.map((r, i) =>
    `[Fájl ${i+1}: ${r.name}]\n${r.content}`
  ).join("\n\n---\n\n");

  const header = document.createElement("div");
  header.style.cssText = "font-size:.78rem;color:var(--ac);font-weight:600;margin-bottom:10px";
  header.textContent = `✅ ${allResults.length} feladat kiolvasva ${uploadedFiles.length} fájlból`;
  resultEl.appendChild(header);

  allResults.forEach((r, i) => {
    const block = document.createElement("div");
    block.style.cssText = "margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--bd)";
    const lbl = document.createElement("div");
    lbl.style.cssText = "font-size:.72rem;color:var(--tx3);margin-bottom:6px";
    lbl.textContent = `📄 ${r.name}`;
    const txt = document.createElement("div");
    txt.textContent = r.content;
    block.appendChild(lbl); block.appendChild(txt);
    resultEl.appendChild(block);
    if (typeof renderMathInElement === "function") {
      try { renderMathInElement(txt, { delimiters:[{left:"$$",right:"$$",display:true},{left:"$",right:"$",display:false}], throwOnError:false }); } catch(_) {}
    }
  });

  extractedTask = {
    task_id: `📎 ${allResults.length} feltöltött feladat`,
    topic: "Egyedi feladat", subtopic: "Több fájlból feltöltve",
    source: { level: "", year: "" },
    points: null, question: combined, expected_answer: "",
  };
  _el("loadPhotoBtn").style.display = "inline-flex";
}

// ── File reading helpers ──────────────────────────────────────────────────────

function _fileToBase64(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => res(e.target.result.split(",")[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

async function _extractPDFText(file) {
  await _loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  const lib = window["pdfjs-dist/build/pdf"];
  lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: buf }).promise;
  let text = "";
  for (let p = 1; p <= Math.min(pdf.numPages, 8); p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    text += tc.items.map(it => it.str).join(" ") + "\n";
  }
  return text.trim();
}

async function _extractDocxText(file) {
  if (!window.mammoth) await _loadScript("https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js");
  const buf = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
  return result.value.trim();
}

// Expose to inline HTML
window._openUploadModal = openUploadModal;
window._closeUploadModal = closeUploadModal;
window._handleDrop = handleDrop;
window._handleFileInput = handleFileInput;
window._analyzeUpload = analyzeUpload;
window._loadExtractedTask = loadExtractedTask;
