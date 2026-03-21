# MessageVault — Question Archive

## Question 1: Storage Granularity
**Category:** Technical Architecture
**Status:** ✅ RESOLVED

**Resolution:** Per-message storage. Each message gets its own database document for precise filtering, semantic search, and calendar heatmap accuracy. Scale (~750K total messages) is well within Convex limits.

**Resolved:** March 21, 2026, Conversation 1

---

## Question 2: Identity Mapping Strategy
**Category:** Technical Architecture
**Status:** ✅ RESOLVED

**Resolution:** User-prompted during import. The importing user maps "Me" to their real identity via a UI prompt before file upload. Participants are deduplicated against existing records.

**Resolved:** March 21, 2026, Conversation 1

---

## Question 3: Attachment Handling
**Category:** Feature Scope
**Status:** ✅ RESOLVED

**Resolution:** Text-only for v1. Note attachment existence via `messageType` and `attachmentRef` fields, but don't import binary files. Schema is designed for future attachment support without changes.

**Resolved:** March 21, 2026, Conversation 1

---

## Question 4: API Key Management
**Category:** Technical Architecture
**Status:** ✅ RESOLVED

**Resolution:** App-level API key stored in environment variables. Single Anthropic key and single Voyage AI key, shared across all users. Appropriate for a family app with 2-3 users.

**Resolved:** March 21, 2026, Conversation 1
