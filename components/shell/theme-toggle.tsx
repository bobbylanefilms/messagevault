"use client";

// ABOUTME: Dark/light mode toggle button for the topbar.
// ABOUTME: Toggles the 'dark' class on <html> and persists preference to localStorage.

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("messagevault-theme");
    if (stored === "light") {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    }
  }, []);

  function handleToggle() {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("messagevault-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("messagevault-theme", "light");
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={handleToggle}>
          {isDark ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isDark ? "Light mode" : "Dark mode"}</TooltipContent>
    </Tooltip>
  );
}
