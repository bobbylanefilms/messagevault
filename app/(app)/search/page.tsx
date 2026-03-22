// ABOUTME: Search page — hybrid keyword + semantic search across all conversations.
// ABOUTME: Search input with debounce, mode toggle, filter bar, and click-through result cards.

"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { SearchModeToggle } from "@/components/search/search-mode-toggle";
import { SearchFilterBar } from "@/components/search/search-filter-bar";
import { SearchResults } from "@/components/search/search-results";
import { useSearchStore } from "@/lib/stores/use-search-store";
import type { Id } from "@/convex/_generated/dataModel";

type SearchMode = "keyword" | "semantic" | "hybrid";

export default function SearchPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    query,
    mode,
    filters,
    results,
    totalCount,
    conversationCounts,
    isSearching,
    hasSearched,
    setQuery,
    setMode,
    setFilter,
    clearFilters,
    setResults,
    setIsSearching,
  } = useSearchStore();

  const hybridSearch = useAction(api.search.hybridSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Sync URL params -> store on mount ---
  useEffect(() => {
    const q = searchParams.get("q");
    const m = searchParams.get("mode") as SearchMode | null;
    const conv = searchParams.get("conversationId");
    const part = searchParams.get("participantId");

    if (q) setQuery(q);
    if (m && ["keyword", "semantic", "hybrid"].includes(m)) setMode(m);
    if (conv) setFilter("conversationId", conv);
    if (part) setFilter("participantId", part);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Sync store -> URL params ---
  const syncUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (mode !== "hybrid") params.set("mode", mode);
    if (filters.conversationId) params.set("conversationId", filters.conversationId);
    if (filters.participantId) params.set("participantId", filters.participantId);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [query, mode, filters.conversationId, filters.participantId, pathname, router]);

  // --- Execute search ---
  const executeSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([], 0, {});
      return;
    }

    setIsSearching(true);
    try {
      const response = await hybridSearch({
        searchQuery: trimmed,
        mode,
        conversationId: filters.conversationId
          ? (filters.conversationId as Id<"conversations">)
          : undefined,
        participantId: filters.participantId
          ? (filters.participantId as Id<"participants">)
          : undefined,
        dateRangeStart: filters.dateRangeStart ?? undefined,
        dateRangeEnd: filters.dateRangeEnd ?? undefined,
        limit: 50,
      });

      // Post-filter by message type on the client (not supported by backend)
      let filtered = response.results;
      if (filters.messageType) {
        filtered = filtered.filter((r: any) => r.messageType === filters.messageType);
      }

      setResults(filtered, response.totalCount, response.conversationCounts);
    } catch (error) {
      console.error("Search failed:", error);
      setResults([], 0, {});
    } finally {
      setIsSearching(false);
    }
  }, [query, mode, filters, hybridSearch, setResults, setIsSearching]);

  // --- Debounced search trigger ---
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      syncUrl();
      return;
    }

    debounceRef.current = setTimeout(() => {
      executeSearch();
      syncUrl();
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, mode, filters, executeSearch, syncUrl]);

  // --- Handlers ---
  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
  }

  function handleClearQuery() {
    setQuery("");
    setResults([], 0, {});
    inputRef.current?.focus();
  }

  function handleModeChange(newMode: SearchMode) {
    setMode(newMode);
  }

  function handleClearAllFilters() {
    clearFilters();
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Search" description="Find messages across all conversations" />

      <div className="border-b border-border px-6 py-4 space-y-3">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search your messages..."
            value={query}
            onChange={handleQueryChange}
            className="h-11 pl-10 pr-10 text-sm"
            autoFocus
          />
          {query && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 p-0"
              onClick={handleClearQuery}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Mode toggle + filters row */}
        <div className="flex flex-wrap items-center gap-3">
          <SearchModeToggle value={mode} onChange={handleModeChange} />
          <div className="h-5 w-px bg-border" />
          <SearchFilterBar
            conversationId={filters.conversationId}
            participantId={filters.participantId}
            dateRangeStart={filters.dateRangeStart}
            dateRangeEnd={filters.dateRangeEnd}
            messageType={filters.messageType}
            onConversationChange={(id) => setFilter("conversationId", id)}
            onParticipantChange={(id) => setFilter("participantId", id)}
            onDateRangeChange={(start, end) => {
              setFilter("dateRangeStart", start);
              setFilter("dateRangeEnd", end);
            }}
            onMessageTypeChange={(type) => setFilter("messageType", type as any)}
            onClearAll={handleClearAllFilters}
          />
        </div>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto">
        <SearchResults
          results={results}
          totalCount={totalCount}
          conversationCounts={conversationCounts}
          searchQuery={query}
          isSearching={isSearching}
          hasSearched={hasSearched}
        />
      </div>
    </div>
  );
}
