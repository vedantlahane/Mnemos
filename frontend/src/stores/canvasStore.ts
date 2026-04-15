import { create } from 'zustand';
import { CanvasState } from './types';
import { scene as sceneApi, canvas as canvasApi } from '../api/client';

export const useCanvasStore = create<CanvasState>((set, get) => ({
  sceneData: null,
  visualContext: null,
  pageRegions: [],
  pageEdges: [],
  pageNotes: [],
  selectedElementIds: [],
  isLoading: false,
  error: null,

  openCanvasPage: async (pageId: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await sceneApi.get(pageId);
      // Wait for scene API response which includes everything
      set({
        sceneData: res.scene_data,
        visualContext: res.visual_context,
        pageRegions: res.regions || [],
        pageEdges: res.edges || [],
        pageNotes: res.notes || [],
        isLoading: false
      });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  saveScene: async (pageId, data) => {
    try {
      await sceneApi.save(pageId, data);
      // We don't automatically set visualContext immediately to avoid flickering, 
      // but you might optionally call sceneApi.getVisualContext(pageId) explicitly.
      const ctx = await sceneApi.getVisualContext(pageId);
      set({ visualContext: ctx });
    } catch (e) {
      console.error('Failed to save scene', e);
    }
  },

  saveViewport: async (pageId, scrollX, scrollY, zoom) => {
    try {
      await sceneApi.saveViewport(pageId, { scroll_x: scrollX, scroll_y: scrollY, zoom });
    } catch (e) {
      console.error('Failed to save viewport', e);
    }
  },

  refreshRegions: async (pageId) => {
    try {
      const res = await canvasApi.listRegions(pageId);
      set({ pageRegions: res.regions });
    } catch(e) {}
  },

  setSelectedElements: (ids) => set({ selectedElementIds: ids }),

  triggerLayout: async (pageId) => {
    await sceneApi.triggerLayout(pageId);
    await get().openCanvasPage(pageId); // Reload scene after layout
  },

  syncNotes: async (pageId) => {
    await sceneApi.syncNotes(pageId);
    await get().openCanvasPage(pageId);
  }
}));