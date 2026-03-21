# Scenarios: Import Pipeline
**Stage:** 2
**Features Covered:** B1, B2, B3, B4, B5
**Prerequisites:** Stage 1 complete. Authenticated user. At least one Apple Messages markdown export file available for testing. Ideally have multiple export files: one small (a few hundred messages), one large (10K+ messages), and one with group chat content (3+ participants). Voyage AI API key configured in Convex environment variables.

---

## Scenario 1: File Upload via Drag-and-Drop
**Feature:** B1. File Upload and Header Scanning
**Type:** Happy Path

**Given:** An authenticated user on the `/import` page
**When:** The user drags and drops a valid `.md` file onto the upload zone
**Then:**
- The drop zone visually indicates it is receiving a file (highlight, border change)
- The file is accepted and read client-side
- Extracted metadata is displayed: conversation title, participant names, and any other header information
- No upload to server happens yet — this is client-side scanning
- The UI advances to the next step (identity resolution)

**Verification Steps:**
1. Navigate to `/import`
2. Confirm a visually prominent drop zone is displayed with instructions
3. Drag a valid `.md` export file onto the drop zone
4. Confirm the drop zone reacts visually during drag-over
5. After drop, confirm extracted metadata appears (conversation title, participant list)
6. Screenshot the metadata display

**Notes:** The file picker button should also work as an alternative to drag-and-drop. Test both methods.

---

## Scenario 2: File Upload via File Picker
**Feature:** B1. File Upload and Header Scanning
**Type:** Happy Path

**Given:** An authenticated user on the `/import` page
**When:** The user clicks the file picker button and selects a valid `.md` or `.txt` file
**Then:**
- The file is accepted and processed identically to drag-and-drop
- Extracted metadata is displayed
- The UI advances to identity resolution

**Verification Steps:**
1. Navigate to `/import`
2. Click the file picker button (or the drop zone if it doubles as a picker trigger)
3. Select a valid export file
4. Confirm the same metadata extraction and display as drag-and-drop

**Notes:** Both `.md` and `.txt` extensions should be accepted.

---

## Scenario 3: Invalid File Rejection
**Feature:** B1. File Upload and Header Scanning
**Type:** Error Handling

**Given:** An authenticated user on the `/import` page
**When:** The user attempts to upload an invalid file (e.g., a `.pdf`, `.jpg`, or an empty file)
**Then:**
- The file is rejected with a clear error message
- The error message explains what file types are accepted
- The UI remains on the import page and the user can try again
- No import job is created in the database

**Verification Steps:**
1. Attempt to upload a `.pdf` file — confirm rejection with helpful error message
2. Attempt to upload an empty `.md` file — confirm appropriate handling
3. Attempt to upload a very small file that doesn't match the expected format — confirm handling
4. Confirm the import page remains functional after each rejection

**Notes:** Graceful handling means no console errors visible to the user, no page crashes, and clear guidance on what to do instead.

---

## Scenario 4: Identity Resolution — Mapping "Me"
**Feature:** B2. Identity Resolution UI
**Type:** Happy Path

**Given:** A user has uploaded a file and metadata has been extracted, showing participant names
**When:** The identity resolution UI appears
**Then:**
- A "Who is Me?" prompt is displayed, asking the user to identify themselves
- The prompt is pre-filled with the user's `realName` from their profile (if set)
- The user can select or type their real name
- All other extracted participant names are listed
- Confirming the mapping proceeds to the parsing step

**Verification Steps:**
1. Upload a valid export file
2. Confirm the identity resolution step appears after metadata extraction
3. Confirm "Me" mapping prompt is visible and functional
4. Select or enter a name for "Me"
5. Confirm all other participants are listed with options to create new or match existing
6. Screenshot the identity resolution UI

**Notes:** For the first import (no existing participants), all participants should default to "create new." For subsequent imports, the system should suggest matches against existing participants.

---

## Scenario 5: Identity Resolution — Matching Existing Participants
**Feature:** B2. Identity Resolution UI
**Type:** Cross-Feature

**Given:** The user has previously imported at least one conversation, and is now importing a second file that shares some participant names
**When:** The identity resolution UI appears for the second import
**Then:**
- Previously imported participants are suggested as matches for names in the new file
- The user can accept suggested matches or create new participants
- Matched participants reuse the existing participant record (same ID, same color)
- New participants get fresh records with new colors
- Aliases are recorded when a name differs from the canonical display name

**Verification Steps:**
1. Import a first file successfully (complete the full pipeline)
2. Start importing a second file that has at least one overlapping participant name
3. Confirm the identity resolution step shows match suggestions for known participants
4. Accept a match and create a new participant for an unmatched name
5. Complete the import
6. Navigate to the browse view and confirm the matched participant uses the same color in both conversations
7. Navigate to Settings > Participants and confirm aliases are recorded

**Notes:** This tests the cross-import participant deduplication, which is critical for the archive's integrity.

---

## Scenario 6: Import Progress Shows Real-Time Updates
**Feature:** B4. Batched Import Pipeline
**Type:** Happy Path

**Given:** The user has completed identity resolution and the import is starting
**When:** The server-side parsing pipeline begins processing the file
**Then:**
- A progress indicator is visible showing the current pipeline stage
- The parsed message count updates in real time as batches complete
- The status transitions through identifiable stages (uploading, parsing, embedding)
- The progress does not stall or appear frozen during batch processing

**Verification Steps:**
1. Upload a file with 1,000+ messages
2. After identity resolution, observe the progress indicator
3. Confirm the message count or progress bar updates incrementally
4. Confirm the stage label changes as the pipeline progresses (e.g., "Parsing..." then "Generating embeddings...")
5. Screenshot the progress indicator at multiple points during import

**Notes:** Real-time updates rely on Convex reactive queries against the `importJobs` table. If the progress appears to jump from 0% to 100%, the reactive subscription may not be working.

---

## Scenario 7: Large File Import Completes Without Timeout
**Feature:** B4. Batched Import Pipeline
**Type:** Performance

**Given:** An authenticated user with a large export file (10,000+ messages, 50K+ lines)
**When:** The user imports the file through the full pipeline
**Then:**
- The parsing phase completes without errors or timeouts
- All messages from the file are accounted for (parsed count matches the file's reported total)
- The conversation appears in the sidebar with the correct message count
- The import job reaches "completed" status (or "embedding" if embeddings are still generating)
- The entire parsing process completes within a reasonable time (under 5 minutes for 15K messages)

**Verification Steps:**
1. Upload the large export file
2. Complete identity resolution
3. Monitor the progress indicator through completion
4. Note the total parsing time
5. Compare the reported message count against the file's header metadata
6. Navigate to the conversation in the browse view and confirm messages are present
7. Check the import history (if visible) for final status

**Notes:** The spec requires handling 51K+ line files. Batched scheduling with ~2,000 messages per action should prevent Convex timeout. If the import fails with a timeout error, that is a FAIL.

---

## Scenario 8: Browsing Available Immediately After Parsing
**Feature:** B4. Batched Import Pipeline, B5. Background Embedding Generation
**Type:** Cross-Feature

**Given:** A file has been imported and parsing has completed, but embedding generation is still in progress
**When:** The user navigates to browse the newly imported conversation
**Then:**
- The conversation appears in the sidebar
- Clicking the conversation shows messages in the thread view
- Messages are scrollable and readable
- The import status may still show "embedding" — this is expected
- Search and AI chat features may not yet work for this conversation (embeddings incomplete) — this is acceptable

**Verification Steps:**
1. Import a large file (5K+ messages)
2. As soon as the parsing phase completes (before embeddings finish), navigate to `/browse`
3. Confirm the new conversation appears in the sidebar
4. Click the conversation and confirm messages render
5. Scroll through messages to confirm they are present and readable
6. Screenshot the browse view while the import page still shows embedding in progress (if possible)

**Notes:** This tests the lazy embedding architecture — users shouldn't have to wait for embeddings to browse their messages.

---

## Scenario 9: Parser Handles All Message Types
**Feature:** B3. Message Parser
**Type:** Happy Path

**Given:** An imported conversation that contains text messages, reactions, image references, video references, link messages, and missing attachment markers
**When:** The user browses the conversation
**Then:**
- Plain text messages display their content correctly
- Image references show an image type indicator (not the raw markdown)
- Video references show a video type indicator
- Missing attachment markers show a warning or placeholder
- Link messages display appropriately
- Multi-line messages (consecutive blockquoted lines) are combined into single messages
- Day headers appear as date dividers in the thread

**Verification Steps:**
1. Import a file known to contain varied message types
2. Browse the conversation and locate examples of each message type
3. Confirm text messages render as readable content
4. Confirm image references show an appropriate indicator (icon, badge, or label)
5. Confirm video references show an appropriate indicator
6. Confirm missing attachment markers are visually distinct (warning style)
7. Confirm multi-line messages appear as single coherent messages
8. Screenshot examples of each message type

**Notes:** The parser should handle the Apple Messages export format as documented in the spec. If any message type renders as raw markdown (e.g., showing `![Image: file.jpg](...)`), that is a FAIL.

---

## Scenario 10: Reactions Are Resolved to Correct Messages
**Feature:** B3. Message Parser, B4. Batched Import Pipeline
**Type:** Happy Path

**Given:** An imported conversation that contains reaction messages (e.g., "Liked 'Thanks for dinner!'")
**When:** The user browses the conversation
**Then:**
- Reaction messages are not displayed as standalone messages in the thread
- Instead, reaction emoji chips appear on or near the message being reacted to
- The reaction is associated with the correct message (matched by quoted text)
- Multiple reactions on the same message are grouped

**Verification Steps:**
1. Import a file known to contain reactions
2. Browse the conversation and find messages that should have reactions
3. Confirm reactions appear as emoji chips/badges near the reacted-to message
4. Confirm the reaction appears on the correct message (verify the quoted text match)
5. Confirm reaction messages are not shown as separate messages in the thread
6. Screenshot a message with reactions

**Notes:** Reaction resolution uses quoted text matching, which may not be perfect for very short or common phrases. Note any misattributed reactions.

---

## Scenario 11: Duplicate Participant Names Across Files
**Feature:** B2. Identity Resolution UI
**Type:** Edge Case

**Given:** The user imports two files where the same person appears with different names (e.g., "Mom" in one file and "Lisa" in another)
**When:** The identity resolution step runs for the second import
**Then:**
- The system suggests matching "Lisa" with the existing "Mom" participant (or vice versa)
- If the user confirms the match, both names are recorded as aliases of the same participant
- Messages from both imports show the canonical display name
- The participant's message count reflects messages from both conversations

**Verification Steps:**
1. Import file A which has a participant named "Mom"
2. Import file B which has a participant who should be the same person but under a different name
3. During identity resolution for file B, confirm the match suggestion appears
4. Accept the match
5. After import, check the participants list (Settings) — confirm the merged participant has both aliases
6. Browse both conversations — confirm the same participant color is used

**Notes:** If no match suggestion appears, the evaluator should try the manual match flow. If no manual match flow exists, this is a PARTIAL PASS at best.

---

## Scenario 12: Malformed File Handling
**Feature:** B1. File Upload and Header Scanning, B3. Message Parser
**Type:** Error Handling

**Given:** An authenticated user on the import page
**When:** The user uploads a file that is valid text but does not match the expected Apple Messages export format (e.g., a random markdown file, a novel chapter, a CSV)
**Then:**
- The system either rejects the file with a clear error message, or
- The system attempts to parse it and reports that no messages were found
- The application does not crash or display raw stack traces
- The user can try again with a different file
- No corrupted data is left in the database

**Verification Steps:**
1. Upload a random markdown file (e.g., a README from another project)
2. Observe the system's response — confirm either graceful rejection or graceful empty result
3. Confirm no error page or stack trace is displayed
4. Confirm the import page is still functional after the failed attempt
5. Upload a valid file afterward and confirm it imports correctly

**Notes:** The parser should be lenient enough to not crash on unexpected input, but strict enough to not create garbage records.

---

## Scenario 13: Embedding Generation Progress
**Feature:** B5. Background Embedding Generation
**Type:** Happy Path

**Given:** A conversation has been parsed and message browsing is available
**When:** Background embedding generation is running
**Then:**
- The import status shows "embedding" or equivalent indicator
- The embedded message count updates as batches complete
- When all embeddings are generated, the status transitions to "completed"
- The conversation's messages now appear in semantic search results

**Verification Steps:**
1. Import a file with 1,000+ messages
2. After parsing completes, observe the import status — confirm it shows an embedding phase
3. Monitor the embedding progress counter (if visible)
4. Wait for embedding to complete — confirm the status changes to "completed"
5. Navigate to search and perform a semantic search — confirm results from this conversation appear

**Notes:** Embedding generation for 15K messages should complete within 10 minutes per the spec's success metrics. Time the process.

---

## Scenario 14: Import History Shows Past Imports
**Feature:** B4. Batched Import Pipeline
**Type:** Cross-Feature

**Given:** The user has completed one or more imports
**When:** The user views the import page or import history
**Then:**
- Past imports are listed with date, filename, message count, and status
- Successfully completed imports show "completed" status
- Failed imports (if any) show "failed" status with an error description
- The list is ordered by most recent first

**Verification Steps:**
1. Complete at least two imports
2. Navigate to the import page or the area where import history is displayed
3. Confirm both imports appear in the history with correct metadata
4. Confirm the status column shows the correct final status for each import
5. Screenshot the import history

**Notes:** Import history may be on the import page itself or in the settings/data management area. Check both locations.

---
