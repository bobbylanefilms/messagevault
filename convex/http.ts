// ABOUTME: HTTP routes for Convex — exposes streaming endpoint for AI chat responses.
// ABOUTME: Used by persistent-text-streaming component for real-time response delivery.

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal, components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  PersistentTextStreaming,
  type StreamId,
} from "@convex-dev/persistent-text-streaming";

const streaming = new PersistentTextStreaming(components.persistentTextStreaming);

const http = httpRouter();

http.route({
  path: "/chat-stream",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = (await request.json()) as { streamId: string };
    const streamId = body.streamId;
    const sessionId = request.headers.get("X-Session-Id");

    if (!streamId) {
      return new Response("Missing streamId", { status: 400 });
    }

    const response = await streaming.stream(
      ctx,
      request,
      streamId as StreamId,
      async (ctx, _req, _id, chunkAppender) => {
        try {
          // Resolve session and user
          if (!sessionId) throw new Error("Missing session ID");

          const session = await ctx.runQuery(internal.chat.getSession, {
            sessionId: sessionId as Id<"chatSessions">,
          });
          if (!session) throw new Error("Session not found");

          // Get the latest user message
          const latestUserMsg = await ctx.runQuery(
            internal.chat.getLatestUserMessage,
            { sessionId: sessionId as Id<"chatSessions"> }
          );
          if (!latestUserMsg) throw new Error("No user message found");

          // Resolve userId from session
          const userId = session.userId as string;

          // Run RAG pipeline
          const ragContext = await ctx.runAction(
            internal.chat.assembleContext,
            {
              userQuery: latestUserMsg.content,
              sessionId: sessionId as Id<"chatSessions">,
              userId,
            }
          );

          // Find the assistant message to update later
          const chatHistory = await ctx.runQuery(internal.chat.getChatHistory, {
            sessionId: sessionId as Id<"chatSessions">,
          });
          const assistantMsg = chatHistory.find(
            (m: any) => m.streamId === streamId && m.role === "assistant"
          );

          // Update assistant message with retrieval info
          if (assistantMsg) {
            await ctx.runMutation(internal.chatMessages.updateRetrievalInfo, {
              messageId: assistantMsg._id,
              retrievedMessageIds:
                ragContext.retrievedMessageIds as Id<"messages">[],
              retrievalStrategy: ragContext.strategy,
            });
          }

          // Build messages for Anthropic
          const messages: Array<{
            role: "user" | "assistant";
            content: string;
          }> = [];
          for (const msg of ragContext.chatHistory) {
            messages.push({
              role: msg.role as "user" | "assistant",
              content: msg.content,
            });
          }

          const fullSystemPrompt = `${ragContext.systemPrompt}\n\n## Retrieved Messages from Archive\n\n${ragContext.formattedContext}`;

          // Call Anthropic API with streaming
          const Anthropic = (await import("@anthropic-ai/sdk")).default;
          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

          const client = new Anthropic({ apiKey });

          const params: any = {
            model: ragContext.model,
            max_tokens: ragContext.thinkingEnabled ? 16_000 : 8_192,
            system: fullSystemPrompt,
            messages,
            stream: true,
          };

          if (ragContext.thinkingEnabled) {
            params.thinking = {
              type: "enabled",
              budget_tokens: 10_000,
            };
          }

          let fullText = "";
          let thinkingText = "";
          let inputTokens = 0;
          let outputTokens = 0;

          const stream = await client.messages.stream(params);

          for await (const event of stream) {
            if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                fullText += event.delta.text;
                await chunkAppender(event.delta.text);
              } else if (event.delta.type === "thinking_delta") {
                thinkingText += (event.delta as any).thinking;
              }
            } else if (event.type === "message_delta") {
              if ((event as any).usage) {
                outputTokens = (event as any).usage.output_tokens ?? 0;
              }
            } else if (event.type === "message_start") {
              if ((event as any).message?.usage) {
                inputTokens =
                  (event as any).message.usage.input_tokens ?? 0;
              }
            }
          }

          // Finalize assistant message
          if (assistantMsg) {
            await ctx.runMutation(
              internal.chatMessages.finalizeAssistantMessage,
              {
                messageId: assistantMsg._id,
                content: fullText,
                thinkingContent: thinkingText || undefined,
                inputTokens,
                outputTokens,
              }
            );
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          // Try to save error to assistant message
          const chatHistory = await ctx.runQuery(
            internal.chat.getChatHistory,
            {
              sessionId: sessionId as Id<"chatSessions">,
            }
          );
          const assistantMsg = chatHistory?.find(
            (m: any) => m.streamId === streamId && m.role === "assistant"
          );
          if (assistantMsg) {
            await ctx.runMutation(
              internal.chatMessages.finalizeAssistantMessage,
              {
                messageId: assistantMsg._id,
                content: `Error: ${errorMessage}`,
              }
            );
          }
          throw error; // Re-throw so library sets stream status to "error"
        }
      }
    );

    // CORS headers
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Vary", "Origin");
    return response;
  }),
});

// CORS preflight
http.route({
  path: "/chat-stream",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Session-Id",
        "Access-Control-Max-Age": "86400",
      },
    });
  }),
});

export default http;
