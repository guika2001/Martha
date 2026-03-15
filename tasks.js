// ── tasks.js ─────────────────────────────────────────────────────────────────
// Task loading, topic/level filtering, and sidebar list rendering.

import { CONFIG } from "./config.js";
import { state } from "./state.js";
import { esc } from "./math.js";

export async function init() {
  try {
    const r = await fetch("tasks.json");
    state.tasks = await r.json();
    document.getElementById("sd").className = "dot ok";
    document.getElementById("st").textContent = "Martha bereit · " + CONFIG.MODEL;
    renderFilters();
    applyFilters();
  } catch (_) {
    document.getElementById("st").textContent = "Fehler: tasks.json nicht gefunden";
  }
}

/** Inject a synthetic task at the front of the list and select it */
export function injectAndSelect(task) {
  state.tasks.unshift(task);
  if (state.selectedIdx >= 0) state.selectedIdx++;
  state.history[0] = [];
  renderFilters();
  applyFilters();
  sel(0);
}

export function renderFilters() {
  const counts = {};
  state.tasks.forEach(t => { const k = t.topic || "?"; counts[k] = (counts[k] || 0) + 1; });
  const el = document.getElementById("ff");
  let h = `<button class="fb on" onclick="window._sT('Alle',this)">Alle (${state.tasks.length})</button>`;
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    h += `<button class="fb" onclick="window._sT('${k}',this)">${k} (${v})</button>`;
  });
  el.innerHTML = h;
}

export function applyFilters() {
  state.filtered = state.tasks.filter(t => {
    if (state.topicFilter !== "Alle" && t.topic !== state.topicFilter) return false;
    if (state.levelFilter !== "all" && (t.source || {}).level !== state.levelFilter) return false;
    return true;
  });
  renderTaskList();
}

function topicClass(topic) {
  const s = (topic || "").toLowerCase();
  if (s.includes("analysis")) return "an";
  if (s.includes("stochastik")) return "st";
  if (s.includes("geometrie")) return "ge";
  return "al";
}

function topicIcon(topic) {
  const s = (topic || "").toLowerCase();
  if (s.includes("analysis")) return "f'";
  if (s.includes("stochastik")) return "P";
  if (s.includes("geometrie")) return "→";
  return "≡";
}

export function renderTaskList() {
  const el = document.getElementById("tl");
  if (!state.filtered.length) {
    el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--tx3)">Keine Aufgaben</div>';
    return;
  }
  el.innerHTML = state.filtered.map(t => {
    const ri = state.tasks.indexOf(t);
    const sr = t.source || {};
    const sel_class = ri === state.selectedIdx ? "sel" : "";
    return `<div class="ti ${sel_class}" onclick="window._sel(${ri})">
      <div class="tic ${topicClass(t.topic)}">${topicIcon(t.topic)}</div>
      <div class="tit">
        <div class="n">${esc(t.task_id || "Aufgabe")}</div>
        <div class="m">${esc(t.topic || "")} · ${sr.level || ""} · ${sr.year || ""}</div>
      </div>
      ${t.points ? `<div class="tip">${t.points} BE</div>` : ""}
    </div>`;
  }).join("");
}

// Expose filter functions to inline onclick handlers
window._sT = (topic, btn) => {
  state.topicFilter = topic;
  btn.parentElement.querySelectorAll(".fb").forEach(x => x.classList.remove("on"));
  btn.classList.add("on");
  applyFilters();
};
window._sL = (level, btn) => {
  state.levelFilter = level;
  btn.parentElement.querySelectorAll(".fb").forEach(x => x.classList.remove("on"));
  btn.classList.add("on");
  applyFilters();
};
// window._sel is set by chat.js — tasks.js must not import chat.js (circular)
window._sel = window._sel || ((i) => console.warn("_sel not ready yet, idx:", i));
