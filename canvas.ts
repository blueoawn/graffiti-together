import {
  DbConnection,
  type EventContext,
  type ReducerEventContext,
  type ErrorContext,
  type SubscriptionEventContext,
} from "./src/module_bindings/index.ts";

// Local type definitions matching the SpacetimeDB schema
interface Point {
  x: number;
  y: number;
}

interface Stroke {
  strokeId: bigint;
  points: Point[];
  color: number;
  brushSize: number;
  timestamp: bigint;
}

interface ConnectedUser {
  identity: unknown;
}

// -- Configuration --
const SPACETIMEDB_URI = "wss://grem.studio/spacetimedb/";
const MODULE_NAME = "graffiti-together";
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// -- State --
let connection: DbConnection | null = null;
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

// Drawing state
let isDrawing = false;
let currentPoints: Point[] = [];
let currentColor: number = 0x000000ff; // black RGBA
let currentBrushSize: number = 3;

// Active users tracking
let activeUserCount = 0;
let onUserCountChangeCallback: ((count: number) => void) | null = null;

// -- Exported app container --
export let appContainer: HTMLDivElement;

// -- Color helpers --

function rgbaU32ToCss(rgba: number): string {
  const r = (rgba >>> 24) & 0xff;
  const g = (rgba >>> 16) & 0xff;
  const b = (rgba >>> 8) & 0xff;
  const a = (rgba & 0xff) / 255;
  return `rgba(${r},${g},${b},${a})`;
}

// -- Canvas setup --

function setupCanvas(): void {
  // Body styling
  document.body.style.margin = "0";
  document.body.style.padding = "0";
  document.body.style.backgroundColor = "#1a1a2e";
  document.body.style.fontFamily =
    "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

  // Inject navbar if PHP didn't render it
  if (!document.getElementById("navbar")) {
    fetch("/navbar.php")
      .then((r) => r.text())
      .then((html) => {
        document.body.insertAdjacentHTML("afterbegin", html);
      });
  }

  // Create wrapper container
  appContainer = document.createElement("div");
  appContainer.style.display = "flex";
  appContainer.style.flexDirection = "column";
  appContainer.style.alignItems = "center";
  appContainer.style.margin = "24px auto";
  appContainer.style.maxWidth = CANVAS_WIDTH + "px";
  document.body.appendChild(appContainer);

  canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  canvas.style.display = "block";
  canvas.style.cursor = "crosshair";
  canvas.style.borderRadius = "0 0 8px 8px";
  canvas.style.boxShadow = "0 4px 20px rgba(0,0,0,0.3)";
  appContainer.appendChild(canvas);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Failed to get 2D canvas context");
  ctx = context;

  clearCanvasLocal();
  setupInputHandlers();
}

function clearCanvasLocal(): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

// -- Stroke rendering --

function drawStroke(stroke: Stroke): void {
  if (stroke.points.length < 2) return;

  ctx.save();

  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = rgbaU32ToCss(stroke.color);
  ctx.lineWidth = stroke.brushSize;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  ctx.stroke();

  ctx.restore();
}

function renderAllStrokes(): void {
  clearCanvasLocal();
  if (!connection) return;
  const strokes = Array.from(connection.db.strokes.iter()) as Stroke[];
  strokes.sort((a, b) => Number(a.timestamp - b.timestamp));
  for (const stroke of strokes) {
    drawStroke(stroke);
  }
}

// -- Input handling --

function getCanvasPos(e: MouseEvent): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

function setupInputHandlers(): void {
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mouseleave", onMouseUp);
}

function onMouseDown(e: MouseEvent): void {
  if (e.button !== 0) return;
  isDrawing = true;
  currentPoints = [getCanvasPos(e)];
}

function onMouseMove(e: MouseEvent): void {
  if (!isDrawing) return;

  const point = getCanvasPos(e);
  currentPoints.push(point);

  // Draw live preview segment
  if (currentPoints.length >= 2) {
    const prev = currentPoints[currentPoints.length - 2];
    ctx.save();

    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = rgbaU32ToCss(currentColor);
    ctx.lineWidth = currentBrushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    ctx.restore();
  }
}

function onMouseUp(_e: MouseEvent): void {
  if (!isDrawing) return;
  isDrawing = false;

  if (currentPoints.length >= 2 && connection) {
    connection.reducers.addStroke({
      points: currentPoints,
      color: currentColor,
      brushSize: currentBrushSize,
    });
  }

  currentPoints = [];
}

// -- SpacetimeDB connection --

function connect(): void {
  const token = localStorage.getItem("spacetimedb_token") ?? undefined;

  DbConnection.builder()
    .withUri(SPACETIMEDB_URI)
    .withModuleName(MODULE_NAME)
    .withToken(token)
    .onConnect(onConnected)
    .onConnectError(onConnectError)
    .onDisconnect(onDisconnect)
    .build();
}

function onConnected(
  conn: DbConnection,
  identity: { toHexString(): string },
  token: string
): void {
  connection = conn;
  localStorage.setItem("spacetimedb_token", token);
  console.log("Connected to SpacetimeDB as", identity.toHexString());

  // Subscribe to strokes
  conn
    .subscriptionBuilder()
    .onApplied(onSubscriptionApplied)
    .subscribe("SELECT * FROM strokes");

  // Subscribe to connected users
  conn
    .subscriptionBuilder()
    .onApplied(onUsersSubscriptionApplied)
    .subscribe("SELECT * FROM connected_users");

  // Listen for real-time stroke changes
  conn.db.strokes.onInsert(onStrokeInserted);
  conn.db.strokes.onDelete(onStrokeDeleted);

  // Listen for user connect/disconnect
  conn.db.connectedUsers.onInsert(onUserInserted);
  conn.db.connectedUsers.onDelete(onUserDeleted);

  // Listen for reducer results
  conn.reducers.onAddStroke(onAddStrokeResult);
  conn.reducers.onClearCanvas(onClearCanvasResult);
}

function onConnectError(_ctx: ErrorContext, error: Error): void {
  console.error("SpacetimeDB connection error:", error);
}

function onDisconnect(_ctx: ErrorContext, error?: Error): void {
  console.log("Disconnected from SpacetimeDB", error ?? "");
  connection = null;
}

// -- Subscription callbacks --

function onSubscriptionApplied(_ctx: SubscriptionEventContext): void {
  console.log("Subscription applied, rendering existing strokes");
  renderAllStrokes();
}

function onUsersSubscriptionApplied(_ctx: SubscriptionEventContext): void {
  if (!connection) return;
  activeUserCount = Number(connection.db.connectedUsers.count());
  console.log("Users online:", activeUserCount);
  if (onUserCountChangeCallback) onUserCountChangeCallback(activeUserCount);
}

// -- Table callbacks --

function onStrokeInserted(_ctx: EventContext, stroke: Stroke): void {
  drawStroke(stroke);
}

function onStrokeDeleted(_ctx: EventContext, _stroke: Stroke): void {
  renderAllStrokes();
}

function onUserInserted(_ctx: EventContext, _user: ConnectedUser): void {
  activeUserCount++;
  if (onUserCountChangeCallback) onUserCountChangeCallback(activeUserCount);
}

function onUserDeleted(_ctx: EventContext, _user: ConnectedUser): void {
  activeUserCount = Math.max(0, activeUserCount - 1);
  if (onUserCountChangeCallback) onUserCountChangeCallback(activeUserCount);
}

// -- Reducer result callbacks --

function onAddStrokeResult(
  ctx: ReducerEventContext,
  _args: { points: Point[]; color: number; brushSize: number }
): void {
  if (ctx.event.status.tag === "Failed") {
    console.error("Failed to add stroke:", ctx.event.status.value);
  }
}

function onClearCanvasResult(ctx: ReducerEventContext): void {
  if (ctx.event.status.tag === "Failed") {
    console.error("Failed to clear canvas:", ctx.event.status.value);
  }
}

// -- Public API for tools.ts integration --

export function setColor(rgba: number): void {
  currentColor = rgba;
}

export function setBrushSize(size: number): void {
  currentBrushSize = size;
}

export function clearCanvas(): void {
  if (connection) {
    connection.reducers.clearCanvas();
  }
}

export function getConnection(): DbConnection | null {
  return connection;
}

export function getActiveUserCount(): number {
  return activeUserCount;
}

export function onActiveUserCountChange(
  cb: (count: number) => void
): void {
  onUserCountChangeCallback = cb;
}

// -- Expose to dev console --
(window as unknown as Record<string, unknown>).clearCanvas = clearCanvas;

// -- Self-initialize --
setupCanvas();
connect();
