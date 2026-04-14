/**
 * Applies CanvasOps to an Excalidraw instance.
 * Bridges backend operations → Excalidraw API calls.
 */

import type { CanvasOp } from "./canvasOps";

// Streaming text accumulator
const streamBuffers = new Map<string, { text: string; x: number; y: number; style: string }>();

// Style presets matching backend
const STYLE_COLORS: Record<string, Record<string, { bg: string; border: string; text: string }>> = {
  dark: {
    default: { bg: "#1e1e2e", border: "#374151", text: "#e5e7eb" },
    accent: { bg: "#312e81", border: "#6366f1", text: "#c7d2fe" },
    muted: { bg: "#1f2937", border: "#4b5563", text: "#9ca3af" },
    warning: { bg: "#431407", border: "#ea580c", text: "#fed7aa" },
    success: { bg: "#052e16", border: "#16a34a", text: "#bbf7d0" },
    compose: { bg: "transparent", border: "transparent", text: "#e5e7eb" },
  },
  light: {
    default: { bg: "#ffffff", border: "#e5e7eb", text: "#1f2937" },
    accent: { bg: "#eef2ff", border: "#6366f1", text: "#312e81" },
    muted: { bg: "#f9fafb", border: "#d1d5db", text: "#6b7280" },
    warning: { bg: "#fff7ed", border: "#ea580c", text: "#7c2d12" },
    success: { bg: "#f0fdf4", border: "#16a34a", text: "#14532d" },
    compose: { bg: "transparent", border: "transparent", text: "#1f2937" },
  },
};

export class CanvasApplier {
  private api: any
  private theme: "dark" | "light" = "dark"

  constructor(api: any) {
    this.api = api;
    const appState = api.getAppState();
    this.theme = appState.theme === "light" ? "light" : "dark";
  }

  apply(op: CanvasOp) {
    switch (op.op) {
      case "set_background":
        this.applySetBackground(op);
        break;
      case "set_theme":
        this.applySetTheme(op);
        break;
      case "pan_to":
        this.applyPanTo(op);
        break;
      case "zoom_to":
        this.applyZoomTo(op);
        break;
      case "stream_start":
        this.applyStreamStart(op);
        break;
      case "stream_chunk":
        this.applyStreamChunk(op);
        break;
      case "stream_end":
        this.applyStreamEnd(op);
        break;
      case "create_text":
        this.applyCreateText(op);
        break;
      case "create_diagram":
        this.applyCreateDiagram(op);
        break;
      case "move_element":
        this.applyMoveElement(op);
        break;
      case "delete_element":
        this.applyDeleteElement(op);
        break;
      case "create_note":
        // Note cards are created by the backend scene sync
        // Frontend just needs to refresh the scene
        this.refreshScene();
        break;
      case "batch":
        if (op.operations) {
          for (const subOp of op.operations) {
            this.apply(subOp);
          }
        }
        break;
      case "info":
        this.handleInfo(op);
        break;
    }
  }

  // ── Canvas State ──

  private applySetBackground(op: CanvasOp) {
    if (!op.color) return;
    this.api.updateScene({
      appState: { viewBackgroundColor: op.color },
    });
  }

  private applySetTheme(op: CanvasOp) {
    if (!op.theme) return;
    this.theme = op.theme as "dark" | "light";
    this.api.updateScene({
      appState: { theme: op.theme as "dark" | "light" },
    });
  }

  private applyPanTo(op: CanvasOp) {
    if (op.x == null || op.y == null) return;
    this.api.scrollToContent(
      this.api.getSceneElements().filter((el: any) => {
        // Find element near target coordinates
        return (
          Math.abs((el.x || 0) - op.x!) < 200 &&
          Math.abs((el.y || 0) - op.y!) < 200
        );
      }),
      { fitToContent: true, animate: true, duration: 500 }
    );
  }

  private applyZoomTo(op: CanvasOp) {
    if (op.zoom == null) return;
    const appState = this.api.getAppState();
    this.api.updateScene({
      appState: {
        ...appState,
        zoom: { value: op.zoom as any },
      },
    });
  }

  // ── Streaming Text ──

  private applyStreamStart(op: CanvasOp) {
    if (!op.element_id) return;
    const style = op.style || "compose";
    const x = op.x ?? 200;
    const y = op.y ?? 200;

    streamBuffers.set(op.element_id, { text: "", x, y, style });

    // Create placeholder element
    const colors = this.getStyleColors(style);
    const element = this.createTextElement(
      op.element_id,
      "Writing…",
      x,
      y,
      colors.text,
      { opacity: 60 }
    );

    const elements = this.api.getSceneElements();
    this.api.updateScene({
      elements: [...elements, element],
    });
  }

  private applyStreamChunk(op: CanvasOp) {
    if (!op.element_id || !op.text) return;

    const buffer = streamBuffers.get(op.element_id);
    if (!buffer) return;

    buffer.text += op.text;

    // Update the element text
    const elements = this.api.getSceneElements().map((el: any) => {
      if (el.id === op.element_id) {
        return {
          ...el,
          text: buffer.text,
          originalText: buffer.text,
          opacity: 100,
          // Auto-resize
          width: Math.min(Math.max(200, buffer.text.length * 4), 600),
          height: Math.max(100, Math.ceil(buffer.text.split("\n").length * 20)),
        } as any;
      }
      return el;
    });

    this.api.updateScene({ elements });
  }

  private applyStreamEnd(op: CanvasOp) {
    if (!op.element_id) return;
    const buffer = streamBuffers.get(op.element_id);
    if (!buffer) return;

    const finalText = op.text || buffer.text;

    // Finalize with proper dimensions
    const elements = this.api.getSceneElements().map((el: any) => {
      if (el.id === op.element_id) {
        const lines = finalText.split("\n");
        const maxLineLen = Math.max(...lines.map((l: string) => l.length));
        return {
          ...el,
          text: finalText,
          originalText: finalText,
          opacity: 100,
          width: Math.min(Math.max(200, maxLineLen * 7.5), 600),
          height: Math.max(60, lines.length * 20 + 20),
        } as any;
      }
      return el;
    });

    this.api.updateScene({ elements });
    streamBuffers.delete(op.element_id);
  }

  // ── Element Creation ──

  private applyCreateText(op: CanvasOp) {
    if (!op.text || op.x == null || op.y == null) return;

    const style = op.style || "default";
    const colors = this.getStyleColors(style);
    const elementId = op.element_id || this.generateId();

    const element = this.createTextElement(
      elementId,
      op.text,
      op.x,
      op.y,
      colors.text
    );

    const elements = this.api.getSceneElements();
    this.api.updateScene({
      elements: [...elements, element],
    });
  }

  private applyCreateDiagram(op: CanvasOp) {
    if (!op.topology) return;
    const baseX = op.x ?? 200;
    const baseY = op.y ?? 200;
    const topology = op.topology;

    const newElements: any[] = [];
    const elementPositions = new Map<string, { x: number; y: number; w: number; h: number }>();

    // Layout elements based on layout_type
    const layoutType = topology.layout_type || "flow";
    const topoElements = topology.elements || [];
    const connections = topology.connections || [];

    // Position elements
    topoElements.forEach((el: any, index: number) => {
      const { x, y } = this.layoutPosition(
        layoutType,
        index,
        topoElements.length,
        baseX,
        baseY,
        el.width || 200,
        el.height || 60
      );

      const w = el.width || 200;
      const h = el.height || 60;
      elementPositions.set(el.id, { x, y, w, h });

      const colors = this.getStyleColors(el.style || "default");

      if (el.type === "box" || el.type === "text") {
        // Background rectangle
        const rectId = `${el.id}-rect`;
        newElements.push({
          id: rectId,
          type: "rectangle",
          x,
          y,
          width: w,
          height: h,
          strokeColor: colors.border,
          backgroundColor: colors.bg,
          fillStyle: "solid",
          strokeWidth: 2,
          roughness: 0,
          opacity: 100,
          roundness: { type: 3, value: 8 },
          groupIds: [`group-${el.id}`],
          isDeleted: false,
          seed: Math.floor(Math.random() * 2147483647),
          version: 1,
          versionNonce: Math.floor(Math.random() * 2147483647),
        });

        // Text label
        newElements.push({
          id: `${el.id}-text`,
          type: "text",
          x: x + 12,
          y: y + h / 2 - 10,
          width: w - 24,
          height: 20,
          text: el.label || "",
          originalText: el.label || "",
          fontSize: 16,
          fontFamily: 1,
          textAlign: "center",
          verticalAlign: "middle",
          strokeColor: colors.text,
          backgroundColor: "transparent",
          fillStyle: "solid",
          strokeWidth: 1,
          roughness: 0,
          opacity: 100,
          groupIds: [`group-${el.id}`],
          isDeleted: false,
          lineHeight: 1.25,
          containerId: null,
          autoResize: true,
          seed: Math.floor(Math.random() * 2147483647),
          version: 1,
          versionNonce: Math.floor(Math.random() * 2147483647),
        });
      }
    });

    // Create arrows for connections
    connections.forEach((conn: any, index: number) => {
      const fromPos = elementPositions.get(conn.from);
      const toPos = elementPositions.get(conn.to);
      if (!fromPos || !toPos) return;

      const startX = fromPos.x + fromPos.w / 2;
      const startY = fromPos.y + fromPos.h;
      const endX = toPos.x + toPos.w / 2;
      const endY = toPos.y;

      newElements.push({
        id: `arrow-${conn.from}-${conn.to}-${index}`,
        type: "arrow",
        x: startX,
        y: startY,
        width: endX - startX,
        height: endY - startY,
        points: [
          [0, 0],
          [endX - startX, endY - startY],
        ],
        strokeColor: this.theme === "dark" ? "#6b7280" : "#9ca3af",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 2,
        strokeStyle:
          conn.style === "dashed"
            ? "dashed"
            : conn.style === "dotted"
              ? "dotted"
              : "solid",
        roughness: 0,
        opacity: 100,
        startArrowhead: null,
        endArrowhead: "arrow",
        isDeleted: false,
        seed: Math.floor(Math.random() * 2147483647),
        version: 1,
        versionNonce: Math.floor(Math.random() * 2147483647),
      });
    });

    const elements = this.api.getSceneElements();
    this.api.updateScene({
      elements: [...elements, ...newElements],
    });

    // Pan to new diagram
    if (newElements.length > 0) {
      setTimeout(() => {
        this.api.scrollToContent(newElements as any, {
          fitToContent: true,
          animate: true,
          duration: 400,
        });
      }, 100);
    }
  }

  private applyMoveElement(op: CanvasOp) {
    if (op.x == null || op.y == null) return;

    // Find by note_id (in customData) or element_id
    const elements = this.api.getSceneElements().map((el: any) => {
      const cd = (el as any).customData || {};
      const match =
        (op.element_id && el.id === op.element_id) ||
        (op.note_id && cd.noteId === op.note_id && cd.type === "note-frame");

      if (match) {
        return { ...el, x: op.x! - 12, y: op.y! - 12 } as any;
      }

      // Move grouped elements too
      if (op.note_id && cd.noteId === op.note_id) {
        // Calculate offset from frame
        const frame = this.api.getSceneElements().find(
          (e: any) =>
            (e as any).customData?.noteId === op.note_id &&
            (e as any).customData?.type === "note-frame"
        );
        if (frame) {
          const dx = op.x! - 12 - frame.x;
          const dy = op.y! - 12 - frame.y;
          return { ...el, x: el.x + dx, y: el.y + dy } as any;
        }
      }

      return el;
    });

    this.api.updateScene({ elements });
  }

  private applyDeleteElement(op: CanvasOp) {
    const elements = this.api.getSceneElements().filter((el: any) => {
      if (op.element_id && el.id === op.element_id) return false;
      if (op.note_id) {
        const cd = (el as any).customData || {};
        if (cd.noteId === op.note_id) return false;
      }
      return true;
    });
    this.api.updateScene({ elements });
  }

  // ── Info/Navigation ──

  private handleInfo(op: CanvasOp) {
    const msg = op.message || "";
    if (msg.startsWith("navigate_to_page:")) {
      const pageId = msg.split(":")[1];
      // Emit custom event for the app router to handle
      window.dispatchEvent(
        new CustomEvent("mnemos:navigate", { detail: { pageId } })
      );
    }
  }

  private async refreshScene() {
    // The backend has updated the scene in DB.
    // Emit event so the page component can re-fetch.
    window.dispatchEvent(new CustomEvent("mnemos:refresh-canvas"));
  }

  // ── Helpers ──

  private getStyleColors(style: string) {
    return (
      STYLE_COLORS[this.theme]?.[style] ||
      STYLE_COLORS[this.theme]?.default ||
      STYLE_COLORS.dark.default
    );
  }

  private layoutPosition(
    layoutType: string,
    index: number,
    total: number,
    baseX: number,
    baseY: number,
    itemW: number,
    itemH: number
  ): { x: number; y: number } {
    const gapX = 80;
    const gapY = 100;

    switch (layoutType) {
      case "flow": {
        // Top to bottom
        return {
          x: baseX + (600 - itemW) / 2,
          y: baseY + index * (itemH + gapY),
        };
      }
      case "mindmap": {
        if (index === 0) {
          return { x: baseX + 200, y: baseY + 200 };
        }
        const angle = ((index - 1) / (total - 1)) * 2 * Math.PI;
        const radius = 250;
        return {
          x: baseX + 200 + radius * Math.cos(angle) - itemW / 2,
          y: baseY + 200 + radius * Math.sin(angle) - itemH / 2,
        };
      }
      case "list": {
        return {
          x: baseX,
          y: baseY + index * (itemH + 20),
        };
      }
      case "comparison": {
        const col = index % 2;
        const row = Math.floor(index / 2);
        return {
          x: baseX + col * (itemW + gapX),
          y: baseY + row * (itemH + gapY),
        };
      }
      case "timeline": {
        return {
          x: baseX + index * (itemW + gapX),
          y: baseY,
        };
      }
      default: {
        // Freeform: grid
        const cols = Math.ceil(Math.sqrt(total));
        const col = index % cols;
        const row = Math.floor(index / cols);
        return {
          x: baseX + col * (itemW + gapX),
          y: baseY + row * (itemH + gapY),
        };
      }
    }
  }

  private createTextElement(
    id: string,
    text: string,
    x: number,
    y: number,
    color: string,
    overrides: Record<string, any> = {}
  ): any {
    const lines = text.split("\n");
    const maxLineLen = Math.max(...lines.map((l) => l.length), 10);
    return {
      id,
      type: "text",
      x,
      y,
      width: Math.min(Math.max(200, maxLineLen * 7.5), 600),
      height: Math.max(40, lines.length * 20 + 10),
      text,
      originalText: text,
      fontSize: 16,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "top",
      strokeColor: color,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: 0,
      opacity: 100,
      lineHeight: 1.25,
      autoResize: true,
      isDeleted: false,
      containerId: null,
      seed: Math.floor(Math.random() * 2147483647),
      version: 1,
      versionNonce: Math.floor(Math.random() * 2147483647),
      customData: { type: "composed-text" },
      ...overrides,
    };
  }

  private generateId(): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from(
      { length: 21 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  }
}
