# Scenarios: Calendar Visualization
**Stage:** 4
**Features Covered:** D1, D2, D3
**Prerequisites:** Stages 1-3 complete. At least two conversations imported spanning multiple years if possible. Daily stats computed during import (part of Stage 2 pipeline). Browse view functional.

---

## Scenario 1: Heatmap Renders a Full Year
**Feature:** D1. Calendar Heatmap Component
**Type:** Happy Path

**Given:** An authenticated user with imported conversations that span at least one full year
**When:** The user navigates to `/calendar`
**Then:**
- A GitHub-contribution-style heatmap grid is displayed
- The grid shows a full year (52 columns x 7 rows)
- Month labels appear along the top of the grid
- Day-of-week labels appear along the left side
- Cells with message activity are colored with varying intensity
- Cells with no activity are a neutral/empty color
- A color legend explains the intensity levels
- The current year (or a year with data) is selected by default

**Verification Steps:**
1. Navigate to `/calendar`
2. Confirm the heatmap grid renders with the expected dimensions
3. Verify month labels along the top (Jan, Feb, ... Dec)
4. Verify day-of-week labels along the left
5. Confirm cells with known message activity are colored
6. Confirm cells with no activity are visually distinct (empty/neutral)
7. Locate and confirm the color legend
8. Screenshot the full heatmap

**Notes:** The grid should render quickly — the spec uses pre-aggregated daily stats (O(365) query per year). If the heatmap is slow to render, note the performance.

---

## Scenario 2: Color Intensity Levels Are Correct
**Feature:** D1. Calendar Heatmap Component
**Type:** Happy Path

**Given:** A heatmap displayed with varying daily message counts
**When:** The user inspects cells of different activity levels
**Then:**
- 5 distinct color intensity levels are visible (including the empty/zero level)
- Level 0: 0 messages (neutral/empty)
- Level 1: 1-5 messages (lightest color)
- Level 2: 6-20 messages (light-medium)
- Level 3: 21-50 messages (medium-dark)
- Level 4: 51+ messages (darkest color)
- The intensity levels visually make sense (more messages = darker/more saturated)

**Verification Steps:**
1. View the heatmap for a year with varied activity
2. Hover over cells at different intensity levels — note the message counts
3. Verify that the color intensity corresponds to the message count range
4. Confirm at least 3 different intensity levels are distinguishable
5. Compare the legend colors against the actual cell colors
6. Screenshot cells at different intensity levels with their tooltips

**Notes:** The exact color palette may differ from the spec's green-shade suggestion (especially in dark mode). What matters is that intensity levels are distinguishable and correctly mapped to count ranges.

---

## Scenario 3: Hover Tooltips Show Date and Count
**Feature:** D1. Calendar Heatmap Component
**Type:** Happy Path

**Given:** A heatmap is displayed
**When:** The user hovers over a cell
**Then:**
- A tooltip appears showing the date (e.g., "January 15, 2023")
- The tooltip shows the total message count for that day
- The tooltip shows active participants (names of people who sent messages that day)
- The tooltip disappears when the mouse moves away

**Verification Steps:**
1. Hover over a colored (non-empty) cell
2. Confirm a tooltip appears with date and message count
3. Confirm participant names are listed in the tooltip
4. Move the mouse away — confirm tooltip disappears
5. Hover over an empty cell — confirm it shows "0 messages" or similar
6. Screenshot a tooltip on an active day

**Notes:** If tooltips are missing entirely, that is a FAIL. If tooltips show date and count but not participants, that is a PARTIAL PASS.

---

## Scenario 4: Year Selector Switches Between Years
**Feature:** D1. Calendar Heatmap Component
**Type:** Happy Path

**Given:** Imported conversations spanning multiple years
**When:** The user changes the selected year
**Then:**
- A year selector control is visible (dropdown, arrows, or tabs)
- Selecting a different year re-renders the heatmap with that year's data
- The color intensities update to reflect the selected year's activity
- Years with no data show an empty heatmap (all cells neutral)
- The year selector shows which years have data

**Verification Steps:**
1. Identify the year selector control
2. Switch to a different year that has message data
3. Confirm the heatmap updates with different colored cells
4. Switch to a year with no data (if available) — confirm empty heatmap
5. Switch back to the original year — confirm data returns
6. Screenshot heatmaps for two different years

**Notes:** If data only spans one year, this scenario is limited to verifying the selector exists and works for that one year.

---

## Scenario 5: Conversation Filter Updates Heatmap
**Feature:** D2. Calendar Filters
**Type:** Happy Path

**Given:** An authenticated user with multiple imported conversations viewing the heatmap
**When:** The user applies a conversation filter
**Then:**
- A conversation filter dropdown is visible above or near the heatmap
- The dropdown lists all imported conversations
- Selecting a specific conversation re-renders the heatmap showing only that conversation's activity
- The intensity levels recalculate based on the filtered data
- The "all conversations" option shows combined activity (default)

**Verification Steps:**
1. View the heatmap with "all conversations" selected (default)
2. Note the activity pattern and intensity levels
3. Select a specific conversation from the filter
4. Confirm the heatmap changes — some cells may become empty, intensities may change
5. Hover over a filtered cell — confirm the count reflects only the selected conversation
6. Select "all" again — confirm the original view returns
7. Screenshot the heatmap before and after filtering

**Notes:** The filtering uses the `conversationBreakdown` array in the `dailyStats` records — it should be instant (no database re-query needed).

---

## Scenario 6: Participant Filter Updates Heatmap
**Feature:** D2. Calendar Filters
**Type:** Happy Path

**Given:** An authenticated user with imported conversations viewing the heatmap
**When:** The user applies a participant filter
**Then:**
- A participant filter dropdown is visible
- The dropdown lists all participants
- Selecting a participant re-renders the heatmap showing only days where that person sent messages
- Multiple participants can be selected (if supported)
- Intensity levels reflect the filtered participant's message counts

**Verification Steps:**
1. View the unfiltered heatmap
2. Select a specific participant from the filter
3. Confirm the heatmap updates to show only that participant's activity days
4. Hover over cells to confirm counts match the selected participant
5. Clear the filter — confirm the full heatmap returns
6. Screenshot the filtered view

**Notes:** Participant filtering uses `participantBreakdown` in `dailyStats`. If both conversation and participant filters can be applied simultaneously, test that combination.

---

## Scenario 7: Click Cell Navigates to Day Detail
**Feature:** D3. Calendar Day Detail View
**Type:** Happy Path

**Given:** A heatmap is displayed with colored (active) cells
**When:** The user clicks on a colored cell
**Then:**
- The application navigates to `/calendar/[dateKey]`
- The day detail view shows all messages from that date
- Messages are grouped by conversation with conversation title banners
- A message count header shows the total for the day (e.g., "42 messages on January 15, 2023")
- Messages are displayed chronologically within each conversation group

**Verification Steps:**
1. Click on a colored cell in the heatmap
2. Confirm navigation to a day detail URL containing the date
3. Confirm the page shows messages grouped by conversation
4. Verify the conversation title banners separate message groups
5. Verify the message count header matches the tooltip count from the heatmap
6. Confirm messages are in chronological order
7. Screenshot the day detail view

**Notes:** The day detail view should reuse message bubble components from the browse view (C2). Message styling should be consistent.

---

## Scenario 8: Day Detail Previous/Next Navigation
**Feature:** D3. Calendar Day Detail View
**Type:** Happy Path

**Given:** The user is on a day detail view
**When:** The user clicks previous/next day navigation arrows
**Then:**
- Previous arrow navigates to the nearest previous day that has messages (skipping empty days)
- Next arrow navigates to the nearest next day that has messages
- The message count and content update for each day
- Navigation arrows are disabled or hidden at the boundaries (first/last day with data)

**Verification Steps:**
1. Navigate to a day detail view for a day in the middle of the date range
2. Click the "next day" arrow — confirm it goes to the next day WITH messages
3. Confirm the displayed date and message count update
4. Click the "previous day" arrow — confirm it goes back
5. Navigate to the earliest day with data — confirm the "previous" arrow is disabled or absent
6. Navigate to the latest day — confirm the "next" arrow is disabled or absent

**Notes:** Empty days should be skipped — clicking "next" should not show a blank day detail page.

---

## Scenario 9: Day Detail Shows Messages from Multiple Conversations
**Feature:** D3. Calendar Day Detail View
**Type:** Cross-Feature

**Given:** A day that has messages in two or more imported conversations
**When:** The user views the day detail for that date
**Then:**
- Messages from all conversations on that day are displayed
- Each conversation's messages are grouped under a conversation title banner
- The total message count header reflects messages from all conversations combined
- Clicking a message (if supported) navigates to its position in the browse view

**Verification Steps:**
1. Identify a date that has messages in at least two conversations (check heatmap tooltip)
2. Click that cell to open the day detail
3. Confirm messages from multiple conversations appear
4. Confirm conversation title banners separate the groups
5. Verify the total count matches the sum of per-conversation counts
6. If click-to-browse is supported, click a message and confirm navigation to the browse view

**Notes:** If all imported conversations are with the same participant, this scenario may be difficult to test. Use heatmap tooltips to identify multi-conversation days.

---

## Scenario 10: Empty Day and Empty Year States
**Feature:** D1. Calendar Heatmap Component, D3. Calendar Day Detail View
**Type:** Edge Case

**Given:** A user viewing the calendar
**When:** The user encounters days or years with no message data
**Then:**
- Clicking an empty (no-message) cell either shows a "No messages on this day" state or does nothing (no navigation)
- Selecting a year with no imported data shows an empty heatmap with all cells in the neutral state
- No errors or broken pages result from interacting with empty states
- Back-to-heatmap navigation is available from the day detail view

**Verification Steps:**
1. Click on an empty (neutral-colored) cell in the heatmap
2. If navigation occurs, confirm a "no messages" empty state is shown (not a broken page)
3. If no navigation occurs, confirm the click is simply ignored
4. If possible, select a year with no data — confirm the heatmap shows empty
5. From a day detail view, confirm navigation back to the heatmap is available (back button, breadcrumb, or link)

**Notes:** The spec doesn't explicitly state what happens when clicking empty cells. Either behavior (navigate to empty state, or no-op) is acceptable — what matters is no crashes.

---
