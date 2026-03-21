# Scenarios: AI Chat
**Stage:** 6
**Features Covered:** F1, F2, F3, F4, F5
**Prerequisites:** Stages 1-5 complete. Multiple conversations imported with completed embeddings. Anthropic API key and Voyage AI API key configured in Convex environment variables. Browse view functional (for source click-through). Search functional (for verifying RAG retrieval quality).

---

## Scenario 1: Create a New Chat Session
**Feature:** F1. Chat Session Management
**Type:** Happy Path

**Given:** An authenticated user navigating to `/chat`
**When:** The user clicks the "New Chat" button
**Then:**
- A new chat session is created
- The chat pane shows an empty conversation with an input field
- The session appears in the session list (left panel)
- The model selector shows the user's default model preference
- The extended thinking toggle reflects the user's default preference
- Suggestion cards appear in the empty chat state

**Verification Steps:**
1. Navigate to `/chat`
2. Click "New Chat" or equivalent button
3. Confirm a new empty session appears
4. Confirm the session is listed in the session list panel
5. Confirm the model selector is visible and shows a default model
6. Confirm the thinking toggle is visible
7. Confirm suggestion cards are displayed in the empty state
8. Screenshot the empty chat state with suggestions

**Notes:** Suggestion cards should be dynamically populated with real data from the user's archive (participant names, years, etc.), not static placeholder text.

---

## Scenario 2: Suggestion Cards Are Dynamically Populated
**Feature:** F4. Chat UI and Message Display
**Type:** Happy Path

**Given:** A new chat session with the empty state displayed
**When:** The user views the suggestion cards
**Then:**
- Suggestion cards contain real names from the user's imported participants
- Cards reference real years from the user's message archive date range
- At least 3-4 suggestion cards are visible
- Clicking a suggestion card inserts the suggestion text into the chat input (or sends it directly)

**Verification Steps:**
1. Open a new chat session
2. Read the suggestion card text — confirm it references real participant names (e.g., "Summarize my conversations with Mom")
3. Confirm at least one card references a real year from the archive
4. Click a suggestion card
5. Confirm the suggestion text is inserted into the input field or sent as a message
6. If sent, confirm an AI response begins generating

**Notes:** If suggestion cards use generic placeholders like "[participant]" instead of real names, that is a PARTIAL PASS.

---

## Scenario 3: Send a Message and Receive a Streaming Response
**Feature:** F3. Streaming AI Responses, F4. Chat UI and Message Display
**Type:** Happy Path

**Given:** An active chat session with message history from the archive
**When:** The user types a question about their message history and sends it
**Then:**
- The user's message appears in the chat immediately (right-aligned)
- A typing indicator appears while waiting for the first token
- The AI response streams in progressively (word by word or chunk by chunk)
- The response appears left-aligned with a model badge indicating which Claude model generated it
- The response is rendered with markdown formatting (bold, lists, etc.)
- The response is relevant to the user's question and references their actual message content

**Verification Steps:**
1. Type a question about the message archive (e.g., "What did [participant] and I talk about most?")
2. Press Enter or click Send
3. Confirm the user message appears immediately in the chat
4. Observe the streaming response — confirm text appears progressively, not all at once
5. Confirm the response references actual content from the imported messages
6. Confirm markdown formatting renders properly (if the response uses bold, lists, etc.)
7. Screenshot the chat with both the user message and the AI response

**Notes:** First token should stream within 3 seconds per the spec's success metrics. If the entire response appears at once (no streaming), that is a PARTIAL PASS.

---

## Scenario 4: Date-Specific Query Retrieves Correct Messages
**Feature:** F2. RAG Retrieval Pipeline
**Type:** Happy Path

**Given:** An active chat session
**When:** The user asks about messages from a specific date (e.g., "What did we talk about on Christmas 2023?" or "Show me messages from January 15, 2024")
**Then:**
- The AI response references messages that actually occurred on or near the specified date
- The content of the response is consistent with what exists in the browse view for that date
- The response does not fabricate conversations that didn't happen on that date

**Verification Steps:**
1. Pick a specific date known to have messages (check the calendar heatmap)
2. Ask the AI about that date (e.g., "What were we talking about on [date]?")
3. Read the AI response — note the topics and content mentioned
4. Navigate to the browse view or calendar day detail for that date
5. Cross-reference the AI's response against the actual messages
6. Confirm the AI accurately described the conversations from that date

**Notes:** The RAG pipeline uses query classification — a date-specific query should trigger the "date_load" retrieval strategy, which loads all messages for that date. If the AI's response contradicts what actually exists on that date, that is a FAIL.

---

## Scenario 5: Topical Query Retrieves Relevant Messages
**Feature:** F2. RAG Retrieval Pipeline
**Type:** Happy Path

**Given:** An active chat session
**When:** The user asks a topical question (e.g., "What restaurants have we mentioned?" or "Tell me about our vacation conversations")
**Then:**
- The AI response references relevant messages from across the archive
- The response draws from multiple conversations and time periods if relevant
- The topics mentioned in the response are consistent with actual message content
- The response demonstrates understanding of the conversational context

**Verification Steps:**
1. Ask a topical question that you know has relevant content in the archive
2. Read the AI response
3. Use the search feature to verify the topics mentioned by the AI actually exist in the messages
4. Confirm the response is not fabricating content — it should reference real conversations
5. Ask a follow-up question to verify conversational context is maintained

**Notes:** Topical queries should trigger the "vector" retrieval strategy. Quality depends on embedding coverage and relevance.

---

## Scenario 6: Model Selector Works
**Feature:** F1. Chat Session Management
**Type:** Happy Path

**Given:** An active chat session
**When:** The user changes the model using the model selector
**Then:**
- Three model options are available: Claude Opus 4.6, Sonnet 4.6, Haiku 4.5
- Selecting a different model applies to subsequent messages in the session
- The model badge on AI responses reflects which model generated them
- Different models produce responses (quality/speed may vary)

**Verification Steps:**
1. Note the currently selected model
2. Send a message and confirm the response model badge matches
3. Switch to a different model
4. Send another message
5. Confirm the new response shows the updated model badge
6. Try all three model options

**Notes:** Haiku should respond faster, Opus should produce higher quality responses. The test is that the selector works and the badge reflects the selection, not that response quality differs.

---

## Scenario 7: Extended Thinking Toggle Works
**Feature:** F1. Chat Session Management, F3. Streaming AI Responses
**Type:** Happy Path

**Given:** An active chat session with extended thinking enabled
**When:** The user sends a message
**Then:**
- The thinking toggle is visible and functional
- When enabled, the AI response includes a collapsible "thinking" section
- The thinking section shows the model's reasoning process
- The thinking section is collapsed by default
- Clicking to expand reveals the thinking content
- The main response follows the thinking section

**Verification Steps:**
1. Enable extended thinking via the toggle
2. Send a message that requires reasoning (e.g., "Compare my conversation style with Mom vs Dad")
3. Confirm the response includes a thinking section (collapsed by default)
4. Click to expand the thinking section — confirm thinking content is visible
5. Collapse it again — confirm it collapses
6. Disable thinking and send another message — confirm no thinking section appears

**Notes:** Extended thinking may significantly increase response time and token usage. If thinking is enabled but no thinking section appears in the response, that is a FAIL.

---

## Scenario 8: Chat Session Switching and Persistence
**Feature:** F1. Chat Session Management
**Type:** Happy Path

**Given:** A user with multiple chat sessions
**When:** The user switches between sessions
**Then:**
- The session list shows all existing sessions with titles and last activity timestamps
- Clicking a different session loads its full chat history
- The previously active session's messages are preserved (not lost on switch)
- Switching back to the original session shows the complete history
- The active session is highlighted in the session list

**Verification Steps:**
1. Create two chat sessions and send at least one message in each
2. Switch from session A to session B — confirm session B's history loads
3. Switch back to session A — confirm session A's history is intact
4. Confirm the session list highlights the active session
5. Refresh the page — confirm all sessions and their histories persist

**Notes:** Chat history is persisted in the database, not just in memory. A page refresh should NOT lose any chat history.

---

## Scenario 9: Delete Chat Session
**Feature:** F1. Chat Session Management
**Type:** Happy Path

**Given:** A user with multiple chat sessions
**When:** The user deletes a session
**Then:**
- A delete option is available (button, menu item, or similar)
- A confirmation dialog appears before deletion
- After confirming, the session is removed from the session list
- The chat pane switches to another session or shows the empty state
- The deleted session's messages are not recoverable

**Verification Steps:**
1. Note the number of sessions in the list
2. Click the delete option on a session
3. Confirm a confirmation dialog appears
4. Confirm the deletion
5. Confirm the session is removed from the list
6. Confirm the session count decreased by one
7. Refresh the page — confirm the deleted session is gone permanently

**Notes:** Deletion should be permanent. If the session reappears after deletion, that is a FAIL.

---

## Scenario 10: Source Attribution Shows Retrieved Messages
**Feature:** F5. Source Attribution
**Type:** Happy Path

**Given:** An AI response has been generated in a chat session
**When:** The user views the response
**Then:**
- An expandable "Sources" section appears below (or near) each AI response
- The section shows a source count badge (e.g., "12 source messages")
- Expanding the section reveals the actual archived messages used as context
- Source messages are displayed as mini message bubbles with sender, date, and content
- Sources are grouped by conversation and/or date

**Verification Steps:**
1. View an AI response in the chat
2. Locate the sources section (collapsed by default)
3. Note the source count badge
4. Click to expand the sources section
5. Confirm source messages are displayed with sender names, dates, and content
6. Confirm sources are from the user's actual message archive (not fabricated)
7. Screenshot the expanded sources section

**Notes:** If no sources section appears on any response, that is a FAIL. If the section exists but is empty or shows only IDs instead of message content, that is a PARTIAL PASS.

---

## Scenario 11: Source Click-Through Navigates to Browse View
**Feature:** F5. Source Attribution
**Type:** Cross-Feature

**Given:** An expanded source attribution section with source messages
**When:** The user clicks on a source message
**Then:**
- The application navigates to `/browse/[conversationId]`
- The browse view scrolls to the source message's position
- The source message is highlighted or emphasized in the thread
- The user can continue browsing from that position

**Verification Steps:**
1. Expand the sources section on an AI response
2. Click on one of the source messages
3. Confirm navigation to the browse view
4. Confirm the thread is scrolled to the correct message
5. Confirm the message is highlighted
6. Use browser back button — confirm return to the chat

**Notes:** This tests the cross-feature integration between AI chat and browse. It should work the same as search-to-browse click-through.

---

## Scenario 12: Scope Control Filters Chat Context
**Feature:** F1. Chat Session Management, F2. RAG Retrieval Pipeline
**Type:** Happy Path

**Given:** An active chat session
**When:** The user configures scope controls to limit the chat to a specific conversation or participant
**Then:**
- Scope controls are accessible (settings icon, panel, or inline controls)
- The user can restrict context to specific conversations, participants, or date ranges
- Subsequent AI responses only reference messages within the configured scope
- The scope configuration persists within the session

**Verification Steps:**
1. Open scope controls for the chat session
2. Restrict the scope to a specific conversation
3. Ask a question — confirm the response only references messages from that conversation
4. Ask about something from a different conversation — confirm the AI acknowledges the scope limitation
5. Clear the scope — confirm the AI can now reference all conversations

**Notes:** Scope control may be implemented as a filter panel, dropdown, or settings modal. The key test is that the retrieval pipeline respects the scope.

---

## Scenario 13: Copy Button on AI Responses
**Feature:** F4. Chat UI and Message Display
**Type:** Happy Path

**Given:** An AI response has been generated
**When:** The user clicks the copy button
**Then:**
- A copy button is visible on hover over AI response messages
- Clicking the button copies the response text to the clipboard
- A visual confirmation appears (e.g., button changes to checkmark, toast notification)
- The copied text includes the full response content (with markdown formatting)

**Verification Steps:**
1. Hover over an AI response — confirm a copy button appears
2. Click the copy button
3. Confirm visual feedback (button animation, toast, etc.)
4. Paste the clipboard contents elsewhere — confirm the full response was copied

**Notes:** The copy button appearing on hover is the spec's approach. If it's always visible, that's acceptable.

---

## Scenario 14: Rapid Message Sending
**Feature:** F3. Streaming AI Responses, F4. Chat UI and Message Display
**Type:** Adversarial

**Given:** An active chat session with a streaming response in progress
**When:** The user attempts to send another message while the AI is still responding
**Then:**
- The application handles this gracefully — either queuing the message or disabling the send button during streaming
- No errors, duplicated messages, or corrupted chat state
- Both the streaming response and the queued/new message are handled correctly

**Verification Steps:**
1. Send a message that triggers a long AI response
2. While the response is streaming, attempt to type and send another message
3. Observe the behavior — confirm no errors, crashes, or state corruption
4. Confirm the final chat history shows the correct sequence of messages
5. If the send was blocked, confirm the UI clearly indicates why

**Notes:** The expected behavior is that the send button is disabled or grayed out during streaming. If the user can send during streaming and it works correctly, that's also acceptable.

---

## Scenario 15: Chat with No Archive Data
**Feature:** F4. Chat UI and Message Display, F2. RAG Retrieval Pipeline
**Type:** Edge Case

**Given:** A new user with no imported conversations, or a chat session scoped to a conversation with no embeddings
**When:** The user asks a question in the AI chat
**Then:**
- The AI responds acknowledging that no message data is available
- The response does not hallucinate conversations that don't exist
- The response may suggest importing messages first
- No errors or crashes occur

**Verification Steps:**
1. If possible, create a chat session before any data is imported (or scope to an empty context)
2. Ask a question about message history
3. Confirm the AI acknowledges the lack of data rather than fabricating content
4. Confirm no error states or crashes

**Notes:** This tests the RAG pipeline's handling of empty retrieval results. The AI should gracefully handle having no context to work with.

---
