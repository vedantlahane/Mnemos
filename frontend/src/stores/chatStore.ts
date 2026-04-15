import { create } from 'zustand';
import { ChatState } from './types';
import { chat as chatApi } from '../api/client';

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isThinking: false,
  
  clearChat: () => set({ messages: [] }),
  
  addMessage: (msg) => set((state) => ({ 
    messages: [...state.messages, msg] 
  })),
}));