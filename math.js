// ── math.js ──────────────────────────────────────────────────────────────────
// Pure math utilities: function extraction, plot detection, canvas rendering,
// and KaTeX rendering. No API calls, no modal logic.

/** HTML-escape a string for safe innerHTML use */
export function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

/**
 * Convert plain-text math notation (as found in tasks.json) to LaTeX.
 * Handles patterns like: (1/2)·x³, f(x) = ..., x ∈ ℝ, etc.
 * Returns the string with $...$ wrapped LaTeX expressions.
 */
export function plainMathToLatex(text) {
  if (!text) return text;
  let t = text;

  // Already has LaTeX — don't double-process
  if (t.includes("$")) return t;

  // Protect inline code blocks
  // Step 1: normalize unicode math chars to ASCII equivalents first
  t = t.replace(/·/g, "*").replace(/⋅/g, "*");
  t = t.replace(/−/g, "-").replace(/–/g, "-");

  // Step 2: convert superscripts
  t = t.replace(/x²/g, "x^2").replace(/x³/g, "x^3").replace(/x⁴/g, "x^4");
  t = t.replace(/(\w)²/g, "$1^2").replace(/(\w)³/g, "$1^3").replace(/(\w)⁴/g, "$1^4");

  // Step 3: convert f(x) = ... expressions to LaTeX inline
  // Match: f(x) = <expression>, x ∈ ℝ  or  f(x) = <expression>.
  t = t.replace(
    /\b([fghp])\(x\)\s*=\s*([^,.\n]+?)(\s*[,.]|\s*,\s*x\s*∈|\s*$)/gm,
    (match, fn, expr, tail) => {
      const latexExpr = exprToLatex(expr.trim());
      const latexTail = tail.replace(/x\s*∈\s*ℝ/, ", x \\in \\mathbb{R}");
      return `$${fn}(x) = ${latexExpr}$${latexTail}`;
    }
  );

  // Step 4: standalone "x ∈ ℝ"
  t = t.replace(/\bx\s*∈\s*ℝ\b/g, "$x \\in \\mathbb{R}$");
  t = t.replace(/\bt\s*∈\s*ℝ\b/g, "$t \\in \\mathbb{R}$");

  // Step 5: "x = <number>" standalone (e.g. "an der Stelle x = 0")
  t = t.replace(/\bx\s*=\s*(-?\d+(?:[.,]\d+)?)\b/g, "$x = $1$");

  // Step 6: wrap remaining (a/b) fractions not yet in $
  t = t.replace(/(?<!\$[^$]*)\((\d+)\/(\d+)\)(?![^$]*\$)/g, "$\\frac{$1}{$2}$");

  return t;
}

/**
 * Convert a plain expression string like "(1/2)*x^3 - (6/28)*x^2"
 * to LaTeX like "\frac{1}{2}x^3 - \frac{6}{28}x^2"
 */
function exprToLatex(expr) {
  let e = expr;
  // (a/b) → \frac{a}{b}
  e = e.replace(/\((\d+)\/(\d+)\)/g, "\\frac{$1}{$2}");
  // bare a/b fractions
  e = e.replace(/\b(\d+)\/(\d+)\b/g, "\\frac{$1}{$2}");
  // e^(...) → e^{...}  (but keep it readable for KaTeX)
  e = e.replace(/e\^\(([^)]+)\)/g, "e^{$1}");
  // remove explicit * between number/closing-paren and x
  e = e.replace(/\*x/g, "x");
  e = e.replace(/\*e\^/g, " e^");
  e = e.replace(/(\d)\s*x/g, "$1x");
  return e;
}

/**
 * Convert plain-text math notation (as found in tasks.json) to LaTeX $...$
 * Only activates when no $ signs are present (avoids double-processing).
 */
export function plainMathToLatex(text) {
  if (!text) return text;
  // Already has LaTeX — don't double-process
  if (text.includes("$")) return text;

  let t = text;

  // Normalize unicode operators
  t = t.replace(/·/g, "*").replace(/⋅/g, "*");
  t = t.replace(/−/g, "-").replace(/–/g, "-");

  // Unicode superscripts → ASCII
  t = t.replace(/x²/g, "x^2").replace(/x³/g, "x^3").replace(/x⁴/g, "x^4");
  t = t.replace(/(\w)²/g, "$1^2").replace(/(\w)³/g, "$1^3").replace(/(\w)⁴/g, "$1^4");

  // f(x) = <expr>  followed by comma, period, "x ∈ ℝ", or end-of-line
  t = t.replace(
    /\b([fghpk])\(x\)\s*=\s*([^,\n]+?)(?=\s*,\s*x\s*[∈∊]|\s*,\s*$|\s*\.\s*[A-ZÜÖÄ]|\s*[,.]\s*x\s*∈|\s*$)/gm,
    (match, fn, expr) => `$${fn}(x) = ${exprToLatex(expr.trim())}$`
  );

  // "x ∈ ℝ" standalone
  t = t.replace(/\bx\s*[∈∊]\s*ℝ\b/g, "$x \\in \\mathbb{R}$");
  t = t.replace(/\bt\s*[∈∊]\s*ℝ\b/g, "$t \\in \\mathbb{R}$");

  // "x = <number>" standalone (e.g. "an der Stelle x = 0")
  t = t.replace(/\bx\s*=\s*(-?\d+(?:[.,]\d+)?)\b(?!\s*[+\-*/^])/g, "$x = $1$");

  // Remaining bare (a/b) fractions not yet wrapped
  t = t.replace(/(?<!\$)\((\d+)\/(\d+)\)/g, "$\\frac{$1}{$2}$");

  return t;
}

/** Run KaTeX on a DOM element — safe, no-op if KaTeX not loaded yet */
export function renderMath(el) {
  if (typeof renderMathInElement !== "function") return;
  try {
    renderMathInElement(el || document.body, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
        { left: "\\[", right: "\\]", display: true },
      ],
      throwOnError: false,
    });
  } catch (_) { /* KaTeX errors are non-fatal */ }
}

/**
 * Set element text and render LaTeX in one step.
 * Use this instead of el.innerHTML + renderMath() to avoid formula duplication.
 */
export function setTextAndRenderMath(el, text) {
  el.textContent = text;
  renderMath(el);
}

/** Extract f(x)=... expressions from task text for auto-plotting */
export function extractFunctions(text) {
  if (!text) return [];
  let t = text;
  t = t.replace(/\$\$?/g, " ");
  t = t.replace(/\\cdot/g, "*").replace(/·/g, "*").replace(/⋅/g, "*");
  t = t.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)");
  t = t.replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)");
  t = t.replace(/\\left/g, "").replace(/\\right/g, "");
  t = t.replace(/\\[,;]/g, " ");
  t = t.replace(/\\in/g, "").replace(/\\mathbb\{R\}/g, "").replace(/ℝ/g, "");
  t = t.replace(/∈/g, "").replace(/IR/g, "");
  t = t.replace(/²/g, "^2").replace(/³/g, "^3").replace(/⁴/g, "^4");
  t = t.replace(/π/g, "pi");
  t = t.replace(/(\d),(\d)/g, "$1.$2");
  t = t.replace(/−/g, "-").replace(/–/g, "-");
  t = t.replace(/e\^\{([^}]+)\}/g, "exp($1)");
  t = t.replace(/e\^\(([^)]+)\)/g, "exp($1)");
  t = t.replace(/e\^(-?[\w.*+\-/()]+)/g, "exp($1)");

  const results = [];
  const pat = /([fghDupw])\s*\(\s*x\s*\)\s*=\s*([^,;]+?)(?:\s*,\s*x|\s*\.\s|\s*$|\n)/gm;
  let m;
  while ((m = pat.exec(t)) !== null) {
    let expr = m[2].trim();
    if (expr.length < 3 || !expr.includes("x")) continue;
    expr = expr.replace(/(\d)([x(])/g, "$1*$2");
    expr = expr.replace(/([)])(\d)/g, "$1*$2");
    expr = expr.replace(/([x)])([x(])/g, "$1*$2");
    expr = expr.replace(/ln\(/g, "log(");
    results.push({ name: m[1], expr });
  }
  return results;
}

/** Guess a sensible x range for auto-plotting */
export function guessRange(expr) {
  let xmin = -5, xmax = 5;
  if (expr.includes("exp(-0.4") || expr.includes("exp(-0,4")) { xmin = 0; xmax = 20; }
  else if (expr.includes("exp(-x") || expr.includes("exp(-1")) { xmin = -2; xmax = 8; }
  else if (expr.includes("exp(2") || expr.includes("exp(2*x")) { xmin = -2; xmax = 2; }
  else if (expr.includes("sin") || expr.includes("cos")) { xmin = 0; xmax = 4 * Math.PI; }
  else if (expr.includes("log(") || expr.includes("ln(")) { xmin = -1; xmax = 10; }
  return [xmin, xmax];
}

/** Detect PLOT(expr, xmin, xmax) commands in LLM output */
export function detectPlots(text) {
  const t = text.replace(/−/g, "-").replace(/–/g, "-");
  const pats = [
    /\[\s*PLOT\s*:\s*(?:f\(x\)\s*=\s*)?(.+?)\s*:\s*([-\d.]+)\s*:\s*([-\d.]+)\s*\]/gi,
    /PLOT\s*\(\s*(?:f\(x\)\s*=\s*)?(.+?)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/gi,
    /PLOT\s*:\s*(?:f\(x\)\s*=\s*)?(.+?)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)/gi,
  ];
  const found = [];
  for (const p of pats) {
    let m;
    while ((m = p.exec(t)) !== null) {
      found.push({ expr: m[1].trim(), xmin: parseFloat(m[2]), xmax: parseFloat(m[3]) });
    }
    if (found.length) break;
  }
  return found;
}

// ── Canvas plotter ───────────────────────────────────────────────────────────

function niceStep(range, maxTicks) {
  const v = range / maxTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const rs = v / mag;
  if (rs <= 1.5) return mag;
  if (rs <= 3) return 2 * mag;
  if (rs <= 7) return 5 * mag;
  return 10 * mag;
}

function niceNum(n) {
  if (Math.abs(n) < 1e-10) return "0";
  if (Math.abs(n) >= 1000) return Math.round(n).toString();
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2).replace(/\.?0+$/, "");
}

/** Draw f(expr) on a canvas and append it to targetEl */
export function drawPlot(expr, xmin, xmax, targetEl) {
  const canvas = document.createElement("canvas");
  canvas.width = 400; canvas.height = 240;
  canvas.style.cssText = "width:100%;height:auto;border-radius:8px;background:#0f1117";

  const wrap = document.createElement("div");
  wrap.className = "pbox";
  wrap.appendChild(canvas);

  const lbl = document.createElement("div");
  lbl.className = "plbl";
  lbl.textContent = "f(x) = " + expr;
  wrap.appendChild(lbl);
  targetEl.appendChild(wrap);

  const ctx = canvas.getContext("2d");
  const W = 400, H = 240, pad = 40;

  // Compile expression with math.js
  let fn;
  try {
    const node = math.parse(expr.replace(/,/g, "."));
    const code = node.compile();
    fn = x => { try { return code.evaluate({ x, e: Math.E, pi: Math.PI, PI: Math.PI }); } catch (_) { return NaN; } };
  } catch (ex) {
    ctx.fillStyle = "#f87171";
    ctx.font = "13px -apple-system,sans-serif";
    ctx.fillText("Parse-Fehler: " + ex.message, 12, H / 2);
    return;
  }

  // Sample points
  const steps = 500, dx = (xmax - xmin) / steps;
  const pts = []; let ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const x = xmin + i * dx, y = fn(x);
    if (isFinite(y) && !isNaN(y)) { pts.push({ x, y }); if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
  }
  if (pts.length < 2) {
    ctx.fillStyle = "#f87171"; ctx.font = "13px -apple-system,sans-serif";
    ctx.fillText("Keine darstellbaren Werte", 12, H / 2); return;
  }

  const yR = ymax - ymin || 1; ymin -= yR * .1; ymax += yR * .1;
  const toX = x => pad + (x - xmin) / (xmax - xmin) * (W - 2 * pad);
  const toY = y => H - pad - (y - ymin) / (ymax - ymin) * (H - 2 * pad);

  // Background + grid
  ctx.fillStyle = "#0f1117"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#1c1f2b"; ctx.lineWidth = 1;
  ctx.font = "11px -apple-system,sans-serif"; ctx.fillStyle = "#555a73"; ctx.textAlign = "center";

  const xStep = niceStep(xmax - xmin, 8), xStart = Math.ceil(xmin / xStep) * xStep;
  for (let x = xStart; x <= xmax; x += xStep) {
    const px = toX(x); ctx.beginPath(); ctx.moveTo(px, pad); ctx.lineTo(px, H - pad); ctx.stroke();
    ctx.fillText(niceNum(x), px, H - pad + 16);
  }
  ctx.textAlign = "right";
  const yStep = niceStep(ymax - ymin, 6), yStart = Math.ceil(ymin / yStep) * yStep;
  for (let y = yStart; y <= ymax; y += yStep) {
    const py = toY(y); ctx.beginPath(); ctx.moveTo(pad, py); ctx.lineTo(W - pad, py); ctx.stroke();
    ctx.fillText(niceNum(y), pad - 8, py + 4);
  }

  // Axes
  ctx.strokeStyle = "#3a3f55"; ctx.lineWidth = 1.5;
  if (xmin <= 0 && xmax >= 0) { const ax = toX(0); ctx.beginPath(); ctx.moveTo(ax, pad); ctx.lineTo(ax, H - pad); ctx.stroke(); }
  if (ymin <= 0 && ymax >= 0) { const ay = toY(0); ctx.beginPath(); ctx.moveTo(pad, ay); ctx.lineTo(W - pad, ay); ctx.stroke(); }

  // Glow + curve
  const drawCurve = (strokeStyle, lineWidth) => {
    ctx.strokeStyle = strokeStyle; ctx.lineWidth = lineWidth; ctx.lineJoin = "round";
    ctx.beginPath(); let started = false;
    for (const p of pts) {
      const px = toX(p.x), py = toY(p.y);
      if (py >= pad - 10 && py <= H - pad + 10) { if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py); }
      else started = false;
    }
    ctx.stroke();
  };
  drawCurve("rgba(124,108,255,0.15)", 8);
  drawCurve("#7c6cff", 2.5);
}

/** Auto-detect and draw all plots from LLM text into a container element */
export function renderPlotsFromText(text, containerEl, label = "📈 Függvény:") {
  const plots = detectPlots(text);
  const funcs = plots.length ? [] : extractFunctions(text);

  const items = plots.length
    ? plots.map(p => ({ expr: p.expr, xmin: p.xmin, xmax: p.xmax }))
    : funcs.map(f => { const [xmin, xmax] = guessRange(f.expr); return { expr: f.expr, xmin, xmax }; });

  if (!items.length) return;

  const section = document.createElement("div");
  section.style.cssText = "margin-top:12px;border-top:1px solid var(--bd);padding-top:10px";
  const lbl = document.createElement("div");
  lbl.style.cssText = "font-size:.75rem;color:var(--ac);font-weight:600;margin-bottom:6px";
  lbl.textContent = label;
  section.appendChild(lbl);
  items.forEach(({ expr, xmin, xmax }) => {
    try { drawPlot(expr, xmin, xmax, section); }
    catch (ex) {
      const err = document.createElement("div");
      err.className = "abw"; err.textContent = "Rajzolási hiba: " + ex.message;
      section.appendChild(err);
    }
  });
  containerEl.appendChild(section);
}
