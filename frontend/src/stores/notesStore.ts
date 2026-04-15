import { create } from 'zustand';
import { NotesState } from './types';
import { notes as notesApi } from '../api/client';

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  isLoading: false,
  error: null,

  fetchNotes: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const res = await notesApi.list(params);
      set({ notes: res.notes, isLoading: false });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  createNote: async (data) => {
    // Implement capture via other means
  },

  updateNote: async (id, data) => {
    const updated = await notesApi.update(id, data);
    set((state) => ({
      notes: state.notes.map((n) => (n.id === id ? updated : n))
    }));
  },

  deleteNote: async (id) => {
    await notesApi.delete(id);
    set((state) => ({ notes: state.notes.filter((n) => n.id !== id) }));
  },

  retryNote: async (id) => {
    await notesApi.retry(id);
    // Reload note
  },

  moveNote: async (id, pageId) => {
    await notesApi.move(id, pageId);
    // Optionally update note page_id in state
  }
}));