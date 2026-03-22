"use client";

// ABOUTME: Dark/light/system theme toggle button for the topbar.
// ABOUTME: Cycles through dark → light → system, persists to localStorage.

import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Theme = "dark" | "light" | "system";

function getEffectiveTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem("messagevault-theme") as Theme | null;
    if (stored && ["dark", "light", "system"].includes(stored)) {
      setTheme(stored);
      const effective = getEffectiveTheme(stored);
      document.documentElement.classList.toggle("dark", effective === "dark");
    }
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const effective = getEffectiveTheme("system");
      document.documentElement.classList.toggle("dark", effective === "dark");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  function handleToggle() {
    const cycle: Record<Theme, Theme> = {
      dark: "light",
      light: "system",
      system: "dark",
    };
    const next = cycle[theme];
    setTheme(next);
    const effective = getEffectiveTheme(next);
    document.documentElement.classList.toggle("dark", effective === "dark");
    localStorage.setItem("messagevault-theme", next);
  }

  const icons: Record<Theme, typeof Moon> = {
    dark: Sun,
    light: Monitor,
    system: Moon,
  };
  const labels: Record<Theme, string> = {
    dark: "Light mode",
    light: "System mode",
    system: "Dark mode",
  };

  const Icon = icons[theme];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={handleToggle}>
          <Icon className="h-4 w-4" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{labels[theme]}</TooltipContent>
    </Tooltip>
  );
}
