import {
  setColor,
  setBrushSize,
  clearCanvas,
  appContainer,
  onActiveUserCountChange,
} from "./canvas.ts";

// -- Color palette (u32 RGBA + CSS hex for display) --

const COLOR_PALETTE = [
  { name: "Black", rgba: 0x000000ff, css: "#000000" },
  { name: "White", rgba: 0xffffffff, css: "#ffffff" },
  { name: "Red", rgba: 0xff0000ff, css: "#ff0000" },
  { name: "Orange", rgba: 0xff8800ff, css: "#ff8800" },
  { name: "Yellow", rgba: 0xffdd00ff, css: "#ffdd00" },
  { name: "Green", rgba: 0x00cc44ff, css: "#00cc44" },
  { name: "Cyan", rgba: 0x00ccccff, css: "#00cccc" },
  { name: "Blue", rgba: 0x0055ffff, css: "#0055ff" },
  { name: "Purple", rgba: 0x8833ffff, css: "#8833ff" },
  { name: "Pink", rgba: 0xff44aaff, css: "#ff44aa" },
  { name: "Brown", rgba: 0x885522ff, css: "#885522" },
  { name: "Gray", rgba: 0x888888ff, css: "#888888" },
];

// -- Helpers --

function cssHexToRgbaU32(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0;
}

// -- Toolbar state --

let selectedSwatchEl: HTMLDivElement | null = null;
let brushPreview: HTMLDivElement;
let brushSizeLabel: HTMLSpanElement;
let currentCss = "#000000";

// -- Selection logic --

function selectColor(
  rgba: number,
  css: string,
  swatchEl: HTMLDivElement | null
): void {
  if (selectedSwatchEl) {
    selectedSwatchEl.style.borderColor = "transparent";
  }
  if (swatchEl) {
    swatchEl.style.borderColor = "#fff";
    selectedSwatchEl = swatchEl;
  } else {
    selectedSwatchEl = null;
  }
  currentCss = css;
  setColor(rgba);
  brushPreview.style.backgroundColor = css;
}

// -- DOM builders --

function createSwatch(
  color: (typeof COLOR_PALETTE)[number]
): HTMLDivElement {
  const swatch = document.createElement("div");
  swatch.style.width = "26px";
  swatch.style.height = "26px";
  swatch.style.borderRadius = "4px";
  swatch.style.backgroundColor = color.css;
  swatch.style.cursor = "pointer";
  swatch.style.border = "2px solid transparent";
  swatch.style.boxSizing = "border-box";
  swatch.style.transition = "border-color 0.15s, transform 0.1s";
  swatch.title = color.name;

  swatch.addEventListener("mouseenter", () => {
    swatch.style.transform = "scale(1.15)";
  });
  swatch.addEventListener("mouseleave", () => {
    swatch.style.transform = "scale(1)";
  });

  swatch.addEventListener("click", () =>
    selectColor(color.rgba, color.css, swatch)
  );

  if (color.css === "#ffffff") {
    swatch.style.boxShadow = "inset 0 0 0 1px #aaa";
  }

  return swatch;
}

function createButton(label: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.style.padding = "6px 14px";
  btn.style.border = "1px solid #444";
  btn.style.borderRadius = "6px";
  btn.style.backgroundColor = "#2c2c3e";
  btn.style.color = "#ccc";
  btn.style.cursor = "pointer";
  btn.style.fontWeight = "600";
  btn.style.fontSize = "13px";
  btn.style.transition = "all 0.15s";
  btn.style.fontFamily = "inherit";
  return btn;
}

// -- Build toolbar --

function buildToolbar(): void {
  const toolbar = document.createElement("div");
  toolbar.style.display = "flex";
  toolbar.style.flexWrap = "wrap";
  toolbar.style.alignItems = "center";
  toolbar.style.justifyContent = "space-between";
  toolbar.style.gap = "12px";
  toolbar.style.padding = "12px 16px";
  toolbar.style.backgroundColor = "#16213e";
  toolbar.style.borderRadius = "8px 8px 0 0";
  toolbar.style.width = "100%";
  toolbar.style.boxSizing = "border-box";

  // -- Color section --
  const colorSection = document.createElement("div");
  colorSection.style.display = "flex";
  colorSection.style.flexWrap = "wrap";
  colorSection.style.gap = "4px";
  colorSection.style.alignItems = "center";

  let firstSwatch: HTMLDivElement | null = null;
  COLOR_PALETTE.forEach((color, i) => {
    const swatch = createSwatch(color);
    if (i === 0) firstSwatch = swatch;
    colorSection.appendChild(swatch);
  });

  // Custom color input
  const customColorInput = document.createElement("input");
  customColorInput.type = "color";
  customColorInput.value = "#000000";
  customColorInput.style.width = "26px";
  customColorInput.style.height = "26px";
  customColorInput.style.border = "1px solid #444";
  customColorInput.style.padding = "0";
  customColorInput.style.cursor = "pointer";
  customColorInput.style.borderRadius = "4px";
  customColorInput.style.backgroundColor = "transparent";
  customColorInput.title = "Custom color";

  customColorInput.addEventListener("input", () => {
    const hex = customColorInput.value;
    const rgba = cssHexToRgbaU32(hex);
    if (selectedSwatchEl) {
      selectedSwatchEl.style.borderColor = "transparent";
      selectedSwatchEl = null;
    }
    currentCss = hex;
    setColor(rgba);
    brushPreview.style.backgroundColor = hex;
  });

  colorSection.appendChild(customColorInput);

  // -- Tools section --
  const toolsSection = document.createElement("div");
  toolsSection.style.display = "flex";
  toolsSection.style.alignItems = "center";
  toolsSection.style.gap = "10px";

  // Brush preview circle
  brushPreview = document.createElement("div");
  brushPreview.style.width = "3px";
  brushPreview.style.height = "3px";
  brushPreview.style.borderRadius = "50%";
  brushPreview.style.backgroundColor = currentCss;
  brushPreview.style.border = "1px solid #666";
  brushPreview.style.minWidth = "4px";
  brushPreview.style.minHeight = "4px";
  brushPreview.style.transition = "width 0.1s, height 0.1s";
  brushPreview.style.flexShrink = "0";

  // Brush size slider
  const brushSlider = document.createElement("input");
  brushSlider.type = "range";
  brushSlider.min = "1";
  brushSlider.max = "50";
  brushSlider.value = "3";
  brushSlider.style.width = "90px";
  brushSlider.style.cursor = "pointer";
  brushSlider.style.accentColor = "#e94560";

  // Brush size label
  brushSizeLabel = document.createElement("span");
  brushSizeLabel.textContent = "3px";
  brushSizeLabel.style.fontSize = "12px";
  brushSizeLabel.style.fontWeight = "500";
  brushSizeLabel.style.color = "#aaa";
  brushSizeLabel.style.minWidth = "30px";

  brushSlider.addEventListener("input", () => {
    const size = parseInt(brushSlider.value, 10);
    setBrushSize(size);
    brushSizeLabel.textContent = `${size}px`;
    const displaySize = Math.max(4, Math.min(size, 50));
    brushPreview.style.width = displaySize + "px";
    brushPreview.style.height = displaySize + "px";
  });

  // Clear button
  const clearBtn = createButton("Clear All");
  clearBtn.addEventListener("mouseenter", () => {
    clearBtn.style.backgroundColor = "#e74c3c";
    clearBtn.style.color = "#fff";
    clearBtn.style.borderColor = "#c0392b";
  });
  clearBtn.addEventListener("mouseleave", () => {
    clearBtn.style.backgroundColor = "#2c2c3e";
    clearBtn.style.color = "#ccc";
    clearBtn.style.borderColor = "#444";
  });
  clearBtn.addEventListener("click", () => {
    clearCanvas();
  });

  toolsSection.appendChild(brushPreview);
  toolsSection.appendChild(brushSlider);
  toolsSection.appendChild(brushSizeLabel);
  toolsSection.appendChild(clearBtn);

  // -- User count section --
  const userCountSection = document.createElement("div");
  userCountSection.style.display = "flex";
  userCountSection.style.alignItems = "center";
  userCountSection.style.gap = "6px";

  const statusDot = document.createElement("div");
  statusDot.style.width = "8px";
  statusDot.style.height = "8px";
  statusDot.style.borderRadius = "50%";
  statusDot.style.backgroundColor = "#2ecc71";
  statusDot.style.flexShrink = "0";

  const userCountLabel = document.createElement("span");
  userCountLabel.textContent = "0 online";
  userCountLabel.style.fontSize = "12px";
  userCountLabel.style.color = "#aaa";
  userCountLabel.style.fontWeight = "500";
  userCountLabel.style.whiteSpace = "nowrap";

  onActiveUserCountChange((count: number) => {
    userCountLabel.textContent = `${count} online`;
  });

  userCountSection.appendChild(statusDot);
  userCountSection.appendChild(userCountLabel);

  // -- Assemble toolbar --
  toolbar.appendChild(colorSection);
  toolbar.appendChild(toolsSection);
  toolbar.appendChild(userCountSection);

  appContainer.insertBefore(toolbar, appContainer.firstChild);

  // Default selection: black swatch
  if (firstSwatch) {
    (firstSwatch as HTMLDivElement).style.borderColor = "#fff";
    selectedSwatchEl = firstSwatch;
  }
}

// -- Self-initialize --
buildToolbar();
