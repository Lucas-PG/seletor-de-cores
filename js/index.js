const imageInput = document.getElementById("imageUpload");

function buildImageInfoDiv() {
  const infoDiv = document.createElement("div");
  infoDiv.className = "image-info-div";

  const header = document.createElement("span");
  header.className = "image-info-header";
  header.textContent = "Cor";

  const makeRow = (label, inputId) => {
    const row = document.createElement("div");
    row.className = "image-info-input";

    const input = document.createElement("input");
    input.type = "text";
    input.disabled = true;
    input.id = inputId;

    const tag = document.createElement("div");
    tag.className = "image-info-input-header";
    tag.textContent = label;

    row.appendChild(input);
    row.appendChild(tag);
    return row;
  };

  infoDiv.appendChild(header);
  infoDiv.appendChild(makeRow("HEX", "outHex"));
  infoDiv.appendChild(makeRow("RGBA", "outRGBA"));
  infoDiv.appendChild(makeRow("HSL", "outHsl"));

  return infoDiv;
}

function handleImageFile(file) {
  if (!file || !file.type?.startsWith("image/")) return;

  const url = URL.createObjectURL(file);

  const content = document.querySelector(".content");

  const old = content.querySelector(".body-image-info");
  if (old) old.remove();

  const container = document.createElement("div");
  container.className = "body-image-info";
  container.innerHTML = "";

  const previewDiv = document.createElement("div");
  previewDiv.className = "preview-div";

  const header = document.createElement("span");
  header.className = "preview-image-header";
  header.textContent = "Imagem";

  const img = document.createElement("img");
  img.id = "preview";
  img.src = url;
  img.alt = "Imagem enviada";
  img.style.maxWidth = "100%";
  img.style.display = "block";

  // ===== CANVAS FONTE (pixel real) =====
  const sourceCanvas = document.createElement("canvas");
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });

  img.onload = () => {
    // tamanho real da imagem
    sourceCanvas.width = img.naturalWidth;
    sourceCanvas.height = img.naturalHeight;
    sourceCtx.drawImage(img, 0, 0);

    attachPicker(img, sourceCanvas, sourceCtx);
  };

  const footer = document.createElement("span");
  footer.className = "preview-image-footer";
  footer.textContent = "Passe o mouse por cima da imagem";

  previewDiv.appendChild(header);
  previewDiv.appendChild(img);
  previewDiv.appendChild(footer);

  const infoDiv = buildImageInfoDiv();

  container.appendChild(previewDiv);
  container.appendChild(infoDiv);
  content.appendChild(container);
}

const loupe = document.createElement("div");
loupe.id = "loupe";
loupe.innerHTML = `<canvas id="loupeCanvas" width="140" height="140"></canvas>`;
document.body.appendChild(loupe);

const loupeCanvas = document.getElementById("loupeCanvas");
const loupeCtx = loupeCanvas.getContext("2d", { willReadFrequently: true });

function rgbToHex(r, g, b) {
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0,
    l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
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

function attachPicker(img, sourceCanvas, sourceCtx) {
  const outHex = document.getElementById("outHex");
  const outRGBA = document.getElementById("outRGBA");
  const outHsl = document.getElementById("outHsl");

  const zoom = 10;
  const sampleSize = 14;

  function positionLoupe(e) {
    const offsetX = 5; // direita
    const offsetY = 5; // cima

    const loupeW = loupe.offsetWidth;
    const loupeH = loupe.offsetHeight;

    let left = e.clientX + offsetX;
    let top = e.clientY - loupeH - offsetY;

    const margin = 8;
    left = Math.min(left, window.innerWidth - loupeW - margin);
    top = Math.max(top, margin);

    loupe.style.left = `${left}px`;
    loupe.style.top = `${top}px`;
  }

  function getImageXYFromMouse(e) {
    const rect = img.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const x = Math.floor((mx / rect.width) * img.naturalWidth);
    const y = Math.floor((my / rect.height) * img.naturalHeight);

    return {
      x: Math.max(0, Math.min(img.naturalWidth - 1, x)),
      y: Math.max(0, Math.min(img.naturalHeight - 1, y)),
    };
  }

  function drawLoupe(x, y) {
    loupeCtx.imageSmoothingEnabled = false;

    const half = Math.floor(sampleSize / 2);
    const sx = Math.max(0, Math.min(sourceCanvas.width - sampleSize, x - half));
    const sy = Math.max(
      0,
      Math.min(sourceCanvas.height - sampleSize, y - half),
    );

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

    loupeCtx.strokeStyle = "rgba(0,0,0,0.15)";
    for (let i = 0; i <= sampleSize; i++) {
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
    loupeCtx.strokeStyle = "rgba(255,0,0,0.9)";
    loupeCtx.lineWidth = 2;
    loupeCtx.strokeRect(center, center, zoom, zoom);
  }

  function onMove(e) {
    const { x, y } = getImageXYFromMouse(e);

    loupe.style.display = "block";
    positionLoupe(e);
    drawLoupe(x, y);
  }

  function onLeave() {
    loupe.style.display = "none";
  }

  function onClick(e) {
    const { x, y } = getImageXYFromMouse(e);

    const pixel = sourceCtx.getImageData(x, y, 1, 1).data;
    const r = pixel[0],
      g = pixel[1],
      b = pixel[2],
      a = pixel[3];

    const hex = rgbToHex(r, g, b);
    const alpha = +(a / 255).toFixed(2);
    const hsl = rgbToHsl(r, g, b);

    outHex.value = hex;
    outRGBA.value = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    outHsl.value = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
  }

  img.addEventListener("mousemove", onMove);
  img.addEventListener("mouseleave", onLeave);
  img.addEventListener("click", onClick);
}

imageInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  handleImageFile(file);
});

window.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type?.startsWith("image/")) {
      const file = item.getAsFile();
      handleImageFile(file);
      e.preventDefault();
      break;
    }
  }
});
