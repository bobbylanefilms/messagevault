// ABOUTME: Shared utility functions used across the app.
// ABOUTME: Includes cn() for Tailwind class merging (required by shadcn/ui).

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
