# Scenarios: Search
**Stage:** 5
**Features Covered:** E1, E2, E3, E4
**Prerequisites:** Stages 1-3 complete. Multiple conversations imported with completed embeddings (Stage 2, B5). Browse view functional (for click-through navigation). At least 1,000+ messages with embeddings for semantic search to be meaningful.

---

## Scenario 1: Keyword Search Returns Exact Matches
**Feature:** E1. Keyword Search, E4. Search UI
**Type:** Happy Path

**Given:** An authenticated user on the `/search` page with imported conversations
**When:** The user types a keyword that appears in known messages and submits the search
**Then:**
- Search results appear showing messages containing the keyword
- The matching keyword is highlighted within each result's message text
- Each result shows the sender name, date/time, and conversation context
- The result count is displayed (e.g., "Found 12 results")
- Results are ranked by relevance

**Verification Steps:**
1. Navigate to `/search`
2. Type a specific word known to appear in imported messages (e.g., a person's name, a place, an event)
3. Wait for results to appear (after debounce)
4. Confirm results contain the searched keyword
5. Confirm the keyword is visually highlighted in the result text
6. Confirm sender name and timestamp are shown for each result
7. Note the result count
8. Screenshot the search results

**Notes:** Use a keyword you know exists in the imported data. If no results appear for a known keyword, that is a FAIL.

---

## Scenario 2: Semantic Search Finds Conceptually Related Messages
**Feature:** E2. Semantic Search, E4. Search UI
**Type:** Happy Path

**Given:** An authenticated user on the search page with search mode set to "Semantic"
**When:** The user searches for a concept using natural language that may not appear as exact words in messages
**Then:**
- Results appear that are conceptually related to the query
- Results may not contain the exact query words but discuss the same topic
- Results include similarity-based ranking (most relevant first)
- The results feel semantically meaningful, not random

**Verification Steps:**
1. Switch the search mode to "Semantic" (or equivalent toggle)
2. Enter a natural language query like "conversations about vacation plans" or "discussions about food" or "when someone was feeling sick"
3. Review the results — confirm they are topically related to the query
4. Verify that results include messages that discuss the topic even without using the exact query words
5. Compare with a keyword search for the same query — semantic should surface different (broader) results
6. Screenshot semantic search results

**Notes:** Semantic search quality depends on embedding quality. If results are random or irrelevant, that is a FAIL. If results are somewhat related but not precisely on topic, that is a PARTIAL PASS. Embeddings must be complete (B5) for this to work.

---

## Scenario 3: Hybrid Search Merges Results from Both Methods
**Feature:** E3. Hybrid Search and Result Merging, E4. Search UI
**Type:** Happy Path

**Given:** An authenticated user on the search page with search mode set to "Hybrid" (the default)
**When:** The user performs a search
**Then:**
- Results combine both keyword matches and semantically similar messages
- Results are ranked by a merged score (RRF fusion)
- Messages that match both keyword and semantic criteria rank highest
- The result set is richer than either keyword or semantic search alone
- No duplicate results appear

**Verification Steps:**
1. Confirm "Hybrid" is the default search mode
2. Enter a search query that should produce both keyword and semantic matches
3. Review the results — confirm a mix of exact matches and conceptually related results
4. Note the result order — exact keyword matches combined with semantic matches should appear
5. Check for duplicates — the same message should not appear twice
6. Compare result count with keyword-only and semantic-only searches for the same query

**Notes:** RRF merging with k=60 should produce a well-blended ranking. If results appear to be only keyword or only semantic, the fusion may not be working.

---

## Scenario 4: Search Mode Toggle Switches Between Modes
**Feature:** E4. Search UI
**Type:** Happy Path

**Given:** An authenticated user on the search page
**When:** The user toggles between Keyword, Semantic, and Hybrid search modes
**Then:**
- A segmented control or toggle with three options is visible
- Switching modes re-executes the current search query with the new mode
- Results change based on the selected mode
- The selected mode is visually indicated

**Verification Steps:**
1. Enter a search query in Hybrid mode and note the results
2. Switch to Keyword mode — confirm results change (may be fewer but more precise)
3. Switch to Semantic mode — confirm results change again (may be broader but conceptually related)
4. Switch back to Hybrid — confirm original results return
5. Screenshot each mode's results for the same query

**Notes:** If the toggle doesn't exist or doesn't change results, that is a FAIL.

---

## Scenario 5: Conversation Filter Narrows Results
**Feature:** E4. Search UI
**Type:** Happy Path

**Given:** An authenticated user performing a search with multiple conversations imported
**When:** The user applies a conversation filter
**Then:**
- A conversation filter dropdown/selector is available in the filter bar
- Selecting a specific conversation limits search results to messages in that conversation
- The result count updates to reflect the filtered scope
- Clearing the filter returns to all-conversation results

**Verification Steps:**
1. Perform a search that returns results from multiple conversations
2. Note the total result count
3. Apply a conversation filter selecting one specific conversation
4. Confirm the results now only show messages from that conversation
5. Confirm the result count decreased
6. Clear the filter — confirm the full result set returns

**Notes:** The conversation filter should work with all three search modes.

---

## Scenario 6: Participant Filter Narrows Results
**Feature:** E4. Search UI
**Type:** Happy Path

**Given:** An authenticated user performing a search
**When:** The user applies a participant filter
**Then:**
- A participant filter is available in the filter bar
- Selecting a participant limits results to messages sent by that person
- Results only show messages from the selected participant

**Verification Steps:**
1. Perform a search that returns results from multiple participants
2. Apply a participant filter selecting one person
3. Confirm all results are messages sent by that participant
4. Clear the filter — confirm unfiltered results return

**Notes:** Verify the participant filter works correctly by checking the sender name on each result.

---

## Scenario 7: Date Range Filter Narrows Results
**Feature:** E4. Search UI
**Type:** Happy Path

**Given:** An authenticated user performing a search
**When:** The user applies a date range filter
**Then:**
- A date range picker is available in the filter bar
- Selecting a start and end date limits results to messages within that range
- Messages outside the date range do not appear in results
- The result count updates accordingly

**Verification Steps:**
1. Perform a search with no date filter — note the results and their dates
2. Apply a date range filter covering a specific month or time period
3. Confirm all results fall within the specified date range
4. Confirm no results from outside the range appear
5. Widen the date range — confirm more results appear
6. Clear the date filter — confirm full results return

**Notes:** Date range filtering on semantic search is a post-filter (per spec), so it may not perfectly limit the initial candidate set but should filter the final displayed results.

---

## Scenario 8: Search Results Show Surrounding Context
**Feature:** E3. Hybrid Search and Result Merging, E4. Search UI
**Type:** Happy Path

**Given:** An authenticated user viewing search results
**When:** Results are displayed
**Then:**
- Each result shows not just the matching message but 1-2 messages before and after for context
- Context messages are visually distinguished from the matched message (dimmer, smaller, or different styling)
- The matched message is clearly identifiable within its context
- Context helps the user understand what the conversation was about

**Verification Steps:**
1. Perform a search and view the results
2. Confirm each result includes surrounding context messages
3. Confirm the matched message is visually highlighted or emphasized
4. Confirm context messages use a different visual treatment (lighter, smaller)
5. Verify the context messages are from the same conversation and are chronologically adjacent
6. Screenshot a result with its surrounding context

**Notes:** If results show only the matched message with no context, that is a PARTIAL PASS. Context is important for understanding the significance of the match.

---

## Scenario 9: Click Result Navigates to Browse View
**Feature:** E4. Search UI
**Type:** Cross-Feature

**Given:** An authenticated user viewing search results
**When:** The user clicks on a search result
**Then:**
- The application navigates to `/browse/[conversationId]`
- The thread view scrolls to the matched message
- The matched message is highlighted or visually emphasized in the browse view
- Surrounding messages are visible for context
- The user can continue browsing the conversation from that position

**Verification Steps:**
1. Perform a search and click on a result
2. Confirm navigation to the browse view for the correct conversation
3. Confirm the thread is scrolled to the position of the matched message
4. Confirm the matched message is highlighted or visually distinct
5. Scroll up and down from the highlighted message — confirm normal browsing works
6. Use the browser back button — confirm return to search results

**Notes:** This is the "search-to-browse" interaction pattern described in the spec. If the navigation works but the message is not scrolled to or highlighted, that is a PARTIAL PASS.

---

## Scenario 10: Search with No Results Shows Empty State
**Feature:** E4. Search UI
**Type:** Edge Case

**Given:** An authenticated user on the search page
**When:** The user searches for a term that does not exist in any imported messages
**Then:**
- A clear "no results found" message is displayed
- The empty state may include search suggestions or tips
- No errors or broken layout
- The user can modify their query and search again

**Verification Steps:**
1. Search for a completely unique string that cannot exist in messages (e.g., "xyzzy12345abcde")
2. Confirm a "no results" message appears
3. Confirm the page layout is not broken
4. Modify the query to something that should match — confirm results now appear

**Notes:** The empty state should be helpful, not just blank.

---

## Scenario 11: Search Debounce Prevents Excessive Requests
**Feature:** E4. Search UI
**Type:** Performance

**Given:** An authenticated user on the search page
**When:** The user types a query quickly (character by character)
**Then:**
- The search does not execute on every keystroke
- Results appear after the user pauses typing (approximately 300ms debounce)
- No visible flickering of results during typing
- The final results match the complete query, not an intermediate partial query

**Verification Steps:**
1. Open browser DevTools Network tab
2. Type a multi-word query quickly
3. Observe that search requests are not fired for every character
4. Confirm results appear after a brief pause in typing
5. Confirm the displayed results match the full query text

**Notes:** The spec specifies a 300ms debounce. The exact timing doesn't need to be measured precisely, but there should be a visible delay between stopping typing and results appearing, and no flood of intermediate requests.

---

## Scenario 12: Search Result Count and Distribution Stats
**Feature:** E4. Search UI
**Type:** Happy Path

**Given:** An authenticated user performing a search
**When:** Results are displayed
**Then:**
- A result count is shown (e.g., "Found 47 results")
- Distribution stats are shown (e.g., "in 12 conversations")
- The stats update when filters are applied
- The stats are accurate (result count matches the actual number of displayed results)

**Verification Steps:**
1. Perform a search with results
2. Locate the result count display
3. Confirm the count is visible and reads as a clear number
4. If distribution stats are shown (results per conversation), verify they appear reasonable
5. Apply a filter — confirm the stats update
6. Count the actual displayed results — confirm they match the stated count (at least approximately)

**Notes:** Distribution stats ("in X conversations") are a nice-to-have per the spec. The result count itself is essential.

---
