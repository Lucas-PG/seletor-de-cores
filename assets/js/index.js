const imageInput = document.getElementById("imageUpload");
const uploadBox = document.getElementById("uploadBox");
const toolOutput = document.getElementById("toolOutput");
let currentObjectUrl = null;

function toast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  // Keep only one toast visible at a time.
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

function rgbToHex(r, g, b) {
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToHsl(r, g, b) {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case nr:
        h = (ng - nb) / d + (ng < nb ? 6 : 0);
        break;
      case ng:
        h = (nb - nr) / d + 2;
        break;
      default:
        h = (nr - ng) / d + 4;
        break;
    }

    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function buildImageInfoDiv() {
  const infoDiv = document.createElement("div");
  infoDiv.className = "image-info-div";

  const header = document.createElement("span");
  header.className = "image-info-header";
  header.textContent = "Códigos de cor";
  infoDiv.appendChild(header);

  const colorInputs = document.createElement("div");
  colorInputs.className = "color-inputs";

  const makeRow = (label, inputId) => {
    const row = document.createElement("div");
    row.className = "image-info-input";

    const tag = document.createElement("div");
    tag.className = "image-info-input-header";
    tag.textContent = label;

    const input = document.createElement("input");
    input.type = "text";
    input.readOnly = true;
    input.id = inputId;

    const copyDiv = document.createElement("button");
    copyDiv.className = "input-copy";
    copyDiv.type = "button";
    copyDiv.setAttribute("aria-label", `Copiar ${label}`);

    const copyIcon = document.createElement("img");
    copyIcon.src = "/assets/icons/copy-regular-full.svg";
    copyIcon.className = "copy-icon";
    copyIcon.alt = "Copiar";

    copyDiv.appendChild(copyIcon);

    const copyValue = () => {
      if (!input.value) {
        toast("Selecione uma cor antes de copiar.", "info");
        return;
      }

      navigator.clipboard
        .writeText(input.value)
        .then(() => {
          toast(`${label} copiado.`, "success");
          copyIcon.style.opacity = "0.5";
          setTimeout(() => {
            copyIcon.style.opacity = "1";
          }, 180);
        })
        .catch(() => {
          toast("Não foi possível copiar.", "error");
        });
    };

    input.addEventListener("click", copyValue);
    copyDiv.addEventListener("click", copyValue);

    row.appendChild(tag);
    row.appendChild(input);
    row.appendChild(copyDiv);

    return row;
  };

  colorInputs.appendChild(makeRow("HEX", "outHex"));
  colorInputs.appendChild(makeRow("RGBA", "outRGBA"));
  colorInputs.appendChild(makeRow("HSL", "outHsl"));

  infoDiv.appendChild(colorInputs);

  const colorBoxDiv = document.createElement("div");
  colorBoxDiv.className = "color-box-div is-hidden";
  colorBoxDiv.id = "colorBoxDiv";

  const colorBoxHeader = document.createElement("span");
  colorBoxHeader.id = "colorBoxHeader";

  const colorBox = document.createElement("div");
  colorBox.className = "color-box";
  colorBox.id = "colorBox";

  colorBoxDiv.appendChild(colorBoxHeader);
  colorBoxDiv.appendChild(colorBox);
  infoDiv.appendChild(colorBoxDiv);

  return infoDiv;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getImageXY(point, img) {
  const rect = img.getBoundingClientRect();
  const mx = point.clientX - rect.left;
  const my = point.clientY - rect.top;
  const xFloat = clamp((mx / rect.width) * img.naturalWidth, 0, img.naturalWidth - 1);
  const yFloat = clamp((my / rect.height) * img.naturalHeight, 0, img.naturalHeight - 1);

  return {
    x: Math.round(xFloat),
    y: Math.round(yFloat),
    xFloat,
    yFloat,
  };
}

const loupe = document.createElement("div");
loupe.id = "loupe";
loupe.innerHTML = `
  <canvas id="loupeCanvas" width="220" height="220"></canvas>
  <div id="loupeCenter" aria-hidden="true"></div>
  <div id="loupeHex" aria-live="polite">#000000</div>
`;
document.body.appendChild(loupe);

const loupeCanvas = document.getElementById("loupeCanvas");
const loupeCtx = loupeCanvas.getContext("2d", { willReadFrequently: true });
const loupeCenter = document.getElementById("loupeCenter");
const loupeHex = document.getElementById("loupeHex");
const loupeSize = 220;
const sampleSize = 13;
let activeKeydownHandler = null;

function setupLoupeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  loupeCanvas.width = Math.round(loupeSize * dpr);
  loupeCanvas.height = Math.round(loupeSize * dpr);
  loupeCtx.setTransform(1, 0, 0, 1, 0, 0);
  loupeCtx.scale(dpr, dpr);
}

setupLoupeCanvas();
window.addEventListener("resize", setupLoupeCanvas);

function attachPicker(img, sourceCanvas, sourceCtx) {
  const outHex = document.getElementById("outHex");
  const outRGBA = document.getElementById("outRGBA");
  const outHsl = document.getElementById("outHsl");

  const pixelBlock = loupeSize / sampleSize;
  let currentImgX = 0;
  let currentImgY = 0;
  let loupeActive = false;

  const drawLoupe = (x, y) => {
    const half = Math.floor(sampleSize / 2);
    const sx = clamp(x - half, 0, sourceCanvas.width - sampleSize);
    const sy = clamp(y - half, 0, sourceCanvas.height - sampleSize);

    loupeCtx.clearRect(0, 0, loupeSize, loupeSize);
    loupeCtx.imageSmoothingEnabled = false;
    loupeCtx.drawImage(sourceCanvas, sx, sy, sampleSize, sampleSize, 0, 0, loupeSize, loupeSize);

    loupeCtx.strokeStyle = "rgba(0, 0, 0, 0.15)";
    loupeCtx.lineWidth = 1;
    for (let i = 0; i <= sampleSize; i++) {
      loupeCtx.beginPath();
      loupeCtx.moveTo(i * pixelBlock, 0);
      loupeCtx.lineTo(i * pixelBlock, loupeSize);
      loupeCtx.stroke();
      loupeCtx.beginPath();
      loupeCtx.moveTo(0, i * pixelBlock);
      loupeCtx.lineTo(loupeSize, i * pixelBlock);
      loupeCtx.stroke();
    }

    const highlightX = (x - sx) * pixelBlock;
    const highlightY = (y - sy) * pixelBlock;
    loupeCtx.strokeStyle = "rgba(0, 0, 0, 0.65)";
    loupeCtx.lineWidth = 2;
    loupeCtx.strokeRect(highlightX, highlightY, pixelBlock, pixelBlock);
  };

  const getPixelColor = (x, y) => {
    const [r, g, b, a] = sourceCtx.getImageData(x, y, 1, 1).data;
    const hex = rgbToHex(r, g, b);
    const alpha = +(a / 255).toFixed(2);
    const hsl = rgbToHsl(r, g, b);
    return { r, g, b, alpha, hex, hsl };
  };

  const updateLiveOverlay = (hex) => {
    loupe.style.setProperty("--loupe-color", hex);
    loupeCenter.style.borderColor = hex;
    loupeHex.textContent = hex;
  };

  const applyColor = (x, y) => {
    const { r, g, b, alpha, hex, hsl } = getPixelColor(x, y);
    const colorBoxDiv = document.getElementById("colorBoxDiv");
    const colorBoxHeader = document.getElementById("colorBoxHeader");
    const colorBox = document.getElementById("colorBox");

    if (colorBoxDiv && colorBoxHeader && colorBox) {
      colorBox.style.backgroundColor = hex;
      colorBoxDiv.classList.remove("is-hidden");
      colorBoxHeader.textContent = "Cor selecionada";
    }

    outHex.value = hex;
    outRGBA.value = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    outHsl.value = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
  };

  const positionLoupe = (point) => {
    const half = loupeSize / 2;
    loupe.style.transform = `translate(${point.clientX - half}px, ${point.clientY - half}px)`;
  };

  const positionLoupeFromImageCoords = (x, y) => {
    const rect = img.getBoundingClientRect();
    const clientX = rect.left + (x / img.naturalWidth) * rect.width;
    const clientY = rect.top + (y / img.naturalHeight) * rect.height;
    const half = loupeSize / 2;
    loupe.style.transform = `translate(${clientX - half}px, ${clientY - half}px)`;
  };

  const renderPreviewAtPoint = (point) => {
    const { x, y } = getImageXY(point, img);
    currentImgX = x;
    currentImgY = y;
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
      if (previewRafId !== null) {
        window.cancelAnimationFrame(previewRafId);
        previewRafId = null;
      }
      return;
    }

    pendingPreviewPoint = {
      clientX: point.clientX,
      clientY: point.clientY,
    };
    schedulePreviewRender();
  };

  const commitAtPoint = (point) => {
    const { x, y } = getImageXY(point, img);
    applyColor(x, y);
  };

  if (activeKeydownHandler) {
    document.removeEventListener("keydown", activeKeydownHandler);
  }
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
    currentImgX = clamp(currentImgX + dx, 0, img.naturalWidth - 1);
    currentImgY = clamp(currentImgY + dy, 0, img.naturalHeight - 1);
    drawLoupe(currentImgX, currentImgY);
    const { hex } = getPixelColor(currentImgX, currentImgY);
    updateLiveOverlay(hex);
    positionLoupeFromImageCoords(currentImgX, currentImgY);
    applyColor(currentImgX, currentImgY);
  };
  activeKeydownHandler = onKeydown;
  document.addEventListener("keydown", onKeydown);

  let isPointerDown = false;
  let activePointerType = "mouse";

  img.addEventListener("pointerdown", (event) => {
    isPointerDown = true;
    loupeActive = true;
    activePointerType = event.pointerType || "mouse";
    img.setPointerCapture(event.pointerId);
    previewAtPoint(event, true);
    event.preventDefault();
  });

  img.addEventListener("pointermove", (event) => {
    if (isPointerDown) {
      previewAtPoint(event);
      event.preventDefault();
      return;
    }

    if (event.pointerType === "mouse") {
      previewAtPoint(event);
    }
  });

  img.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") {
      img.classList.add("is-picking");
      loupeActive = true;
    }
  });

  const stopPointer = (event) => {
    if (!isPointerDown) return;

    previewAtPoint(event, true);
    isPointerDown = false;
    img.releasePointerCapture(event.pointerId);

    if (activePointerType !== "mouse") {
      commitAtPoint(event);
      loupe.style.display = "none";
    }
  };

  img.addEventListener("pointerup", stopPointer);
  img.addEventListener("click", (event) => {
    if (activePointerType !== "mouse") return;
    previewAtPoint(event, true);
    commitAtPoint(event);
  });
  img.addEventListener("pointercancel", () => {
    isPointerDown = false;
    loupeActive = false;
    pendingPreviewPoint = null;
    if (previewRafId !== null) {
      window.cancelAnimationFrame(previewRafId);
      previewRafId = null;
    }
    loupe.style.display = "none";
    img.classList.remove("is-picking");
  });
  img.addEventListener("mouseleave", () => {
    loupeActive = false;
    pendingPreviewPoint = null;
    if (previewRafId !== null) {
      window.cancelAnimationFrame(previewRafId);
      previewRafId = null;
    }
    loupe.style.display = "none";
    img.classList.remove("is-picking");
  });
}

function handleImageFile(file) {
  if (!file || !file.type || !file.type.startsWith("image/")) {
    toast("Selecione um arquivo de imagem válido.", "error");
    return;
  }

  const oldPreview = toolOutput.querySelector(".body-image-info");
  if (oldPreview) oldPreview.remove();

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }

  const url = URL.createObjectURL(file);
  currentObjectUrl = url;

  const container = document.createElement("div");
  container.className = "body-image-info";

  const previewDiv = document.createElement("div");
  previewDiv.className = "preview-div";

  const header = document.createElement("span");
  header.className = "image-info-header";
  header.textContent = "Pré-visualização";

  const img = document.createElement("img");
  img.id = "preview";
  img.src = url;
  img.alt = "Imagem enviada para extração de cores";

  const footer = document.createElement("span");
  footer.className = "preview-image-footer";

  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  footer.textContent = isTouch
    ? "Toque e arraste para pré-visualizar. Solte para selecionar a cor."
    : "Passe o mouse para ampliar. Clique para selecionar a cor.";

  previewDiv.appendChild(header);
  previewDiv.appendChild(img);
  previewDiv.appendChild(footer);

  const infoDiv = buildImageInfoDiv();

  container.appendChild(previewDiv);
  container.appendChild(infoDiv);
  toolOutput.appendChild(container);

  const sourceCanvas = document.createElement("canvas");
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });

  img.onload = () => {
    sourceCanvas.width = img.naturalWidth;
    sourceCanvas.height = img.naturalHeight;
    sourceCtx.drawImage(img, 0, 0);

    attachPicker(img, sourceCanvas, sourceCtx);
    toast("Imagem carregada. Passe o mouse e clique para capturar a cor.", "success");
  };
}

if (imageInput) {
  imageInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    handleImageFile(file);
  });
}

if (uploadBox) {
  ["dragenter", "dragover"].forEach((eventName) => {
    uploadBox.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      uploadBox.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    uploadBox.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      uploadBox.classList.remove("drag-over");
    });
  });

  uploadBox.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    handleImageFile(file);
  });
}

window.addEventListener("paste", (event) => {
  const items = event.clipboardData?.items;
  if (!items) return;
  let hasValidImage = false;

  for (const item of items) {
    if (!item.type?.startsWith("image/")) continue;

    const file = item.getAsFile();
    handleImageFile(file);
    hasValidImage = true;
    event.preventDefault();
    return;
  }

  if (!hasValidImage) {
    toast("Não foi possível colar. Cole uma imagem válida.", "error");
  }
});
