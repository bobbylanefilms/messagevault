// ABOUTME: Convex auth configuration — validates Clerk JWTs for all authenticated operations.
// ABOUTME: References the Clerk issuer URL from environment variables.

const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_ISSUER_URL,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
