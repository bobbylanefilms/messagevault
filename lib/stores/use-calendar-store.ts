// ABOUTME: Zustand store for calendar UI state — tracks the currently selected year.
// ABOUTME: Ephemeral UI state only; not persisted to database.

import { create } from "zustand";

interface CalendarState {
  selectedYear: number;
}

interface CalendarActions {
  setSelectedYear: (year: number) => void;
}

export type CalendarStore = CalendarState & CalendarActions;

export const useCalendarStore = create<CalendarStore>((set) => ({
  selectedYear: new Date().getFullYear(),
  setSelectedYear: (year) => set({ selectedYear: year }),
}));
