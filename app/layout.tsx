// ABOUTME: Root layout — sets up the provider stack for auth, real-time backend, and theming.
// ABOUTME: ClerkProvider wraps ConvexProviderWithClerk; Convex validates Clerk JWTs for all operations.

import type { Metadata } from "next";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "MessageVault",
  description: "Your family message archive",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
