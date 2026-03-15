// ── chat.js ──────────────────────────────────────────────────────────────────
// Chat panel: task selection, message rendering, streaming responses,
// and the direct plot-from-task feature.

import { state } from "./state.js";
import { buildContext, streamGroq } from "./api.js";
import { esc, renderMath, setTextAndRenderMath, extractFunctions, detectPlots, drawPlot, guessRange, plainMathToLatex } from "./math.js";
import { renderTaskList } from "./tasks.js";

/** Select a task by index — populates the chat panel */
export function sel(i) {
  state.selectedIdx = i;
  const t = state.tasks[i], sr = t.source || {};
  document.getElementById("cht").textContent = t.task_id || "Aufgabe";
  document.getElementById("chs").textContent =
    `${t.topic || ""} · ${sr.level || ""} · ${t.points ? t.points + " BE" : ""}`;
  document.getElementById("cin").style.display = "flex";
  document.getElementById("qa").style.display = "flex";
  document.getElementById("app").classList.add("co");

  const funcs = extractFunctions((t.question || "") + " " + (t.expected_answer || ""));
  document.getElementById("plotBtn").style.display = funcs.length ? "inline-block" : "none";
  document.getElementById("practiceBtn").style.display = "inline-block";

  if (!state.history[i]) state.history[i] = [];
  renderChat(i);
  renderTaskList();
  setTimeout(() => document.getElementById("mi").focus(), 300);
}

export function goBack() {
  document.getElementById("app").classList.remove("co");
}

/** Re-render the entire chat panel for task i */
export function renderChat(i) {
  const el = document.getElementById("cms");
  const t = state.tasks[i], h = state.history[i] || [];

  // Convert plain-text math (from tasks.json) to LaTeX before rendering
  const questionLatex = plainMathToLatex(t.question || "Kein Text.");

  // Build task bubble via DOM (not innerHTML) so $...$ is preserved for KaTeX
  const taskBubbleDiv = document.createElement("div");
  taskBubbleDiv.className = "mg s";
  const taskBubbleInner = document.createElement("div");
  taskBubbleInner.className = "bu";
  const taskTitle = document.createElement("strong");
  taskTitle.textContent = t.task_id || "Aufgabe";
  taskBubbleInner.appendChild(taskTitle);
  taskBubbleInner.appendChild(document.createElement("br"));
  taskBubbleInner.appendChild(document.createElement("br"));
  // Use textContent so $...$ is preserved as literal text for KaTeX to find
  const taskText = document.createElement("span");
  taskText.textContent = questionLatex;
  taskBubbleInner.appendChild(taskText);
  taskBubbleDiv.appendChild(taskBubbleInner);

  let html = "";

  const q = (t.question || "").toLowerCase();
  if (q.includes("abbildung") || q.includes("dargestellt") || q.includes("histogramm")) {
    html += `<div class="abw">⚠️ Diese Aufgabe verweist auf eine Abbildung. Klicke 📈 um die Funktion zu zeichnen.</div>`;
  }

  if (!h.length) {
    html += `<div class="mg a"><div class="bu"><div class="sn">MARTHA</div>Hallo! 👋 Ich bin Martha, deine Mathe-Nachhilfelehrerin.\n\nSchau dir die Aufgabe oben an. Wie möchtest du anfangen?\nDu kannst mir sagen, was du schon weißt, oder einen 💡 Tipp verlangen.</div></div>`;
  }

  h.forEach((m, idx) => {
    if (m.role === "user") {
      html += `<div class="mg u"><div class="bu">${esc(m.content)}</div></div>`;
    } else {
      html += `<div class="mg a" id="hmsg_${i}_${idx}"><div class="bu"><div class="sn">MARTHA</div><span class="at"></span></div></div>`;
    }
  });

  el.innerHTML = html;
  // Prepend the task bubble (built via DOM to preserve $...$ for KaTeX)
  el.insertBefore(taskBubbleDiv, el.firstChild);
  el.scrollTop = el.scrollHeight;

  // Render math in task bubble — KaTeX finds $...$ in textContent
  renderMath(taskBubbleInner);

  // Render assistant history messages — textContent + KaTeX, then plots
  h.forEach((m, idx) => {
    if (m.role !== "assistant") return;
    const mel = document.getElementById(`hmsg_${i}_${idx}`);
    if (!mel) return;
    const atEl = mel.querySelector(".at");
    if (atEl) setTextAndRenderMath(atEl, m.content);
    const buEl = mel.querySelector(".bu");
    detectPlots(m.content).forEach(p => {
      try { drawPlot(p.expr, p.xmin, p.xmax, buEl); } catch (_) { }
    });
  });
}

/** Plot all functions found in the current task without calling the LLM */
export function plotFromTask() {
  if (state.selectedIdx < 0) return;
  const t = state.tasks[state.selectedIdx];
  const allText = (t.question || "") + " " + (t.expected_answer || "");
  const funcs = extractFunctions(allText);
  const el = document.getElementById("cms");
  if (!funcs.length) { sendMessage("Zeichne die Funktion aus der Aufgabe"); return; }

  funcs.forEach(f => {
    const msgDiv = document.createElement("div"); msgDiv.className = "mg a";
    const bu = document.createElement("div"); bu.className = "bu";
    bu.innerHTML = `<div class="sn">MARTHA</div>Hier ist der Graph von ${esc(f.name)}(x) = ${esc(f.expr)}:`;
    msgDiv.appendChild(bu);
    const [xmin, xmax] = guessRange(f.expr);
    const plotWrap = document.createElement("div");
    bu.appendChild(plotWrap);
    try { drawPlot(f.expr, xmin, xmax, plotWrap); }
    catch (ex) { plotWrap.innerHTML = `<div class="abw">Zeichenfehler: ${ex.message}</div>`; }
    el.appendChild(msgDiv);
  });
  el.scrollTop = el.scrollHeight;
  renderMath(el);
}

/** Send a quick-action message */
export function quickSend(text) {
  document.getElementById("mi").value = text;
  sendMessage();
}

/** Main send message handler */
export async function sendMessage() {
  if (state.streaming || state.selectedIdx < 0) return;
  const inp = document.getElementById("mi");
  const txt = inp.value.trim();
  if (!txt) return;
  inp.value = ""; inp.style.height = "auto";

  // Intercept draw requests
  const drawWords = ["zeichne", "zeichnen", "plot", "rajzol", "graph", "zeig die funktion", "funktion zeichnen"];
  if (drawWords.some(w => txt.toLowerCase().includes(w))) {
    const t = state.tasks[state.selectedIdx];
    const funcs = extractFunctions((t.question || "") + " " + (t.expected_answer || ""));
    if (funcs.length) { plotFromTask(); return; }
  }

  const i = state.selectedIdx;
  if (!state.history[i]) state.history[i] = [];
  state.history[i].push({ role: "user", content: txt });

  const el = document.getElementById("cms");
  el.innerHTML += `<div class="mg u"><div class="bu">${esc(txt)}</div></div>`;

  const tid = "t" + Date.now();
  el.innerHTML += `<div class="mg a" id="${tid}"><div class="bu"><div class="sn">MARTHA</div><span class="at"><span class="tp"><span></span><span></span><span></span></span></span></div></div>`;
  el.scrollTop = el.scrollHeight;

  state.streaming = true;
  document.getElementById("sbt").disabled = true;

  let full = "";
  const ctx = buildContext(state.tasks[i]);
  const atEl = document.querySelector(`#${tid} .at`);

  try {
    for await (const token of streamGroq(state.history[i], ctx)) {
      full += token;
      atEl.textContent = full;
      el.scrollTop = el.scrollHeight;
    }
  } catch (ex) {
    full = full || "Verbindungsfehler: " + ex.message;
  }

  if (full) {
    state.history[i].push({ role: "assistant", content: full });
    const lastMsg = document.getElementById(tid);
    if (lastMsg) {
      const at = lastMsg.querySelector(".at");
      setTextAndRenderMath(at, full);
      const buEl = lastMsg.querySelector(".bu");
      detectPlots(full).forEach(p => { try { drawPlot(p.expr, p.xmin, p.xmax, buEl); } catch (_) { } });
    }
  }

  state.streaming = false;
  document.getElementById("sbt").disabled = false;
}

export function handleKeydown(ev) {
  if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); sendMessage(); }
}

export function autoGrow(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

// Expose to inline HTML handlers
window._sel = sel;
window._goBack = goBack;
window._plotFromTask = plotFromTask;
window._quickSend = quickSend;
window._sendMessage = sendMessage;
window._handleKeydown = handleKeydown;
window._autoGrow = autoGrow;
