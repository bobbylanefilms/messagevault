// ABOUTME: Convex app configuration — registers external components.
// ABOUTME: Persistent-text-streaming component enables real-time AI response streaming.

import { defineApp } from "convex/server";
import persistentTextStreaming from "@convex-dev/persistent-text-streaming/convex.config.js";

const app = defineApp();
app.use(persistentTextStreaming);
export default app;
