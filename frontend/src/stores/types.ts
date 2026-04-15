import { Page, Note, NoteEdge, Region, VisualContext, ChatMessage, WorkspaceStats } from '../types';

export interface WorkspaceState {
  pages: Page[];
  activePageId: string | null;
  stats: WorkspaceStats | null;
  isLoading: boolean;
  error: string | null;
  fetchPages: (includeArchived?: boolean) => Promise<void>;
  fetchStats: () => Promise<void>;
  setActivePage: (id: string | null) => void;
  createPage: (data: any) => Promise<Page>;
  updatePage: (id: string, data: Partial<Page>) => Promise<void>;
  deletePage: (id: string) => Promise<void>;
}

export interface CanvasState {
  sceneData: { elements: any[]; appState: any; files: any } | null;
  visualContext: VisualContext | null;
  pageRegions: Region[];
  pageEdges: NoteEdge[];
  pageNotes: Note[];
  selectedElementIds: string[];
  isLoading: boolean;
  error: string | null;
  openCanvasPage: (pageId: string) => Promise<void>;
  saveScene: (pageId: string, data: { elements: any[]; appState: object; files: object }) => Promise<void>;
  saveViewport: (pageId: string, scrollX: number, scrollY: number, zoom: number) => Promise<void>;
  refreshRegions: (pageId: string) => Promise<void>;
  setSelectedElements: (ids: string[]) => void;
  triggerLayout: (pageId: string) => Promise<void>;
  syncNotes: (pageId: string) => Promise<void>;
}

export interface NotesState {
  notes: Note[];
  isLoading: boolean;
  error: string | null;
  fetchNotes: (params?: any) => Promise<void>;
  createNote: (data: any) => Promise<void>;
  updateNote: (id: string, data: any) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  retryNote: (id: string) => Promise<void>;
  moveNote: (id: string, pageId: string) => Promise<void>;
}

export interface ChatState {
  messages: ChatMessage[];
  isThinking: boolean;
  clearChat: () => void;
  addMessage: (msg: ChatMessage) => void;
}

export interface SettingsState {
  settings: any;
  isLoading: boolean;
  fetchSettings: () => Promise<void>;
  updateSettings: (data: any) => Promise<void>;
}