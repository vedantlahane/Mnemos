import { create } from 'zustand';
import { WorkspaceState } from './types';
import { pages as pagesApi, workspace as workspaceApi } from '../api/client';

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  pages: [],
  activePageId: null,
  stats: null,
  isLoading: false,
  error: null,

  fetchPages: async (includeArchived = false) => {
    set({ isLoading: true, error: null });
    try {
      const res = await pagesApi.list(includeArchived);
      set({ pages: res.pages, isLoading: false });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  fetchStats: async () => {
    try {
      const res = await workspaceApi.stats();
      set({ stats: res });
    } catch (e: any) {
      console.error('Failed to fetch stats', e);
    }
  },

  setActivePage: (id) => set({ activePageId: id }),

  createPage: async (data) => {
    const newPage = await pagesApi.create(data);
    set((state) => ({ pages: [...state.pages, newPage] }));
    return newPage;
  },

  updatePage: async (id, data) => {
    const updated = await pagesApi.update(id, data);
    set((state) => ({
      pages: state.pages.map((p) => (p.id === id ? updated : p))
    }));
  },

  deletePage: async (id) => {
    await pagesApi.delete(id);
    set((state) => ({
      pages: state.pages.filter((p) => p.id !== id),
      activePageId: state.activePageId === id ? null : state.activePageId
    }));
  }
}));