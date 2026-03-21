# Scenarios: Dashboard & Settings
**Stage:** 7
**Features Covered:** G1, G2, G3, G4
**Prerequisites:** Stages 1-6 complete. Multiple conversations imported with completed embeddings. Calendar heatmap component functional (D1, used as mini heatmap on dashboard). All prior features working.

---

## Scenario 1: Dashboard Stats Are Accurate
**Feature:** G1. Dashboard
**Type:** Happy Path

**Given:** An authenticated user with multiple imported conversations
**When:** The user navigates to `/dashboard`
**Then:**
- Stats cards display: total messages, total conversations, overall date range, and top participants by message count
- The total message count matches the sum of all imported conversations' message counts
- The total conversation count matches the number of imported conversations
- The date range spans from the earliest to the latest message across all conversations
- Top participants are listed by message count (descending)

**Verification Steps:**
1. Navigate to `/dashboard`
2. Locate the stats cards
3. Cross-reference "total messages" against the sum of individual conversation message counts (visible in sidebar or browse view)
4. Cross-reference "total conversations" against the sidebar conversation count
5. Verify the date range makes sense given the imported data
6. Confirm top participants are listed with message counts
7. Screenshot the dashboard stats cards

**Notes:** Accuracy is the key evaluation criterion here. If stats exist but show incorrect numbers, that is a FAIL. If one stat is wrong and others are correct, that is a PARTIAL PASS.

---

## Scenario 2: Dashboard Shows Recent Activity
**Feature:** G1. Dashboard
**Type:** Happy Path

**Given:** An authenticated user with imported conversations
**When:** The user views the dashboard
**Then:**
- A "recent activity" section shows the most recent messages across all conversations
- Each recent message shows the sender, conversation context, and relative timestamp
- At least 3-5 recent messages are displayed
- Messages are from the most recently imported or most recent by timestamp data

**Verification Steps:**
1. View the dashboard
2. Locate the recent activity section
3. Confirm recent messages are displayed with sender and context
4. Verify the messages are genuinely the most recent ones in the archive
5. Screenshot the recent activity section

**Notes:** "Recent" here means the most recent messages by timestamp in the imported data, not necessarily recently imported. Verify by checking the browse view for the latest messages.

---

## Scenario 3: Mini Calendar Heatmap on Dashboard
**Feature:** G1. Dashboard
**Type:** Cross-Feature

**Given:** An authenticated user with imported conversations
**When:** The user views the dashboard
**Then:**
- A mini calendar heatmap is displayed showing the current year's activity
- The mini heatmap shows the same data as the full calendar view (just smaller)
- Clicking the mini heatmap navigates to the full `/calendar` view
- The heatmap cells reflect actual message activity

**Verification Steps:**
1. View the dashboard — locate the mini heatmap
2. Confirm it displays a calendar grid with colored cells
3. Compare cell colors against the full calendar view (navigate to `/calendar` and compare)
4. Click on the mini heatmap or its container
5. Confirm navigation to `/calendar`
6. Screenshot the mini heatmap on the dashboard

**Notes:** The mini heatmap reuses the D1 component at smaller scale. If it looks visually broken at the smaller size, that is a PARTIAL PASS.

---

## Scenario 4: Dashboard Personalization
**Feature:** G1. Dashboard
**Type:** Happy Path

**Given:** An authenticated user with a display name set
**When:** The user views the dashboard
**Then:**
- A personalized greeting appears (e.g., "Welcome back, Rob")
- The greeting uses the user's display name
- The tone is warm and personal (per the spec's design principles)

**Verification Steps:**
1. Confirm the user's display name is set (check Settings if needed)
2. Navigate to the dashboard
3. Confirm a personalized greeting is displayed
4. Verify it uses the correct display name

**Notes:** This is a polish item. If no greeting exists but the dashboard otherwise works, that is a PARTIAL PASS.

---

## Scenario 5: User Preferences Persist Across Sessions
**Feature:** G2. User Preferences
**Type:** Happy Path

**Given:** An authenticated user on the settings page
**When:** The user updates their preferences and reloads the page
**Then:**
- The settings page shows profile settings (display name, real name)
- AI preferences section shows default model and thinking toggle
- Appearance section shows theme preference
- Changing the display name and saving shows success feedback
- Changing the default model and saving persists the choice
- After page refresh, all saved preferences are retained
- The theme toggle applies immediately (live preview)

**Verification Steps:**
1. Navigate to `/settings`
2. Locate the profile, AI preferences, and appearance sections
3. Change the display name and save — confirm success feedback (toast/message)
4. Change the default model preference and save
5. Toggle the theme — confirm immediate visual change
6. Refresh the page (hard reload)
7. Confirm all changes persisted: display name, model, theme
8. Screenshot the settings page

**Notes:** The `realName` field is used for "Me" identity mapping during import. Verify it's editable and its purpose is explained in the UI.

---

## Scenario 6: Participant Manager Lists All Participants
**Feature:** G3. Participant Management
**Type:** Happy Path

**Given:** An authenticated user with imported conversations containing multiple participants
**When:** The user navigates to the participant manager (in Settings)
**Then:**
- All participants across all conversations are listed
- Each participant shows: display name, aliases (if any), conversation count, message count, assigned color
- The list is sortable (by name, message count, etc.)
- The participant marked as "me" is identifiable

**Verification Steps:**
1. Navigate to Settings and find the participant manager section
2. Confirm all known participants are listed
3. Verify each entry shows name, aliases, conversation count, message count, and color
4. Confirm the "me" participant is identifiable
5. Screenshot the participant list

**Notes:** Message counts and conversation counts should be accurate. Cross-reference with what you know from browsing conversations.

---

## Scenario 7: Merge Duplicate Participants
**Feature:** G3. Participant Management
**Type:** Happy Path

**Given:** Two participant records that represent the same person (e.g., "Mom" and "Lisa")
**When:** The user merges them
**Then:**
- The user can select two or more participants to merge
- A merge dialog/flow appears letting the user choose the canonical display name
- A confirmation dialog warns about the irreversibility of the merge
- After merge, only one participant record remains
- The merged record has combined aliases, summed message counts, and recalculated conversation counts
- Messages in the browse view now show the canonical name for the merged participant
- The merged participant uses a single color across all conversations

**Verification Steps:**
1. If duplicate participants exist, select them for merge
2. If no natural duplicates exist, import a second file creating a duplicate scenario (or note inability to test)
3. Initiate the merge — confirm a merge dialog appears
4. Choose the canonical name and confirm
5. Verify the merged participant record: combined aliases, correct counts
6. Navigate to browse view — confirm messages show the canonical name
7. Confirm the participant color is consistent across conversations

**Notes:** If no duplicate participants exist in the test data, this scenario cannot be fully evaluated. Note it as "Not Evaluated — no duplicate participants available" or create a duplicate via a second import.

---

## Scenario 8: Edit Participant Display Name and Color
**Feature:** G3. Participant Management
**Type:** Happy Path

**Given:** An authenticated user viewing the participant manager
**When:** The user edits a participant's display name or color
**Then:**
- Inline editing is supported (click to edit the display name)
- Saving the name change updates the participant record
- A color picker or palette is available for changing the bubble color
- Selecting a new color updates the participant record
- Changes are reflected immediately in the browse view (message bubbles use the new color/name)

**Verification Steps:**
1. Click to edit a participant's display name
2. Change the name and save (press Enter or click save)
3. Confirm the name update in the participant list
4. Change the participant's bubble color
5. Navigate to the browse view and find messages from that participant
6. Confirm the new color is applied to their message bubbles
7. Confirm the new display name appears on their messages

**Notes:** The color palette should offer 10+ distinct colors. Changes should be immediately visible in the browse view without requiring a page refresh.

---

## Scenario 9: Delete Conversation with Cascade
**Feature:** G4. Data Management
**Type:** Happy Path

**Given:** An authenticated user with multiple imported conversations
**When:** The user deletes a conversation
**Then:**
- A delete option is available in data management settings
- A confirmation dialog shows the conversation name and message count
- After confirming, the conversation is removed from the sidebar
- All messages, reactions, and daily stats for that conversation are deleted
- Participant message/conversation counts are updated
- The calendar heatmap no longer shows activity from the deleted conversation
- The deletion is permanent

**Verification Steps:**
1. Note the current conversation count and a specific conversation's message count
2. Navigate to Settings > Data Management
3. Select a conversation to delete
4. Confirm the confirmation dialog shows the conversation name and message count
5. Confirm the deletion
6. Navigate to `/browse` — confirm the conversation is gone from the sidebar
7. Navigate to `/calendar` — confirm the heatmap no longer includes the deleted conversation's activity
8. Check participant message counts — confirm they decreased appropriately
9. Refresh the page — confirm the deletion persisted

**Notes:** Cascade deletion for large conversations may take time. If a progress indicator is shown during deletion, note it. If the deletion leaves orphaned data (messages still searchable, stats still counted), that is a FAIL.

---

## Scenario 10: Storage Usage Display
**Feature:** G4. Data Management
**Type:** Happy Path

**Given:** An authenticated user with imported data
**When:** The user views the storage usage section in data management
**Then:**
- Total messages count is displayed
- Total conversations count is displayed
- Total embeddings count (or percentage complete) is displayed
- Estimated storage usage is shown (if implemented)
- The numbers match actual data in the application

**Verification Steps:**
1. Navigate to Settings > Data Management
2. Locate the storage usage display
3. Confirm total messages count matches the dashboard stats
4. Confirm total conversations count matches the sidebar
5. Note the embeddings count or status
6. Screenshot the storage usage display

**Notes:** The import history should also be visible in this area, showing past imports with date, filename, message count, and status.

---
