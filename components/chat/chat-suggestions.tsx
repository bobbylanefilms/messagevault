// ABOUTME: Suggestion cards for empty chat state — dynamically populated with user's data.
// ABOUTME: Shows 4 clickable prompts using real participant names and years from the archive.

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Bot, User, Calendar, Search, Laugh } from "lucide-react";

interface ChatSuggestionsProps {
  onSuggestionClick: (text: string) => void;
}

export function ChatSuggestions({ onSuggestionClick }: ChatSuggestionsProps) {
  const conversations = useQuery(api.conversations.list);
  const participants = useQuery(api.participants.list);

  // Find the most active non-me participant
  const topParticipant = participants
    ?.filter((p: any) => !p.isMe)
    .sort((a: any, b: any) => b.messageCount - a.messageCount)[0];

  // Find the most recent year with data
  const recentYear = conversations?.[0]?.dateRange?.end
    ? new Date(conversations[0].dateRange.end).getFullYear()
    : new Date().getFullYear();

  const suggestions = [
    {
      icon: User,
      text: topParticipant
        ? `Summarize my conversations with ${topParticipant.displayName}`
        : "Summarize my most active conversation",
      hint: "Explore your most active conversation",
    },
    {
      icon: Calendar,
      text: `What were the major events we discussed in ${recentYear}?`,
      hint: "Review highlights from the year",
    },
    {
      icon: Search,
      text: "Find conversations about family plans",
      hint: "Search for a topic across all messages",
    },
    {
      icon: Laugh,
      text: "What's the funniest exchange in my messages?",
      hint: "Discover memorable moments",
    },
  ];

  return (
    <div className="mx-auto max-w-lg px-4">
      <div className="flex flex-col items-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <h3 className="mt-4 text-lg font-medium">What would you like to know?</h3>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {suggestions.map((suggestion) => {
          const Icon = suggestion.icon;
          return (
            <button
              key={suggestion.text}
              onClick={() => onSuggestionClick(suggestion.text)}
              className="rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-card/80"
            >
              <Icon className="h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-sm text-foreground">{suggestion.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">{suggestion.hint}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
