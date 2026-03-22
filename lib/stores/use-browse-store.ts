// ABOUTME: Zustand store for browse view UI state — scroll position, highlights, and filters.
// ABOUTME: Ephemeral state only; resets on conversation switch.

import { create } from "zustand";

interface BrowseState {
  /** Message ID to scroll to and highlight (set by search-to-browse navigation) */
  highlightedMessageId: string | null;
  /** Whether the initial scroll-to-bottom has occurred */
  hasScrolledToBottom: boolean;
  /** Participant IDs to show (empty = show all) */
  selectedParticipantIds: string[];
  /** Date key to scroll to (set by date jumper, consumed and cleared by thread) */
  scrollToDateKey: string | null;
}

interface BrowseActions {
  setHighlightedMessageId: (id: string | null) => void;
  setHasScrolledToBottom: (done: boolean) => void;
  setSelectedParticipantIds: (ids: string[]) => void;
  toggleParticipant: (id: string) => void;
  clearParticipantFilter: () => void;
  setScrollToDateKey: (dateKey: string | null) => void;
  /** Reset all browse state (called on conversation switch) */
  resetBrowseState: () => void;
}

export type BrowseStore = BrowseState & BrowseActions;

export const useBrowseStore = create<BrowseStore>((set) => ({
  highlightedMessageId: null,
  hasScrolledToBottom: false,
  selectedParticipantIds: [],
  scrollToDateKey: null,

  setHighlightedMessageId: (id) => set({ highlightedMessageId: id }),
  setHasScrolledToBottom: (done) => set({ hasScrolledToBottom: done }),
  setSelectedParticipantIds: (ids) => set({ selectedParticipantIds: ids }),
  toggleParticipant: (id) =>
    set((state) => {
      const current = state.selectedParticipantIds;
      const isSelected = current.includes(id);
      return {
        selectedParticipantIds: isSelected
          ? current.filter((pid) => pid !== id)
          : [...current, id],
      };
    }),
  clearParticipantFilter: () => set({ selectedParticipantIds: [] }),
  setScrollToDateKey: (dateKey) => set({ scrollToDateKey: dateKey }),
  resetBrowseState: () =>
    set({
      highlightedMessageId: null,
      hasScrolledToBottom: false,
      selectedParticipantIds: [],
      scrollToDateKey: null,
    }),
}));
