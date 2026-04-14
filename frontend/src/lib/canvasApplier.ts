/**
 * Applies CanvasOps to an Excalidraw instance.
 * Bridges backend operations → Excalidraw API calls.
 */

import type { CanvasOp } from "./canvasOps";

// Streaming text accumulator
const streamBuffers = new Map<string, { text: string; x: number; y: number }>();

export class CanvasApplier {
  private api: any

  constructor(api: any) {
    this.api = api;
    this.ensureSceneElementShape();
  }

  apply(op: CanvasOp) {
    try {
      this.ensureSceneElementShape();

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
    } catch (error) {
      console.error("Canvas op apply failed", op, error);
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
    this.api.updateScene({
      appState: { theme: op.theme as "dark" | "light" },
    });
  }

  private applyPanTo(op: CanvasOp) {
    if (op.x == null || op.y == null) return;
    if (this.isEditingActive()) return;

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
    const x = op.x ?? 200;
    const y = op.y ?? 200;

    streamBuffers.set(op.element_id, { text: "", x, y });
  }

  private applyStreamChunk(op: CanvasOp) {
    if (!op.element_id) return;

    const buffer = streamBuffers.get(op.element_id);
    if (!buffer) return;

    if (op.text) {
      buffer.text += op.text;
    }

    // Avoid per-chunk scene writes; rapid updates can race with Excalidraw editor cleanup.
  }

  private applyStreamEnd(op: CanvasOp) {
    if (!op.element_id) return;
    const buffer = streamBuffers.get(op.element_id);
    const focusX = buffer?.x ?? op.x ?? 200;
    const focusY = buffer?.y ?? op.y ?? 200;
    const focusW = op.width ?? 600;
    const focusH = op.height ?? 240;

    streamBuffers.delete(op.element_id);
    void this.refreshScene();
    this.focusRegionAfterRefresh(focusX, focusY, focusW, focusH);
  }

  // ── Element Creation ──

  private applyCreateText(op: CanvasOp) {
    if (!op.text || op.x == null || op.y == null) return;

    // Text is persisted by backend using measured bounds; refresh and focus persisted result.
    void this.refreshScene();
    this.focusRegionAfterRefresh(op.x, op.y, op.width ?? 600, op.height ?? 240);
  }

  private applyCreateDiagram(op: CanvasOp) {
    const focusX = op.x ?? 200;
    const focusY = op.y ?? 200;
    const focusW = op.width ?? 600;
    const focusH = op.height ?? 400;

    // Diagram geometry is produced and persisted by backend; refresh scene and focus it.
    void this.refreshScene();
    this.focusRegionAfterRefresh(focusX, focusY, focusW, focusH);
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

  private focusRegionAfterRefresh(x: number, y: number, width: number, height: number) {
    let attempts = 0;
    const maxAttempts = 10;

    const tryFocus = () => {
      if (this.isEditingActive()) {
        attempts += 1;
        if (attempts < maxAttempts) {
          setTimeout(tryFocus, 140);
        }
        return;
      }

      const padding = 80;
      const left = x - padding;
      const top = y - padding;
      const right = x + width + padding;
      const bottom = y + height + padding;

      const regionElements = this.api.getSceneElements().filter((el: any) => {
        if (el.isDeleted) return false;
        const ex = Number(el.x) || 0;
        const ey = Number(el.y) || 0;
        const ew = Number(el.width) || 0;
        const eh = Number(el.height) || 0;
        return ex <= right && ex + ew >= left && ey <= bottom && ey + eh >= top;
      });

      if (regionElements.length > 0) {
        this.api.scrollToContent(regionElements as any, {
          fitToContent: true,
          animate: true,
          duration: 400,
        });
        return;
      }

      attempts += 1;
      if (attempts < maxAttempts) {
        setTimeout(tryFocus, 140);
      }
    };

    setTimeout(tryFocus, 140);
  }

  private isEditingActive(): boolean {
    const appState = this.api?.getAppState?.();
    if (!appState) return false;
    return Boolean(
      appState.editingTextElement ||
      appState.editingLinearElement ||
      appState.editingGroupId ||
      appState.editingFrame
    );
  }

  private ensureSceneElementShape() {
    const current = this.api?.getSceneElements?.();
    if (!Array.isArray(current) || current.length === 0) return;

    let changed = false;
    const normalized = current.map((el: any) => {
      const next = { ...el };

      if (!Array.isArray(next.groupIds)) {
        next.groupIds = [];
        changed = true;
      }
      if (next.frameId === undefined) {
        next.frameId = null;
        changed = true;
      }
      if (!next.customData || typeof next.customData !== "object") {
        next.customData = {};
        changed = true;
      }

      return next;
    });

    if (changed) {
      this.api.updateScene({ elements: normalized });
    }
  }
}
