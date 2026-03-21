# Scenarios: Browse & Conversations
**Stage:** 3
**Features Covered:** C1, C2, C3, C4
**Prerequisites:** Stages 1-2 complete. At least two conversations imported (one with 1,000+ messages, ideally one with 10K+). At least one conversation should contain reactions. Ideally one group chat (3+ participants) is imported.

---

## Scenario 1: Conversation List Populates Sidebar
**Feature:** C1. Conversation List and Sidebar
**Type:** Happy Path

**Given:** An authenticated user with multiple imported conversations
**When:** The user views the sidebar
**Then:**
- All imported conversations appear in the sidebar under a "MESSAGES" section
- Each conversation shows: participant name(s), message count, and a date indicator (date range or last activity)
- Group chats are visually distinguishable from 1:1 chats
- Conversations are sorted by most recent activity
- The list is scrollable if there are many conversations

**Verification Steps:**
1. Confirm the sidebar "MESSAGES" section contains all imported conversations
2. Verify each conversation entry shows participant names and message count
3. Confirm group chats (if imported) show multiple participant names or a group indicator
4. Verify the sort order matches most-recent-activity-first
5. Screenshot the conversation list

**Notes:** The conversation title typically comes from the file header (e.g., "Messages with Rob Sawyer"). Verify the title is human-readable, not a filename.

---

## Scenario 2: Clicking a Conversation Opens the Thread View
**Feature:** C1. Conversation List and Sidebar
**Type:** Happy Path

**Given:** An authenticated user viewing the conversation list
**When:** The user clicks a conversation in the sidebar
**Then:**
- The URL changes to `/browse/[conversationId]`
- The main content area shows the message thread for that conversation
- The clicked conversation is highlighted in the sidebar
- The thread view loads without errors

**Verification Steps:**
1. Click a conversation in the sidebar
2. Confirm the URL includes a conversation ID
3. Confirm messages appear in the main content area
4. Confirm the sidebar highlights the active conversation
5. Click a different conversation and confirm the view switches

**Notes:** Switching between conversations should feel smooth — no full page reloads.

---

## Scenario 3: Browse Route Redirects to Most Recent Conversation
**Feature:** C1. Conversation List and Sidebar
**Type:** Edge Case

**Given:** An authenticated user with imported conversations
**When:** The user navigates directly to `/browse` (no conversation ID)
**Then:**
- The user is redirected to `/browse/[conversationId]` for the most recently active conversation
- The redirect happens automatically without user intervention
- The corresponding conversation is highlighted in the sidebar

**Verification Steps:**
1. Navigate directly to `/browse`
2. Confirm an automatic redirect to a specific conversation
3. Confirm the redirected conversation is the most recently active one
4. Confirm the sidebar highlights the correct conversation

**Notes:** If no conversations exist, `/browse` should show an empty state — not a broken page.

---

## Scenario 4: iMessage-Style Message Bubbles Render Correctly
**Feature:** C2. Message Thread View with Virtualized Scrolling
**Type:** Happy Path

**Given:** An authenticated user viewing a conversation thread
**When:** The message thread renders
**Then:**
- Messages from "me" (the importing user) are right-aligned with a blue background
- Messages from other participants are left-aligned with a gray background (or their assigned color)
- Message bubbles have rounded corners and appropriate padding
- Message text is readable against the bubble background
- Each bubble shows the message content

**Verification Steps:**
1. Open a conversation with messages from at least two participants
2. Confirm "me" messages are right-aligned with a distinct color (blue per spec)
3. Confirm other participant messages are left-aligned with a different color
4. Verify bubble styling: rounded corners, padding, max-width constraints
5. Verify text readability on both light and dark bubble backgrounds
6. Screenshot a section showing both sent and received messages

**Notes:** The spec says iMessage-inspired: right-aligned blue (me), left-aligned gray (others). In group chats, different participants should use different colors from the palette.

---

## Scenario 5: Consecutive Same-Sender Messages Group Properly
**Feature:** C2. Message Thread View with Virtualized Scrolling
**Type:** Happy Path

**Given:** A conversation with multiple consecutive messages from the same sender sent within 2 minutes of each other
**When:** The thread view renders those messages
**Then:**
- The sender name is shown only on the first message of the group
- Subsequent messages have tighter vertical spacing (no repeated name/avatar)
- When a different sender's message appears, the full bubble format resumes (with sender name)
- Messages more than 2 minutes apart from the same sender also show the sender name again

**Verification Steps:**
1. Find a section of the conversation with multiple rapid messages from one person
2. Confirm the first message shows the sender name
3. Confirm subsequent messages within the group do NOT repeat the sender name
4. Confirm the spacing between grouped messages is tighter than between different senders
5. Find a gap of >2 minutes between same-sender messages and confirm the name reappears
6. Screenshot a message group

**Notes:** The 2-minute window is per the spec. The exact grouping threshold doesn't need to be precisely 2 minutes, but there should be visible grouping behavior for rapid-fire messages.

---

## Scenario 6: Day Dividers Appear Between Date Boundaries
**Feature:** C2. Message Thread View with Virtualized Scrolling
**Type:** Happy Path

**Given:** A conversation spanning multiple days
**When:** The thread view renders
**Then:**
- Date divider headers appear between messages from different days
- Each divider shows the date in a human-readable format (e.g., "January 15, 2023")
- Dividers are visually distinct from message bubbles (centered, different styling)
- All messages between two dividers belong to the same date

**Verification Steps:**
1. Scroll through a conversation that spans at least 3 different days
2. Confirm date dividers appear at each day boundary
3. Verify the date format is human-readable
4. Confirm dividers are styled as centered pills or banners (not message bubbles)
5. Verify messages are in chronological order within each day section
6. Screenshot a day divider between messages

**Notes:** The spec describes dividers as "centered pills with date text." The exact styling may vary, but they should be clearly distinguishable from messages.

---

## Scenario 7: Virtualized Scrolling Handles Large Conversations
**Feature:** C2. Message Thread View with Virtualized Scrolling
**Type:** Performance

**Given:** A conversation with 10,000+ messages
**When:** The user scrolls through the entire conversation
**Then:**
- The initial load completes without freezing or crashing the browser
- Scrolling feels smooth without visible jank or stutter
- Messages render correctly at all scroll positions (no blank gaps, no missing content)
- The scroll position can be maintained when the user stops scrolling
- Memory usage remains reasonable (the browser tab does not crash)

**Verification Steps:**
1. Open a conversation with 10K+ messages
2. Note the initial load time — should be under 3 seconds
3. Scroll rapidly from bottom to top and back
4. Observe smoothness — no visible jank or white flashes where messages should be
5. Scroll to the middle and stop — confirm messages are fully rendered
6. Scroll to the very top (oldest messages) — confirm they render correctly
7. Scroll back to the bottom — confirm the latest messages are present
8. Check browser memory usage (DevTools > Performance tab) — note any anomalies

**Notes:** The spec requires `@tanstack/react-virtual` for virtualization. Without virtualization, 10K+ messages will likely crash the browser or cause extreme lag — this is a hard FAIL.

---

## Scenario 8: Timestamps Shown on Hover
**Feature:** C2. Message Thread View with Virtualized Scrolling
**Type:** Happy Path

**Given:** A conversation thread is displayed
**When:** The user hovers over a message bubble
**Then:**
- A timestamp appears showing when the message was sent
- The timestamp includes at minimum the time (e.g., "12:03 AM")
- The timestamp is not permanently displayed — it appears only on hover
- The timestamp disappears when the mouse moves away

**Verification Steps:**
1. Hover over a message bubble
2. Confirm a timestamp appears (tooltip, overlay, or inline reveal)
3. Move the mouse away — confirm the timestamp disappears
4. Hover over messages at different times of day — confirm timestamps vary
5. Screenshot a message with its hover timestamp visible

**Notes:** Timestamps should not be permanently displayed — the spec explicitly says "shown on hover." If timestamps are always visible, that's not a failure but a deviation from spec.

---

## Scenario 9: Reactions Display Below Messages
**Feature:** C3. Reactions Display
**Type:** Happy Path

**Given:** A conversation containing messages with reactions
**When:** The thread view renders
**Then:**
- Reaction emoji chips appear below (or near) the message they reference
- Each chip shows the reaction emoji (heart, thumbs up, laughing, etc.)
- Multiple reactions on the same message are grouped
- Hovering over a reaction chip shows who reacted
- Reaction chips are aligned to the same side as the message bubble

**Verification Steps:**
1. Open a conversation known to contain reactions
2. Locate a message with reactions
3. Confirm emoji chips are displayed near the correct message
4. Confirm the emoji matches the reaction type (heart for "loved," thumbs up for "liked," etc.)
5. Hover over a reaction chip — confirm it shows the reactor's name
6. If a message has multiple reactions, confirm they are grouped (not scattered)
7. Screenshot a message with reaction chips

**Notes:** Reactions are resolved during import by matching quoted text. If no reactions are visible on any messages, check whether the import file actually contained reactions. If it did and none display, that is a FAIL.

---

## Scenario 10: Date Jumper Navigates to Correct Position
**Feature:** C4. Date Navigation and Participant Filter
**Type:** Happy Path

**Given:** A conversation spanning many months
**When:** The user uses the date jumper to navigate to a specific day
**Then:**
- A date picker or calendar widget is accessible from the thread toolbar
- Selecting a date scrolls the thread to messages from that day
- The first message from the selected day is visible after the jump
- If no messages exist on the selected day, the thread scrolls to the nearest day with messages
- The scroll position is stable after the jump (no bouncing or re-rendering)

**Verification Steps:**
1. Open a long conversation (spanning several months)
2. Locate the date jumper control in the toolbar area
3. Select a date known to have messages
4. Confirm the thread scrolls to show messages from that date
5. Verify a day divider for the selected date is visible
6. Select a date with no messages — confirm reasonable behavior (nearest day or empty indicator)
7. Screenshot the thread after a date jump

**Notes:** The spec says "Date jumper to navigate to a specific day within a conversation." The exact UI (date picker, calendar popup, text input) is left to implementation.

---

## Scenario 11: Participant Filter in Group Chats
**Feature:** C4. Date Navigation and Participant Filter
**Type:** Happy Path

**Given:** A group chat conversation with 3+ participants
**When:** The user applies a participant filter
**Then:**
- A participant filter control is visible (only for group chats)
- The filter allows selecting one or more participants
- Applying the filter shows only messages from the selected participant(s)
- Day dividers remain visible for context even when messages are filtered
- A clear/reset filter option is available
- A count indicator shows filtered vs. total messages

**Verification Steps:**
1. Open a group chat conversation
2. Locate the participant filter control
3. Select a single participant — confirm only their messages are displayed
4. Select multiple participants — confirm messages from all selected participants appear
5. Confirm day dividers remain visible
6. Clear the filter — confirm all messages reappear
7. Verify a 1:1 conversation does NOT show the participant filter control
8. Screenshot the filtered thread

**Notes:** If no group chats have been imported, this scenario cannot be evaluated. Note it as "Not Evaluated — no group chat data available."

---

## Scenario 12: Browser Back/Forward Navigation
**Feature:** C1. Conversation List and Sidebar
**Type:** Adversarial

**Given:** The user has navigated between multiple conversations
**When:** The user uses browser back/forward buttons
**Then:**
- The back button returns to the previously viewed conversation
- The forward button goes to the conversation the user navigated away from
- The sidebar highlighting updates to match the current conversation
- The URL in the address bar updates correctly
- No broken states or error pages result from back/forward navigation

**Verification Steps:**
1. Navigate to conversation A, then conversation B, then conversation C
2. Click the browser back button — confirm conversation B is displayed
3. Click back again — confirm conversation A is displayed
4. Click forward — confirm conversation B is displayed
5. Confirm the sidebar highlights the correct conversation at each step
6. Confirm the URL changes correctly at each step

**Notes:** Client-side routing should integrate properly with browser history. If back/forward causes a full page reload instead of a smooth transition, that's a PARTIAL PASS.

---
