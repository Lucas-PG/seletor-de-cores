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

function getImageXY(point, img) {
  const rect = img.getBoundingClientRect();
  const mx = point.clientX - rect.left;
  const my = point.clientY - rect.top;

  const x = Math.floor((mx / rect.width) * img.naturalWidth);
  const y = Math.floor((my / rect.height) * img.naturalHeight);

  return {
    x: Math.max(0, Math.min(img.naturalWidth - 1, x)),
    y: Math.max(0, Math.min(img.naturalHeight - 1, y)),
  };
}

const loupe = document.createElement("div");
loupe.id = "loupe";
loupe.innerHTML = '<canvas id="loupeCanvas" width="140" height="140"></canvas>';
document.body.appendChild(loupe);

const loupeCanvas = document.getElementById("loupeCanvas");
const loupeCtx = loupeCanvas.getContext("2d", { willReadFrequently: true });

function attachPicker(img, sourceCanvas, sourceCtx) {
  const outHex = document.getElementById("outHex");
  const outRGBA = document.getElementById("outRGBA");
  const outHsl = document.getElementById("outHsl");

  const zoom = 10;
  const sampleSize = 14;

  const drawLoupe = (x, y) => {
    loupeCtx.imageSmoothingEnabled = false;

    const half = Math.floor(sampleSize / 2);
    const sx = Math.max(0, Math.min(sourceCanvas.width - sampleSize, x - half));
    const sy = Math.max(0, Math.min(sourceCanvas.height - sampleSize, y - half));

    loupeCtx.clearRect(0, 0, loupeCanvas.width, loupeCanvas.height);
    loupeCtx.drawImage(
      sourceCanvas,
      sx,
      sy,
      sampleSize,
      sampleSize,
      0,
      0,
      sampleSize * zoom,
      sampleSize * zoom,
    );

    loupeCtx.strokeStyle = "rgba(0, 0, 0, 0.15)";
    for (let i = 0; i <= sampleSize; i += 1) {
      loupeCtx.beginPath();
      loupeCtx.moveTo(i * zoom, 0);
      loupeCtx.lineTo(i * zoom, sampleSize * zoom);
      loupeCtx.stroke();

      loupeCtx.beginPath();
      loupeCtx.moveTo(0, i * zoom);
      loupeCtx.lineTo(sampleSize * zoom, i * zoom);
      loupeCtx.stroke();
    }

    const center = Math.floor(sampleSize / 2) * zoom;
    loupeCtx.strokeStyle = "rgba(255, 0, 0, 0.9)";
    loupeCtx.lineWidth = 2;
    loupeCtx.strokeRect(center, center, zoom, zoom);
  };

  const applyColor = (x, y) => {
    const [r, g, b, a] = sourceCtx.getImageData(x, y, 1, 1).data;

    const hex = rgbToHex(r, g, b);
    const alpha = +(a / 255).toFixed(2);
    const hsl = rgbToHsl(r, g, b);

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
    const offsetX = 8;
    const offsetY = 6;
    const width = loupe.offsetWidth;
    const height = loupe.offsetHeight;

    let left = point.clientX + offsetX;
    let top = point.clientY - height - offsetY;

    left = Math.min(left, window.innerWidth - width - 8);
    top = Math.max(top, 8);

    loupe.style.left = `${left}px`;
    loupe.style.top = `${top}px`;
  };

  const sampleAtPoint = (point, shouldApply = false) => {
    const { x, y } = getImageXY(point, img);
    loupe.style.display = "block";
    positionLoupe(point);
    drawLoupe(x, y);

    if (shouldApply) {
      applyColor(x, y);
    }
  };

  let isDragging = false;

  img.addEventListener("pointerdown", (event) => {
    isDragging = true;
    img.setPointerCapture(event.pointerId);
    sampleAtPoint(event, true);
    event.preventDefault();
  });

  img.addEventListener("pointermove", (event) => {
    if (isDragging) {
      sampleAtPoint(event, true);
      event.preventDefault();
      return;
    }

    if (event.pointerType === "mouse") {
      sampleAtPoint(event, false);
    }
  });

  const stopDragging = (event) => {
    if (!isDragging) return;

    sampleAtPoint(event, true);
    isDragging = false;

    if (event.pointerType !== "mouse") {
      loupe.style.display = "none";
    }
  };

  img.addEventListener("pointerup", stopDragging);
  img.addEventListener("pointercancel", () => {
    isDragging = false;
    loupe.style.display = "none";
  });
  img.addEventListener("mouseleave", () => {
    if (!isDragging) {
      loupe.style.display = "none";
    }
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
    ? "Toque e arraste na imagem para selecionar a cor com precisão"
    : "Passe o mouse para ampliar. Clique e arraste para capturar o pixel ideal";

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
    toast("Imagem carregada. Clique ou arraste para capturar a cor.", "success");
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
