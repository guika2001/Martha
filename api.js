// ── api.js ──────────────────────────────────────────────────────────────────
// All network communication with the Groq API proxy.
// No DOM access here — pure data in, data out.

import { CONFIG, SYSTEM_PROMPT } from "./config.js";
import { state } from "./state.js";
import { plainMathToLatex } from "./math.js";

/** Build task context string for the system prompt */
export function buildContext(task) {
  const question = plainMathToLatex(task.question || "Kein Text.");
  const parts = [
    `AUFGABE: ${task.task_id || "Aufgabe"}`,
    `THEMA: ${task.topic || "?"} - ${task.subtopic || "?"}`,
    `PUNKTE: ${task.points || "?"} BE`,
    `KURS: ${(task.source || {}).level || "?"}`,
    `\nAUFGABENTEXT:\n${question}`,
  ];
  if (task.expected_answer) {
    parts.push(`\nOFFIZIELLE MUSTERLOESUNG:\n${plainMathToLatex(task.expected_answer)}`);
  }
  return parts.join("\n");
}

/** Async generator — streams tokens from Groq */
export async function* streamGroq(messages, taskContext) {
  const fullSys = SYSTEM_PROMPT + "\n\n--- AKTUELLE AUFGABE ---\n" + taskContext;
  const msgs = [{ role: "system", content: fullSys }, ...messages];

  const resp = await fetch(CONFIG.API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CONFIG.MODEL,
      messages: msgs,
      stream: true,
      temperature: 0.4,
      max_tokens: 1500,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    if (resp.status === 401) yield "API Key ungültig. Bitte kontaktiere deinen Lehrer.";
    else yield `Fehler (${resp.status}): ${err.error?.message || "Unbekannter Fehler"}`;
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);
        const token = parsed.choices?.[0]?.delta?.content;
        if (token) yield token;
      } catch (_) { /* skip malformed chunks */ }
    }
  }
}

/** Single non-streaming call — returns full response text */
export async function callGroq({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 900, model = null }) {
  const resp = await fetch(CONFIG.API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || CONFIG.MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: false,
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!resp.ok) throw new Error(`API error ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

/** Streaming call for upload/photo analysis — returns full text */
export async function streamToElement({ systemPrompt, userContent, model, targetEl, temperature = 0.1, maxTokens = 1000 }) {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
  const resp = await fetch(CONFIG.API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: model || CONFIG.MODEL, messages, stream: true, temperature, max_tokens: maxTokens }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${resp.status}`);
  }
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "", full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const d = line.slice(6).trim();
      if (d === "[DONE]") break;
      try {
        const p = JSON.parse(d);
        const tok = p.choices?.[0]?.delta?.content;
        if (tok) { full += tok; if (targetEl) targetEl.textContent = full; }
      } catch (_) { /* skip */ }
    }
  }
  return full;
}
