// ABOUTME: Helper to derive the Convex HTTP site URL from the cloud URL.
// ABOUTME: Used by the chat UI to construct the streaming endpoint URL.

/**
 * Convert a Convex cloud URL to the site (HTTP) URL.
 * Cloud URL format: https://xxx.convex.cloud
 * Site URL format: https://xxx.convex.site
 */
export function getConvexSiteUrl(): string {
  const cloudUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!cloudUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL not set");
  return cloudUrl.replace(".cloud", ".site");
}
