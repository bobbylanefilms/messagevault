// ABOUTME: Complete Convex schema for MessageVault — 9 tables with all indexes.
// ABOUTME: Defines users, conversations, participants, messages, reactions, dailyStats, chatSessions, chatMessages, importJobs.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    realName: v.string(),
    preferences: v.object({
      defaultModel: v.string(),
      thinkingEnabled: v.boolean(),
      theme: v.string(),
    }),
  }).index("by_clerkId", ["clerkId"]),

  conversations: defineTable({
    userId: v.id("users"),
    title: v.string(),
    isGroupChat: v.boolean(),
    participantIds: v.array(v.id("participants")),
    dateRange: v.object({
      start: v.number(),
      end: v.number(),
    }),
    messageCount: v.number(),
    importedAt: v.number(),
    sourceFilename: v.string(),
    metadata: v.optional(
      v.object({
        contactInfo: v.optional(v.string()),
        exportedAt: v.optional(v.string()),
        totalMessagesReported: v.optional(v.number()),
      })
    ),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_importedAt", ["userId", "importedAt"]),

  participants: defineTable({
    userId: v.id("users"),
    displayName: v.string(),
    aliases: v.array(v.string()),
    isMe: v.boolean(),
    avatarColor: v.string(),
    conversationCount: v.number(),
    messageCount: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_displayName", ["userId", "displayName"])
    .searchIndex("search_name", {
      searchField: "displayName",
      filterFields: ["userId"],
    }),

  messages: defineTable({
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    participantId: v.id("participants"),
    senderName: v.string(),
    timestamp: v.number(),
    dateKey: v.string(),
    content: v.string(),
    rawContent: v.optional(v.string()),
    messageType: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("video"),
      v.literal("link"),
      v.literal("attachment_missing")
    ),
    attachmentRef: v.optional(v.string()),
    hasReactions: v.boolean(),
    embedding: v.optional(v.array(v.float64())),
  })
    .index("by_conversationId_timestamp", ["conversationId", "timestamp"])
    .index("by_userId_dateKey", ["userId", "dateKey"])
    .index("by_conversationId_dateKey", ["conversationId", "dateKey"])
    .index("by_participantId", ["participantId"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["userId", "conversationId", "participantId"],
    })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
      filterFields: ["userId", "conversationId"],
    }),

  reactions: defineTable({
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    messageId: v.optional(v.id("messages")),
    participantId: v.id("participants"),
    reactionType: v.union(
      v.literal("liked"),
      v.literal("loved"),
      v.literal("laughed"),
      v.literal("disliked"),
      v.literal("emphasized"),
      v.literal("questioned")
    ),
    quotedText: v.string(),
    timestamp: v.number(),
  })
    .index("by_messageId", ["messageId"])
    .index("by_conversationId", ["conversationId"]),

  dailyStats: defineTable({
    userId: v.id("users"),
    dateKey: v.string(),
    totalMessages: v.number(),
    conversationBreakdown: v.array(
      v.object({
        conversationId: v.id("conversations"),
        count: v.number(),
      })
    ),
    participantBreakdown: v.array(
      v.object({
        participantId: v.id("participants"),
        count: v.number(),
      })
    ),
  }).index("by_userId_dateKey", ["userId", "dateKey"]),

  chatSessions: defineTable({
    userId: v.id("users"),
    title: v.optional(v.string()),
    model: v.string(),
    thinkingEnabled: v.boolean(),
    messageCount: v.number(),
    lastActivityAt: v.number(),
    contextScope: v.optional(
      v.object({
        conversationIds: v.optional(v.array(v.id("conversations"))),
        participantIds: v.optional(v.array(v.id("participants"))),
        dateRange: v.optional(
          v.object({
            start: v.number(),
            end: v.number(),
          })
        ),
      })
    ),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_lastActivity", ["userId", "lastActivityAt"]),

  chatMessages: defineTable({
    sessionId: v.id("chatSessions"),
    userId: v.id("users"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    content: v.string(),
    thinkingContent: v.optional(v.string()),
    model: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    retrievedMessageIds: v.optional(v.array(v.id("messages"))),
    retrievalStrategy: v.optional(v.string()),
    streamId: v.optional(v.string()),
  }).index("by_sessionId", ["sessionId"]),

  importJobs: defineTable({
    userId: v.id("users"),
    status: v.union(
      v.literal("uploading"),
      v.literal("parsing"),
      v.literal("embedding"),
      v.literal("completed"),
      v.literal("failed")
    ),
    conversationId: v.optional(v.id("conversations")),
    sourceFilename: v.string(),
    totalLines: v.optional(v.number()),
    parsedMessages: v.number(),
    skippedDuplicates: v.number(),
    embeddedMessages: v.number(),
    totalMessages: v.number(),
    error: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"]),
});
