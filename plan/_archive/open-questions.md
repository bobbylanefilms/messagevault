# MessageVault — Open Questions

## Summary
- **Total Questions:** 9
- **Next Question Number:** 10
- **Resolved:** 4 (Q1–Q4)
- **Open:** 5 (Q5–Q9)

### Open Questions by Priority

**🔴 High:**
- Q5: Parser Format Variants

**🟡 Medium:**
- Q6: Participant Merge UI Detail
- Q7: Message Analytics Features
- Q8: Group Chat Handling

**🟢 Low:**
- Q9: Export / Backup Capabilities

---

## Question 5: Parser Format Variants
**Priority:** 🔴 High
**Category:** Technical Architecture
**Status:** 🔴 Open

**Question:** Are there other Apple Messages export formats beyond the one seen in the example file that the parser needs to handle?

**Why It Matters:** The parser is a critical path component. If other export tools produce different markdown structures, the parser needs to handle them or we'll have failed imports. The Plan agent identified at least two format variants in Rob's files.

**Possible Approaches:**
- **OPTION A — Single Format**: Build parser for the documented format only, add format support as new files are encountered
- **OPTION B — Format Detection**: Build a format detection layer that identifies the export tool and routes to the appropriate parser
- **OPTION C — Flexible Parser**: Build a lenient parser that handles common variations (different date formats, header styles, etc.)

**Dependencies:** Blocks import pipeline implementation. Need additional sample files to validate.

---

## Question 6: Participant Merge UI Detail
**Priority:** 🟡 Medium
**Category:** UI/UX Design
**Status:** 🔴 Open

**Question:** How should the participant deduplication UI work when the same person appears with different names across imports (e.g., "Mom" in one chat, "Lisa" in another)?

**Why It Matters:** Accurate participant identity is essential for cross-conversation filtering and the calendar heatmap. Poor dedup means fragmented views.

**Possible Approaches:**
- **OPTION A — Import-Time Prompt**: During each import, show existing participants and ask "Is [new name] the same person as [existing name]?"
- **OPTION B — Settings-Based Merge**: Let imports create new participants freely, provide a merge tool in Settings where users can combine duplicate participants
- **OPTION C — Both**: Prompt during import AND provide a merge tool in Settings for retroactive cleanup

**Dependencies:** Affects import pipeline and settings UI design.

---

## Question 7: Message Analytics Features
**Priority:** 🟡 Medium
**Category:** Feature Scope
**Status:** 🔴 Open

**Question:** Should MessageVault include message analytics beyond the calendar heatmap? Examples: word frequency, sentiment trends over time, response time analysis, most active hours, emoji usage stats.

**Why It Matters:** Analytics could add significant value to the archive exploration experience but also adds scope.

**Possible Approaches:**
- **OPTION A — Heatmap Only**: Keep analytics minimal (calendar heatmap + basic stats cards on dashboard). Analytics can be explored via AI chat.
- **OPTION B — Basic Analytics**: Add a few computed stats: messages per month trend line, top emoji, average response time, most active hour
- **OPTION C — Rich Analytics Dashboard**: Full analytics page with multiple visualizations and trend analysis

**Dependencies:** None — can be added post-MVP.

---

## Question 8: Group Chat Handling
**Priority:** 🟡 Medium
**Category:** Feature Design
**Status:** 🔴 Open

**Question:** How should group chats (3+ participants) be handled in the import and browsing experience? Are there group chat exports in the archive?

**Why It Matters:** Group chats have different UI needs (participant labels on every message) and different data characteristics (more participants, potentially more messages).

**Possible Approaches:**
- **OPTION A — Same Treatment**: Handle group chats identically to 1:1 chats, just with more participants. Show sender name on every message.
- **OPTION B — Group-Specific Features**: Add group-specific features: participant activity breakdown within the conversation, ability to filter to a sub-thread between specific participants within the group

**Dependencies:** Need to know if group chat exports exist and what format they use.

---

## Question 9: Export / Backup Capabilities
**Priority:** 🟢 Low
**Category:** Feature Scope
**Status:** 🔴 Open

**Question:** Should MessageVault support exporting data back out (e.g., as PDF, formatted text, or re-exportable format)?

**Why It Matters:** Users might want to share specific conversations or date ranges, or back up the structured data.

**Possible Approaches:**
- **OPTION A — No Export**: Data lives in the app only. Not needed for v1.
- **OPTION B — Basic Export**: Export selected date ranges or conversations as formatted markdown or PDF
- **OPTION C — Full Export**: Export everything including metadata and AI chat history

**Dependencies:** None — purely additive feature.
