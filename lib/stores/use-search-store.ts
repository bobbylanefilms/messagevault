// ABOUTME: Zustand store for search page ephemeral UI state.
// ABOUTME: Manages search query, mode, filters, results, and loading state.

import { create } from "zustand";

type SearchMode = "keyword" | "semantic" | "hybrid";
type MessageType = "text" | "image" | "video" | "link" | "attachment_missing";

interface SearchFilters {
  conversationId: string | null;
  participantId: string | null;
  dateRangeStart: number | null;
  dateRangeEnd: number | null;
  messageType: MessageType | null;
}

interface ContextMessage {
  _id: string;
  senderName: string;
  content: string;
  timestamp: number;
}

interface SearchResult {
  _id: string;
  conversationId: string;
  participantId: string;
  senderName: string;
  content: string;
  timestamp: number;
  dateKey: string;
  messageType: string;
  attachmentRef?: string;
  hasReactions: boolean;
  _score: number;
  contextBefore: ContextMessage[];
  contextAfter: ContextMessage[];
}

interface SearchState {
  query: string;
  mode: SearchMode;
  filters: SearchFilters;
  results: SearchResult[];
  totalCount: number;
  conversationCounts: Record<string, number>;
  isSearching: boolean;
  hasSearched: boolean;
}

interface SearchActions {
  setQuery: (query: string) => void;
  setMode: (mode: SearchMode) => void;
  setFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
  clearFilters: () => void;
  setResults: (results: SearchResult[], totalCount: number, conversationCounts: Record<string, number>) => void;
  setIsSearching: (searching: boolean) => void;
  reset: () => void;
}

const initialFilters: SearchFilters = {
  conversationId: null,
  participantId: null,
  dateRangeStart: null,
  dateRangeEnd: null,
  messageType: null,
};

export type { SearchMode, SearchFilters, SearchResult, ContextMessage };

export const useSearchStore = create<SearchState & SearchActions>((set) => ({
  query: "",
  mode: "hybrid",
  results: [],
  totalCount: 0,
  conversationCounts: {},
  isSearching: false,
  hasSearched: false,
  filters: { ...initialFilters },

  setQuery: (query) => set({ query }),
  setMode: (mode) => set({ mode }),
  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    })),
  clearFilters: () => set({ filters: { ...initialFilters } }),
  setResults: (results, totalCount, conversationCounts) =>
    set({ results, totalCount, conversationCounts, hasSearched: true }),
  setIsSearching: (isSearching) => set({ isSearching }),
  reset: () =>
    set({
      query: "",
      mode: "hybrid",
      results: [],
      totalCount: 0,
      conversationCounts: {},
      isSearching: false,
      hasSearched: false,
      filters: { ...initialFilters },
    }),
}));
