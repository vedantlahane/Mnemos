// === FILE: frontend/src/lib/utils.ts ===

/**
 * Mnemos v4 — Frontend Utilities
 *
 * Pure functions. No side effects. No API calls.
 * Grouped by concern:
 *   - Type guards & data extraction
 *   - Formatting & display
 *   - Canvas / Excalidraw helpers
 *   - Chat response routing
 */

import type {
  ChatResponse,
  UIAction,
  ActivePanel,
  ExcalidrawElement,
  ExcalidrawScene,
  Item,
  ItemSummary,
  Workspace,
  BoardListData,
  ItemListData,
  OpenBoardData,
  GraphData,
  SearchData,
  TagListData,
  WorkspaceStats,
  CaptureData,
  ChatSourceData,
  Preferences,
  ThemeName,
  CanvasPlacement,
} from "./types";

// ══════════════════════════════════════════
// TYPE GUARDS & DATA EXTRACTION
// ══════════════════════════════════════════

/**
 * Safely extract typed data from a ChatResponse based on its ui_action.
 * The backend sends `data: unknown` — these narrow it to the correct type.
 */

export function asBoardList(data: unknown): BoardListData | null {
  if (data && typeof data === "object" && "boards" in data) {
    return data as BoardListData;
  }
  return null;
}

export function asItemList(data: unknown): ItemListData | null {
  if (data && typeof data === "object" && "items" in data) {
    return data as ItemListData;
  }
  return null;
}

export function asOpenBoard(data: unknown): OpenBoardData | null {
  if (data && typeof data === "object" && "board" in data) {
    return data as OpenBoardData;
  }
  return null;
}

export function asGraph(data: unknown): GraphData | null {
  if (data && typeof data === "object" && "nodes" in data) {
    return data as GraphData;
  }
  return null;
}

export function asSearch(data: unknown): SearchData | null {
  if (data && typeof data === "object" && "results" in data) {
    return data as SearchData;
  }
  return null;
}

export function asTags(data: unknown): TagListData | null {
  if (data && typeof data === "object" && "tags" in data) {
    return data as TagListData;
  }
  return null;
}

export function asStats(data: unknown): WorkspaceStats | null {
  if (data && typeof data === "object" && "total_items" in data) {
    return data as WorkspaceStats;
  }
  return null;
}

export function asCapture(data: unknown): CaptureData | null {
  if (data && typeof data === "object" && "item_id" in data) {
    return data as CaptureData;
  }
  return null;
}

export function asSources(data: unknown): ChatSourceData | null {
  if (data && typeof data === "object" && "sources" in data) {
    return data as ChatSourceData;
  }
  return null;
}

export function asPreferences(data: unknown): Preferences | null {
  if (data && typeof data === "object" && "primary_model" in data) {
    return data as Preferences;
  }
  return null;
}

// ══════════════════════════════════════════
// CHAT RESPONSE ROUTING
// Maps backend responses to frontend UI state
// ══════════════════════════════════════════

/**
 * Given a chat response, determine which panel to show.
 * Returns null if no panel change is needed (e.g., pure chat answer).
 */
export function panelForAction(action: UIAction | null): ActivePanel {
  if (!action) return "none";
  const map: Record<string, ActivePanel> = {
    open_settings: "settings",
    list_boards: "boards",
    list_items: "items",
    open_board: "none",      // board open = close panel, show canvas
    open_graph: "graph",
    list_tags: "tags",
    show_stats: "stats",
    show_search: "search",
  };
  return map[action] ?? "none";
}

/**
 * Should the frontend navigate to a different workspace?
 * Returns workspace or null.
 */
export function extractNavigation(response: ChatResponse): Workspace | null {
  if (response.ui_action === "open_board" && response.data) {
    const board = asOpenBoard(response.data);
    return board?.board ?? null;
  }
  return null;
}

/**
 * Should the frontend reload the canvas?
 */
export function shouldReloadCanvas(response: ChatResponse): boolean {
  return response.canvas_update?.action === "reload";
}

/**
 * Get the new canvas version from a response, if any.
 */
export function getCanvasVersion(response: ChatResponse): number | null {
  return response.canvas_update?.version ?? null;
}

// ══════════════════════════════════════════
// FORMATTING & DISPLAY
// ══════════════════════════════════════════

/**
 * Format a date string for display.
 * Returns relative time for recent, absolute for older.
 */
export function formatTime(isoString: string | null | undefined): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 365) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

/**
 * Truncate text with ellipsis.
 */
export function truncate(text: string | null | undefined, max: number = 100): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

/**
 * Format a similarity score for display.
 */
export function formatSimilarity(score: number | undefined): string {
  if (score === undefined || score === null) return "";
  return `${Math.round(score * 100)}%`;
}

/**
 * Get a display label for an item's content type.
 */
export function contentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    note: "Note",
    code: "Code",
    url: "Link",
    thought: "Thought",
    question: "Question",
    snippet: "Snippet",
  };
  return labels[type] ?? "Note";
}

/**
 * Get an icon for an item's content type.
 */
export function contentTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    note: "📝",
    code: "💻",
    url: "🔗",
    thought: "💭",
    question: "❓",
    snippet: "✂️",
  };
  return icons[type] ?? "📝";
}

/**
 * Get a status badge color.
 */
export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: "#f59e0b",
    processing: "#3b82f6",
    ready: "#10b981",
    error: "#ef4444",
  };
  return colors[status] ?? "#6b7280";
}

/**
 * Format tag for display (adds # if not present).
 */
export function formatTag(tag: string): string {
  return tag.startsWith("#") ? tag : `#${tag}`;
}

/**
 * Generate a URL-safe slug from a name.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ══════════════════════════════════════════
// CANVAS / EXCALIDRAW HELPERS
// ══════════════════════════════════════════

/**
 * Check if an Excalidraw element is managed by the backend
 * (i.e., it represents an item card or canvas object).
 */
export function isManagedElement(el: ExcalidrawElement): boolean {
  const custom = el.customData;
  if (!custom || typeof custom !== "object") return false;
  return "itemId" in custom || "canvasObjectId" in custom;
}

/**
 * Extract the item ID from a managed element, if any.
 */
export function getItemIdFromElement(el: ExcalidrawElement): string | null {
  const custom = el.customData;
  if (!custom || typeof custom !== "object") return null;
  return (custom as Record<string, unknown>).itemId as string ?? null;
}

/**
 * Extract the canvas object ID from a managed element, if any.
 */
export function getCanvasObjectId(el: ExcalidrawElement): string | null {
  const custom = el.customData;
  if (!custom || typeof custom !== "object") return null;
  return (custom as Record<string, unknown>).canvasObjectId as string ?? null;
}

/**
 * Filter scene elements to only user-drawn (non-managed) elements.
 */
export function getUserDrawnElements(elements: ExcalidrawElement[]): ExcalidrawElement[] {
  return elements.filter((el) => !isManagedElement(el) && !el.isDeleted);
}

/**
 * Get bounding box of all non-deleted elements.
 */
export function getSceneBounds(elements: ExcalidrawElement[]): {
  minX: number; minY: number; maxX: number; maxY: number;
} {
  const active = elements.filter((el) => !el.isDeleted && el.width > 0);
  if (active.length === 0) {
    return { minX: 0, minY: 0, maxX: 1920, maxY: 1080 };
  }
  return {
    minX: Math.min(...active.map((e) => e.x)),
    minY: Math.min(...active.map((e) => e.y)),
    maxX: Math.max(...active.map((e) => e.x + e.width)),
    maxY: Math.max(...active.map((e) => e.y + e.height)),
  };
}

/**
 * Compute zoom-to-fit parameters for a set of elements.
 */
export function zoomToFit(
  elements: ExcalidrawElement[],
  viewportWidth: number,
  viewportHeight: number,
  padding: number = 50,
): { scrollX: number; scrollY: number; zoom: number } {
  const bounds = getSceneBounds(elements);
  const contentW = bounds.maxX - bounds.minX + padding * 2;
  const contentH = bounds.maxY - bounds.minY + padding * 2;

  if (contentW <= 0 || contentH <= 0) {
    return { scrollX: 0, scrollY: 0, zoom: 1 };
  }

  const zoom = Math.min(
    viewportWidth / contentW,
    viewportHeight / contentH,
    1.5, // max zoom
  );

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    scrollX: -(centerX - viewportWidth / (2 * zoom)),
    scrollY: -(centerY - viewportHeight / (2 * zoom)),
    zoom: Math.max(zoom, 0.1),
  };
}

/**
 * Find all element IDs belonging to a specific item card.
 */
export function getItemElementIds(
  elements: ExcalidrawElement[],
  itemId: string,
): string[] {
  return elements
    .filter((el) => {
      const custom = el.customData as Record<string, unknown> | undefined;
      return custom?.itemId === itemId;
    })
    .map((el) => el.id);
}

/**
 * Check if a point is inside a placement rectangle.
 */
export function isPointInPlacement(
  x: number, y: number,
  placement: CanvasPlacement,
): boolean {
  return (
    x >= placement.x &&
    x <= placement.x + placement.w &&
    y >= placement.y &&
    y <= placement.y + placement.h
  );
}

// ══════════════════════════════════════════
// THEME HELPERS
// ══════════════════════════════════════════

/**
 * Compute relative luminance of a hex color.
 */
export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Pick readable text color for a given background.
 */
export function contrastColor(bgHex: string): string {
  return luminance(bgHex) < 0.4 ? "#f9fafb" : "#111827";
}

/**
 * Detect theme from background color.
 */
export function themeFromBackground(bg: string): ThemeName {
  return luminance(bg) < 0.4 ? "dark" : "light";
}

// ══════════════════════════════════════════
// MISC HELPERS
// ══════════════════════════════════════════

/**
 * Debounce a function.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Simple deep equality check for plain objects.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) =>
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
    ),
  );
}

/**
 * Generate a short random ID (for local-only use).
 */
export function localId(len: number = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: len }, () =>
    chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Group an array by a key function.
 */
export function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string,
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    (result[key] ??= []).push(item);
  }
  return result;
}