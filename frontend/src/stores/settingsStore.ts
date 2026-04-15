import { create } from 'zustand';
import { SettingsState } from './types';
import { settings as settingsApi } from '../api/client';

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  isLoading: false,

  fetchSettings: async () => {
    set({ isLoading: true });
    try {
      const res = await settingsApi.get();
      set({ settings: res, isLoading: false });
    } catch (e: any) {
      set({ isLoading: false });
      console.error('Failed to load settings', e);
    }
  },

  updateSettings: async (data) => {
    try {
      const updated = await settingsApi.update(data);
      set({ settings: updated });
    } catch (e) {
      console.error('Failed to update settings', e);
    }
  }
}));