import { create } from "zustand";

type UiState = {
  activeListId: string | null;
  historyListId: string | null;
  editingTaskId: string | null;
  setActiveListId: (id: string | null) => void;
  setHistoryListId: (id: string | null) => void;
  setEditingTaskId: (id: string | null) => void;
};

export const useUiStore = create<UiState>((set) => ({
  activeListId: null,
  historyListId: null,
  editingTaskId: null,
  setActiveListId: (activeListId) => set({ activeListId }),
  setHistoryListId: (historyListId) => set({ historyListId }),
  setEditingTaskId: (editingTaskId) => set({ editingTaskId }),
}));