// ── login.js ─────────────────────────────────────────────────────────────────
// PIN login screen logic. No business logic here, only auth flow.

import { CONFIG } from "./config.js";
import { state } from "./state.js";
import { init } from "./tasks.js";

let pinEntry = "";

async function hashPin(pin) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
}

function renderPinPad() {
  const dots = document.getElementById("pin-dots");
  dots.innerHTML = "";
  for (let i = 0; i < CONFIG.PIN_LEN; i++) {
    const d = document.createElement("div");
    d.className = "pin-dot" + (i < pinEntry.length ? " filled" : "");
    dots.appendChild(d);
  }

  const pad = document.getElementById("pin-pad");
  pad.innerHTML = "";
  [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, "del"].forEach(k => {
    if (k === null) { pad.appendChild(document.createElement("div")); return; }
    const btn = document.createElement("button");
    btn.className = "pin-key" + (k === "del" ? " del" : "");
    btn.textContent = k === "del" ? "⌫" : k;
    btn.onclick = () => handlePinKey(k);
    pad.appendChild(btn);
  });
}

function handlePinKey(k) {
  if (k === "del") { pinEntry = pinEntry.slice(0, -1); renderPinPad(); return; }
  if (pinEntry.length >= CONFIG.PIN_LEN) return;
  pinEntry += k;
  renderPinPad();
  if (pinEntry.length === CONFIG.PIN_LEN) setTimeout(() => tryPin(pinEntry), 200);
}

async function tryPin(pin) {
  const hash = await hashPin(pin);
  if (hash === CONFIG.PIN_HASH) {
    state.storedPin = pin;
    document.getElementById("login").style.display = "none";
    document.getElementById("app").style.display = "flex";
    init();
  } else {
    pinEntry = "";
    document.getElementById("pin-err").textContent = "Falscher PIN. Versuche es nochmal.";
    document.querySelectorAll(".pin-dot").forEach(d => d.classList.add("wrong"));
    setTimeout(() => {
      document.getElementById("pin-err").textContent = "";
      renderPinPad();
    }, 1200);
  }
}

export function initLogin() {
  renderPinPad();
}
