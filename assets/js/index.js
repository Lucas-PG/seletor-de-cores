const imageInput = document.getElementById("imageUpload");
const uploadBox  = document.getElementById("uploadBox");
const toolOutput = document.getElementById("toolOutput");

let imageCounter = 0;
let multiMode    = false;
const imageUrls     = new Map(); // card element → object URL
const imageCleanups = new Map(); // card element → cleanup fn

// ── Toast ────────────────────────────────────────────────────────────────────

function toast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  container.replaceChildren();
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.textContent = message;
  container.appendChild(node);
  requestAnimationFrame(() => node.classList.add("show"));
  setTimeout(() => {
    node.classList.remove("show");
    setTimeout(() => node.remove(), 180);
  }, 2200);
}

// ── Color math ───────────────────────────────────────────────────────────────

function rgbToHex(r, g, b) {
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToHsl(r, g, b) {
  const nr = r / 255, ng = g / 255, nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case nr: h = (ng - nb) / d + (ng < nb ? 6 : 0); break;
      case ng: h = (nb - nr) / d + 2; break;
      default: h = (nr - ng) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hexToRgb(hex) {
  const v = parseInt(hex.replace("#", ""), 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, v: v * 100 };
}

function hsvToRgb(h, s, v) {
  h /= 360; s /= 100; v /= 100;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ── Custom colour picker ──────────────────────────────────────────────────────

const colorPicker = (() => {
  let currentH = 0, currentS = 100, currentV = 100;
  let onChangeFn = null;
  let onCommitFn = null;
  let justOpened = false;

  // ── DOM ──
  const popup = document.createElement("div");
  popup.className = "color-picker-popup";
  popup.hidden = true;
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", "Seletor de cor");

  const gradientBox = document.createElement("div");
  gradientBox.className = "cp-gradient-box";

  const gradCursor = document.createElement("div");
  gradCursor.className = "cp-cursor";
  gradientBox.appendChild(gradCursor);

  const bottomRow = document.createElement("div");
  bottomRow.className = "cp-bottom-row";

  const hueSlider = document.createElement("div");
  hueSlider.className = "cp-hue-slider";

  const hueCursor = document.createElement("div");
  hueCursor.className = "cp-hue-cursor";
  hueSlider.appendChild(hueCursor);

  const preview = document.createElement("div");
  preview.className = "cp-preview";

  bottomRow.append(hueSlider, preview);
  popup.append(gradientBox, bottomRow);
  document.body.appendChild(popup);

  // ── Helpers ──
  const relativePos = (e, el) => {
    const r = el.getBoundingClientRect();
    return {
      x: clamp((e.clientX - r.left) / r.width,  0, 1),
      y: clamp((e.clientY - r.top)  / r.height, 0, 1),
    };
  };

  const updateUI = () => {
    gradientBox.style.background = `
      linear-gradient(to bottom, transparent, #000),
      linear-gradient(to right, #fff, hsl(${currentH}, 100%, 50%))`;
    gradCursor.style.left = `${currentS}%`;
    gradCursor.style.top  = `${100 - currentV}%`;
    hueCursor.style.left  = `${(currentH / 360) * 100}%`;
    const { r, g, b } = hsvToRgb(currentH, currentS, currentV);
    const hex = rgbToHex(r, g, b);
    gradCursor.style.background = hex;
    hueCursor.style.background  = `hsl(${currentH}, 100%, 50%)`;
    preview.style.background    = hex;
  };

  const emit = () => {
    const { r, g, b } = hsvToRgb(currentH, currentS, currentV);
    if (typeof onChangeFn === "function") onChangeFn(r, g, b);
  };

  // ── Gradient box drag ──
  let dragTarget = null;

  gradientBox.addEventListener("pointerdown", (e) => {
    dragTarget = "gradient";
    gradientBox.setPointerCapture(e.pointerId);
    const { x, y } = relativePos(e, gradientBox);
    currentS = x * 100; currentV = (1 - y) * 100;
    updateUI(); emit(); e.preventDefault();
  });
  gradientBox.addEventListener("pointermove", (e) => {
    if (dragTarget !== "gradient") return;
    const { x, y } = relativePos(e, gradientBox);
    currentS = x * 100; currentV = (1 - y) * 100;
    updateUI(); emit(); e.preventDefault();
  });
  gradientBox.addEventListener("pointerup", () => {
    if (dragTarget !== "gradient") return;
    dragTarget = null;
    const { r, g, b } = hsvToRgb(currentH, currentS, currentV);
    if (typeof onCommitFn === "function") onCommitFn(r, g, b);
  });
  gradientBox.addEventListener("pointercancel", () => { dragTarget = null; });

  // ── Hue slider drag ──
  hueSlider.addEventListener("pointerdown", (e) => {
    dragTarget = "hue";
    hueSlider.setPointerCapture(e.pointerId);
    currentH = relativePos(e, hueSlider).x * 360;
    updateUI(); emit(); e.preventDefault();
  });
  hueSlider.addEventListener("pointermove", (e) => {
    if (dragTarget !== "hue") return;
    currentH = relativePos(e, hueSlider).x * 360;
    updateUI(); emit(); e.preventDefault();
  });
  hueSlider.addEventListener("pointerup", () => {
    if (dragTarget !== "hue") return;
    dragTarget = null;
    const { r, g, b } = hsvToRgb(currentH, currentS, currentV);
    if (typeof onCommitFn === "function") onCommitFn(r, g, b);
  });
  hueSlider.addEventListener("pointercancel", () => { dragTarget = null; });

  // ── Close on outside click ──
  document.addEventListener("pointerdown", (e) => {
    if (popup.hidden || justOpened) return;
    if (!popup.contains(e.target)) popup.hidden = true;
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !popup.hidden) popup.hidden = true;
  });

  // ── Public API ──
  const show = (hex, anchor, onChange, onCommit) => {
    onChangeFn = onChange;
    onCommitFn = onCommit;
    const { r, g, b } = hexToRgb(hex || "#ff0000");
    ({ h: currentH, s: currentS, v: currentV } = rgbToHsv(r, g, b));
    updateUI();
    popup.hidden = false;
    justOpened = true;
    requestAnimationFrame(() => { justOpened = false; });

    // Position: prefer below anchor, fall back to above — measure after showing
    const rect = anchor.getBoundingClientRect();
    const pw = popup.offsetWidth;
    const ph = popup.offsetHeight;
    let top  = rect.bottom + 6;
    let left = rect.left;
    if (top  + ph > window.innerHeight - 8) top  = rect.top - ph - 6;
    if (left + pw > window.innerWidth  - 8) left = window.innerWidth - pw - 8;
    popup.style.top  = `${Math.max(8, top)}px`;
    popup.style.left = `${Math.max(8, left)}px`;
  };

  return { show };
})();

// ── Palette extraction ────────────────────────────────────────────────────────

function colorDistanceSq(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return (dr * dr) + (dg * dg) + (db * db);
}

function extractPalette(canvas, numColors = 6) {
  const THUMB = 140;
  const STEP = 20;
  const tmp = document.createElement("canvas");
  tmp.width = THUMB;
  tmp.height = THUMB;
  const ctx = tmp.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, THUMB, THUMB);
  const { data } = ctx.getImageData(0, 0, THUMB, THUMB);

  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const qr = Math.floor(r / STEP);
    const qg = Math.floor(g / STEP);
    const qb = Math.floor(b / STEP);
    const bucketKey = `${qr}-${qg}-${qb}`;

    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = { count: 0, exact: new Map() };
      buckets.set(bucketKey, bucket);
    }
    bucket.count += 1;

    const exactKey = (r << 16) | (g << 8) | b;
    bucket.exact.set(exactKey, (bucket.exact.get(exactKey) || 0) + 1);
  }

  const sortedBuckets = [...buckets.values()].sort((a, b) => b.count - a.count);
  const palette = [];
  for (const bucket of sortedBuckets) {
    if (palette.length >= numColors) break;

    let topExactKey = null;
    let topCount = 0;
    for (const [exactKey, count] of bucket.exact.entries()) {
      if (count > topCount) {
        topCount = count;
        topExactKey = exactKey;
      }
    }
    if (topExactKey === null) continue;

    const candidate = {
      r: (topExactKey >> 16) & 0xff,
      g: (topExactKey >> 8) & 0xff,
      b: topExactKey & 0xff,
    };
    const tooClose = palette.some((picked) => colorDistanceSq(candidate, picked) < (58 * 58));
    if (!tooClose) palette.push(candidate);
  }

  return palette;
}

function populatePalette(canvas, refs, onSwatchSelect) {
  const palette = extractPalette(canvas);
  if (!palette.length) return;
  refs.paletteSection.classList.remove("is-hidden");
  refs.paletteSwatches.replaceChildren();
  let activeSwatch = null;
  const clearHighlight = () => {
    if (!activeSwatch) return;
    activeSwatch.classList.remove("is-active");
    activeSwatch = null;
    if (typeof onSwatchSelect === "function") onSwatchSelect(null);
  };

  for (const color of palette) {
    const { r, g, b } = color;
    const hex = rgbToHex(r, g, b);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "palette-swatch";
    btn.style.background = hex;
    btn.title = hex;
    btn.setAttribute("aria-label", `Mostrar áreas da cor ${hex}`);
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(hex)
        .then(() => toast(`${hex} copiado.`, "success"))
        .catch(() => toast("Não foi possível copiar.", "error"));

      if (activeSwatch === btn) {
        clearHighlight();
        return;
      }
      if (activeSwatch) activeSwatch.classList.remove("is-active");
      activeSwatch = btn;
      activeSwatch.classList.add("is-active");
      if (typeof onSwatchSelect === "function") onSwatchSelect({ ...color, hex });
    });
    refs.paletteSwatches.appendChild(btn);
  }

  return { clearHighlight };
}

// ── Color history (per card) ──────────────────────────────────────────────────

function addToHistory(hex, cardHistory, refs, onSelect) {
  if (cardHistory[0] === hex) return;
  cardHistory.unshift(hex);
  if (cardHistory.length > 10) cardHistory.pop();
  refs.historySection.classList.remove("is-hidden");
  refs.historySwatches.replaceChildren();
  for (const h of cardHistory) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "history-swatch";
    btn.style.background = h;
    btn.title = h;
    btn.setAttribute("aria-label", `Selecionar ${h}`);
    btn.addEventListener("click", () => {
      const { r, g, b } = hexToRgb(h);
      if (typeof onSelect === "function") onSelect(r, g, b);
      navigator.clipboard.writeText(h)
        .then(() => toast(`${h} copiado.`, "success"))
        .catch(() => toast("Não foi possível copiar.", "error"));
    });
    refs.historySwatches.appendChild(btn);
  }
}

// ── UI builder ────────────────────────────────────────────────────────────────

function makeCodeRow(container, label) {
  const row = document.createElement("div");
  row.className = "color-code-row";

  const tag = document.createElement("div");
  tag.className = "color-code-label";
  tag.textContent = label;

  const input = document.createElement("input");
  input.type = "text";
  input.readOnly = true;
  input.placeholder = "—";

  const copyBtn = document.createElement("button");
  copyBtn.className = "code-copy-btn";
  copyBtn.type = "button";
  copyBtn.setAttribute("aria-label", `Copiar ${label}`);

  const icon = document.createElement("img");
  icon.src = "/assets/icons/copy-regular-full.svg";
  icon.alt = "Copiar";
  copyBtn.appendChild(icon);

  const doCopy = () => {
    if (!input.value) { toast("Selecione uma cor antes de copiar.", "info"); return; }
    navigator.clipboard.writeText(input.value)
      .then(() => {
        toast(`${label} copiado.`, "success");
        icon.style.opacity = "0.1";
        setTimeout(() => { icon.style.opacity = ""; }, 200);
      })
      .catch(() => toast("Não foi possível copiar.", "error"));
  };
  input.addEventListener("click", doCopy);
  copyBtn.addEventListener("click", doCopy);

  row.append(tag, input, copyBtn);
  container.appendChild(row);
  return input;
}

function buildColorPanel() {
  const panel = document.createElement("div");
  panel.className = "color-panel";

  // Big swatch
  const display = document.createElement("div");
  display.className = "color-display";

  const swatchLarge = document.createElement("div");
  swatchLarge.className = "color-swatch-large";

  const swatchInfo = document.createElement("div");
  swatchInfo.className = "color-swatch-info";

  const swatchHex = document.createElement("span");
  swatchHex.className = "color-swatch-hex";
  swatchHex.textContent = "—";

  const swatchDot = document.createElement("span");
  swatchDot.className = "color-swatch-dot";

  swatchInfo.append(swatchHex, swatchDot);
  display.append(swatchLarge, swatchInfo);
  panel.appendChild(display);

  // Code rows
  const codes = document.createElement("div");
  codes.className = "color-codes";
  const outHex  = makeCodeRow(codes, "HEX");
  const outRGBA = makeCodeRow(codes, "RGBA");
  const outHsl  = makeCodeRow(codes, "HSL");
  panel.appendChild(codes);

  // Palette
  const paletteSection = document.createElement("div");
  paletteSection.className = "palette-section is-hidden";
  const palLabel = document.createElement("span");
  palLabel.className = "section-label";
  palLabel.textContent = "Paleta dominante";
  const paletteSwatches = document.createElement("div");
  paletteSwatches.className = "palette-swatches";
  paletteSection.append(palLabel, paletteSwatches);
  panel.appendChild(paletteSection);

  // History
  const historySection = document.createElement("div");
  historySection.className = "history-section is-hidden";
  const histLabel = document.createElement("span");
  histLabel.className = "section-label";
  histLabel.textContent = "Histórico";
  const historySwatches = document.createElement("div");
  historySwatches.className = "history-swatches";
  historySection.append(histLabel, historySwatches);
  panel.appendChild(historySection);

  return {
    panel,
    refs: { outHex, outRGBA, outHsl, swatchLarge, swatchHex, swatchDot, paletteSection, paletteSwatches, historySection, historySwatches },
  };
}

// ── Loupe setup ───────────────────────────────────────────────────────────────

const loupe = document.createElement("div");
loupe.id = "loupe";
loupe.innerHTML = `
  <canvas id="loupeCanvas" width="220" height="220"></canvas>
  <div id="loupeCenter" aria-hidden="true"></div>
  <div id="loupeHex" aria-live="polite">#000000</div>
`;
document.body.appendChild(loupe);

const loupeCanvas = document.getElementById("loupeCanvas");
const loupeCtx    = loupeCanvas.getContext("2d", { willReadFrequently: true });
const loupeCenter = document.getElementById("loupeCenter");
const loupeHex    = document.getElementById("loupeHex");
const loupeSize   = 220;
const sampleSize  = 13;

function setupLoupeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  loupeCanvas.width  = Math.round(loupeSize * dpr);
  loupeCanvas.height = Math.round(loupeSize * dpr);
  loupeCtx.setTransform(1, 0, 0, 1, 0, 0);
  loupeCtx.scale(dpr, dpr);
}
setupLoupeCanvas();
window.addEventListener("resize", setupLoupeCanvas);

// ── Pixel picker ──────────────────────────────────────────────────────────────

function getImageXY(point, img) {
  const rect = img.getBoundingClientRect();
  const mx = point.clientX - rect.left;
  const my = point.clientY - rect.top;
  const xFloat = clamp((mx / rect.width)  * img.naturalWidth,  0, img.naturalWidth  - 1);
  const yFloat = clamp((my / rect.height) * img.naturalHeight, 0, img.naturalHeight - 1);
  return { x: Math.round(xFloat), y: Math.round(yFloat), xFloat, yFloat };
}

// Returns cleanup + palette highlight controls for this image card
function attachPicker(img, sourceCanvas, sourceCtx, refs, overlayCanvas) {
  const pixelBlock = loupeSize / sampleSize;
  const cardHistory = [];
  let currentImgX = 0;
  let currentImgY = 0;
  let loupeActive = false;
  const overlayCtx = overlayCanvas ? overlayCanvas.getContext("2d", { willReadFrequently: true }) : null;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const overlayMaskCache = new Map();
  let sourceData = null;
  let activeHighlightedRGB = null;

  const getImageDrawRect = () => {
    const rect = img.getBoundingClientRect();
    const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
    const width = img.naturalWidth * scale;
    const height = img.naturalHeight * scale;
    return {
      canvasWidth: rect.width,
      canvasHeight: rect.height,
      x: (rect.width - width) / 2,
      y: (rect.height - height) / 2,
      width,
      height,
    };
  };

  const syncOverlaySize = () => {
    if (!overlayCanvas || !overlayCtx) return;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const targetWidth = Math.round(rect.width * dpr);
    const targetHeight = Math.round(rect.height * dpr);
    if (overlayCanvas.width !== targetWidth || overlayCanvas.height !== targetHeight) {
      overlayCanvas.width = targetWidth;
      overlayCanvas.height = targetHeight;
      overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
      overlayCtx.scale(dpr, dpr);
    }
  };

  const buildMaskForColor = (rgb) => {
    const cacheKey = `${rgb.r}-${rgb.g}-${rgb.b}`;
    const cached = overlayMaskCache.get(cacheKey);
    if (cached) return cached;

    if (!sourceData) sourceData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;

    const mask = document.createElement("canvas");
    mask.width = sourceCanvas.width;
    mask.height = sourceCanvas.height;
    const maskCtx = mask.getContext("2d", { willReadFrequently: true });
    const output = maskCtx.createImageData(mask.width, mask.height);
    const out = output.data;
    const toleranceSq = 28 * 28;
    let matches = 0;

    for (let i = 0; i < sourceData.length; i += 4) {
      if (sourceData[i + 3] < 30) continue;
      const dr = sourceData[i] - rgb.r;
      const dg = sourceData[i + 1] - rgb.g;
      const db = sourceData[i + 2] - rgb.b;
      if ((dr * dr) + (dg * dg) + (db * db) <= toleranceSq) {
        out[i] = sourceData[i];
        out[i + 1] = sourceData[i + 1];
        out[i + 2] = sourceData[i + 2];
        out[i + 3] = 235;
        matches += 1;
      }
    }

    maskCtx.putImageData(output, 0, 0);
    const result = { mask, matches };
    overlayMaskCache.set(cacheKey, result);
    return result;
  };

  const renderColorAreas = (rgb, hexForToast = null) => {
    if (!overlayCanvas || !overlayCtx) return;
    syncOverlaySize();
    const { canvasWidth, canvasHeight, x, y, width, height } = getImageDrawRect();
    overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    if (!rgb) return;

    const { mask, matches } = buildMaskForColor(rgb);
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    overlayCtx.fillStyle = luminance < 0.25
      ? "rgba(235, 235, 248, 0.84)"
      : "rgba(8, 10, 14, 0.8)";
    overlayCtx.fillRect(x, y, width, height);
    overlayCtx.drawImage(mask, x, y, width, height);

    if (!matches && hexForToast) toast(`Nenhuma área encontrada para ${hexForToast}.`, "info");
  };

  const highlightColorAreas = (color) => {
    if (!color) {
      activeHighlightedRGB = null;
      renderColorAreas(null);
      return;
    }
    activeHighlightedRGB = { r: color.r, g: color.g, b: color.b };
    renderColorAreas(activeHighlightedRGB, color.hex);
  };

  const refreshHighlight = () => {
    if (!activeHighlightedRGB) return;
    renderColorAreas(activeHighlightedRGB);
  };

  const drawLoupe = (x, y) => {
    const half = Math.floor(sampleSize / 2);
    const sx = clamp(x - half, 0, sourceCanvas.width  - sampleSize);
    const sy = clamp(y - half, 0, sourceCanvas.height - sampleSize);

    loupeCtx.clearRect(0, 0, loupeSize, loupeSize);
    loupeCtx.imageSmoothingEnabled = false;
    loupeCtx.drawImage(sourceCanvas, sx, sy, sampleSize, sampleSize, 0, 0, loupeSize, loupeSize);

    loupeCtx.strokeStyle = "rgba(0, 0, 0, 0.12)";
    loupeCtx.lineWidth = 1;
    for (let i = 0; i <= sampleSize; i++) {
      loupeCtx.beginPath(); loupeCtx.moveTo(i * pixelBlock, 0); loupeCtx.lineTo(i * pixelBlock, loupeSize); loupeCtx.stroke();
      loupeCtx.beginPath(); loupeCtx.moveTo(0, i * pixelBlock); loupeCtx.lineTo(loupeSize, i * pixelBlock); loupeCtx.stroke();
    }
    const hx = (x - sx) * pixelBlock;
    const hy = (y - sy) * pixelBlock;
    loupeCtx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    loupeCtx.lineWidth = 2;
    loupeCtx.strokeRect(hx, hy, pixelBlock, pixelBlock);
  };

  const getPixelColor = (x, y) => {
    const [r, g, b, a] = sourceCtx.getImageData(x, y, 1, 1).data;
    return { r, g, b, alpha: +(a / 255).toFixed(2), hex: rgbToHex(r, g, b), hsl: rgbToHsl(r, g, b) };
  };

  const updateLiveOverlay = (hex) => {
    loupe.style.setProperty("--loupe-color", hex);
    loupeCenter.style.borderColor = hex;
    loupeHex.textContent = hex;
  };

  const applyColorRGB = (r, g, b, alpha = 1, skipHistory = false) => {
    const hex = rgbToHex(r, g, b);
    const hsl = rgbToHsl(r, g, b);
    refs.outHex.value  = hex;
    refs.outRGBA.value = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    refs.outHsl.value  = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
    refs.swatchLarge.style.background = hex;
    refs.swatchHex.textContent = hex;
    refs.swatchDot.style.background = hex;
    if (!skipHistory) addToHistory(hex, cardHistory, refs, applyColorRGB);
  };

  const applyColor = (x, y) => {
    const { r, g, b, alpha } = getPixelColor(x, y);
    applyColorRGB(r, g, b, alpha);
  };

  refs.swatchLarge.setAttribute("title", "Clique para alterar a cor");
  refs.swatchLarge.addEventListener("click", () => {
    colorPicker.show(
      refs.outHex.value || "#ff0000",
      refs.swatchLarge,
      (r, g, b) => applyColorRGB(r, g, b, 1, true),  // drag — no history
      (r, g, b) => applyColorRGB(r, g, b),             // commit (pointerup) — adds to history
    );
  });

  const positionLoupe = (point) => {
    const half = loupeSize / 2;
    loupe.style.transform = `translate(${point.clientX - half}px, ${point.clientY - half}px)`;
  };

  const positionLoupeFromImageCoords = (x, y) => {
    const rect = img.getBoundingClientRect();
    const clientX = rect.left + (x / img.naturalWidth)  * rect.width;
    const clientY = rect.top  + (y / img.naturalHeight) * rect.height;
    const half = loupeSize / 2;
    loupe.style.transform = `translate(${clientX - half}px, ${clientY - half}px)`;
  };

  const renderPreviewAtPoint = (point) => {
    const { x, y } = getImageXY(point, img);
    currentImgX = x; currentImgY = y;
    const { hex } = getPixelColor(x, y);
    drawLoupe(x, y);
    updateLiveOverlay(hex);
  };

  let previewRafId = null;
  let pendingPreviewPoint = null;

  const schedulePreviewRender = () => {
    if (previewRafId !== null) return;
    previewRafId = window.requestAnimationFrame(() => {
      previewRafId = null;
      if (!pendingPreviewPoint) return;
      renderPreviewAtPoint(pendingPreviewPoint);
      pendingPreviewPoint = null;
    });
  };

  const previewAtPoint = (point, sync = false) => {
    loupe.style.display = "block";
    positionLoupe(point);
    if (sync) {
      renderPreviewAtPoint(point);
      pendingPreviewPoint = null;
      if (previewRafId !== null) { window.cancelAnimationFrame(previewRafId); previewRafId = null; }
      return;
    }
    pendingPreviewPoint = { clientX: point.clientX, clientY: point.clientY };
    schedulePreviewRender();
  };

  // Arrow-key navigation
  const onKeydown = (event) => {
    if (!loupeActive) return;
    let dx = 0, dy = 0;
    switch (event.key) {
      case "ArrowLeft":  dx = -1; break;
      case "ArrowRight": dx =  1; break;
      case "ArrowUp":    dy = -1; break;
      case "ArrowDown":  dy =  1; break;
      default: return;
    }
    event.preventDefault();
    currentImgX = clamp(currentImgX + dx, 0, img.naturalWidth  - 1);
    currentImgY = clamp(currentImgY + dy, 0, img.naturalHeight - 1);
    drawLoupe(currentImgX, currentImgY);
    const { hex } = getPixelColor(currentImgX, currentImgY);
    updateLiveOverlay(hex);
    positionLoupeFromImageCoords(currentImgX, currentImgY);
    applyColor(currentImgX, currentImgY);
  };
  document.addEventListener("keydown", onKeydown);
  window.addEventListener("resize", refreshHighlight);

  let isPointerDown = false;
  let activePointerType = "mouse";

  img.addEventListener("pointerdown", (e) => {
    isPointerDown = true; loupeActive = true;
    activePointerType = e.pointerType || "mouse";
    img.setPointerCapture(e.pointerId);
    previewAtPoint(e, true);
    e.preventDefault();
  });

  img.addEventListener("pointermove", (e) => {
    if (isPointerDown) { previewAtPoint(e); e.preventDefault(); return; }
    if (e.pointerType === "mouse") previewAtPoint(e);
  });

  img.addEventListener("pointerenter", (e) => {
    if (e.pointerType === "mouse") { img.classList.add("is-picking"); loupeActive = true; }
  });

  const stopPointer = (e) => {
    if (!isPointerDown) return;
    previewAtPoint(e, true);
    isPointerDown = false;
    img.releasePointerCapture(e.pointerId);
    if (activePointerType !== "mouse") {
      applyColor(...Object.values(getImageXY(e, img)).slice(0, 2));
      loupe.style.display = "none";
    }
  };

  img.addEventListener("pointerup", stopPointer);
  img.addEventListener("click", (e) => {
    if (activePointerType !== "mouse") return;
    previewAtPoint(e, true);
    const { x, y } = getImageXY(e, img);
    applyColor(x, y);
  });
  img.addEventListener("pointercancel", () => {
    isPointerDown = false; loupeActive = false;
    pendingPreviewPoint = null;
    if (previewRafId !== null) { window.cancelAnimationFrame(previewRafId); previewRafId = null; }
    loupe.style.display = "none";
    img.classList.remove("is-picking");
  });
  img.addEventListener("mouseleave", () => {
    loupeActive = false; pendingPreviewPoint = null;
    if (previewRafId !== null) { window.cancelAnimationFrame(previewRafId); previewRafId = null; }
    loupe.style.display = "none";
    img.classList.remove("is-picking");
  });

  // Return cleanup and callbacks for the card lifecycle
  return {
    cleanup: () => {
      document.removeEventListener("keydown", onKeydown);
      window.removeEventListener("resize", refreshHighlight);
    },
    highlightColorAreas,
    applyColorRGB,
  };
}

// ── Image file handling ───────────────────────────────────────────────────────

function clearAllImages() {
  for (const cleanup of imageCleanups.values()) cleanup();
  imageCleanups.clear();
  for (const url of imageUrls.values()) URL.revokeObjectURL(url);
  imageUrls.clear();
  toolOutput.replaceChildren();
  imageCounter = 0;
}

function handleImageFile(file) {
  if (!file || !file.type || !file.type.startsWith("image/")) {
    toast("Selecione um arquivo de imagem válido.", "error");
    return;
  }

  if (!multiMode) clearAllImages();

  imageCounter++;
  const url = URL.createObjectURL(file);

  // ── Card wrapper
  const card = document.createElement("div");
  card.className = "image-card";
  imageUrls.set(card, url);

  let pickerCleanup = null;

  // ── Card bar (title + remove)
  const cardBar = document.createElement("div");
  cardBar.className = "image-card-bar";

  const cardName = document.createElement("span");
  cardName.className = "image-card-name";
  cardName.textContent = `imagem ${imageCounter}${file.name ? ` — ${file.name}` : ""}`;

  const removeBtn = document.createElement("button");
  removeBtn.className = "image-card-remove";
  removeBtn.type = "button";
  removeBtn.setAttribute("aria-label", "Remover imagem");
  removeBtn.textContent = "✕";
  removeBtn.addEventListener("click", () => {
    if (pickerCleanup) pickerCleanup();
    imageCleanups.delete(card);
    const cardUrl = imageUrls.get(card);
    if (cardUrl) URL.revokeObjectURL(cardUrl);
    imageUrls.delete(card);
    card.remove();
  });

  cardBar.append(cardName, removeBtn);

  // ── Main panel (image + color panel)
  const container = document.createElement("div");
  container.className = "body-image-info";

  const previewDiv = document.createElement("div");
  previewDiv.className = "preview-div";

  const previewHeader = document.createElement("div");
  previewHeader.className = "preview-div-header";
  const previewLabel = document.createElement("span");
  previewLabel.className = "section-label";
  previewLabel.textContent = "Pré-visualização";
  const resetHighlightBtn = document.createElement("button");
  resetHighlightBtn.type = "button";
  resetHighlightBtn.className = "preview-reset-btn is-hidden";
  resetHighlightBtn.textContent = "Ver imagem original";
  previewHeader.append(previewLabel, resetHighlightBtn);
  previewDiv.appendChild(previewHeader);

  const previewStage = document.createElement("div");
  previewStage.className = "preview-stage";

  const img = document.createElement("img");
  img.className = "preview-img";
  img.src = url;
  img.alt = "Imagem enviada para extração de cores";

  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.className = "preview-overlay";
  overlayCanvas.setAttribute("aria-hidden", "true");

  previewStage.append(img, overlayCanvas);
  previewDiv.appendChild(previewStage);

  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const footer = document.createElement("span");
  footer.className = "preview-footer";
  footer.textContent = isTouch
    ? "Toque e arraste para visualizar · solte para selecionar"
    : "Passe o mouse para ampliar · clique para selecionar · setas para precisão";
  previewDiv.appendChild(footer);

  const { panel: colorPanel, refs } = buildColorPanel();

  container.append(previewDiv, colorPanel);
  card.append(cardBar, container);
  toolOutput.appendChild(card);
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const sourceCanvas = document.createElement("canvas");
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  let paletteApi = null;

  img.onload = () => {
    sourceCanvas.width  = img.naturalWidth;
    sourceCanvas.height = img.naturalHeight;
    sourceCtx.drawImage(img, 0, 0);
    const pickerApi = attachPicker(img, sourceCanvas, sourceCtx, refs, overlayCanvas);
    pickerCleanup = pickerApi.cleanup;
    imageCleanups.set(card, pickerApi.cleanup);
    paletteApi = populatePalette(sourceCanvas, refs, (color) => {
      pickerApi.highlightColorAreas(color);
      resetHighlightBtn.classList.toggle("is-hidden", !color);
      if (color) pickerApi.applyColorRGB(color.r, color.g, color.b);
    });
    toast("Imagem carregada. Passe o mouse e clique para capturar a cor.", "success");
  };

  resetHighlightBtn.addEventListener("click", () => {
    if (!paletteApi) return;
    paletteApi.clearHighlight();
  });
}

// ── Event wiring ──────────────────────────────────────────────────────────────

if (imageInput) {
  imageInput.addEventListener("change", (e) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    for (const file of files) handleImageFile(file);
    // Reset so the same file can be re-selected
    imageInput.value = "";
  });
}

if (uploadBox) {
  ["dragenter", "dragover"].forEach((name) => {
    uploadBox.addEventListener(name, (e) => {
      e.preventDefault(); e.stopPropagation();
      uploadBox.classList.add("drag-over");
    });
  });
  ["dragleave", "drop"].forEach((name) => {
    uploadBox.addEventListener(name, (e) => {
      e.preventDefault(); e.stopPropagation();
      uploadBox.classList.remove("drag-over");
    });
  });
  uploadBox.addEventListener("drop", (e) => {
    const files = e.dataTransfer?.files;
    if (!files || !files.length) return;
    for (const file of files) handleImageFile(file);
  });
}

window.addEventListener("paste", (e) => {
  // Ignore pastes from text inputs
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (!item.type?.startsWith("image/")) continue;
    handleImageFile(item.getAsFile());
    e.preventDefault();
    return;
  }
});

// ── Theme toggle ──────────────────────────────────────────────────────────────

const themeToggle = document.getElementById("themeToggle");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    }
  });
}

// ── Multi-image toggle ────────────────────────────────────────────────────────

const multiToggle = document.getElementById("multiToggle");
if (multiToggle) {
  multiToggle.addEventListener("click", () => {
    multiMode = !multiMode;
    multiToggle.classList.toggle("is-active", multiMode);
    multiToggle.setAttribute("aria-pressed", String(multiMode));
    imageInput.multiple = multiMode;
  });
}

// ── Touch UX tweaks ───────────────────────────────────────────────────────────

if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
  const uploadHelp = document.querySelector(".upload-help");
  if (uploadHelp) uploadHelp.textContent = "ou arraste a imagem para cá";
}

