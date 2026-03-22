// ABOUTME: Zustand store for AI chat UI ephemeral state.
// ABOUTME: Tracks active session, input text, streaming status, and scope panel visibility.

import { create } from "zustand";

interface ChatState {
  /** Currently active session ID */
  activeSessionId: string | null;
  /** Chat input text */
  inputText: string;
  /** Whether a response is currently streaming */
  isStreaming: boolean;
  /** Whether the scope/settings panel is open */
  isScopePanelOpen: boolean;
  /** Stream ID for the currently streaming response (used by driven useStream) */
  activeStreamId: string | null;
}

interface ChatActions {
  setActiveSessionId: (id: string | null) => void;
  setInputText: (text: string) => void;
  setIsStreaming: (streaming: boolean) => void;
  toggleScopePanel: () => void;
  setScopePanelOpen: (open: boolean) => void;
  setActiveStreamId: (id: string | null) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState & ChatActions>((set) => ({
  activeSessionId: null,
  inputText: "",
  isStreaming: false,
  isScopePanelOpen: false,
  activeStreamId: null,

  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setInputText: (text) => set({ inputText: text }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  toggleScopePanel: () => set((s) => ({ isScopePanelOpen: !s.isScopePanelOpen })),
  setScopePanelOpen: (open) => set({ isScopePanelOpen: open }),
  setActiveStreamId: (id) => set({ activeStreamId: id }),
  reset: () =>
    set({
      activeSessionId: null,
      inputText: "",
      isStreaming: false,
      isScopePanelOpen: false,
      activeStreamId: null,
    }),
}));
