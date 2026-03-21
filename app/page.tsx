// ABOUTME: Landing page — public entry point before authentication.
// ABOUTME: Will be replaced with Clerk sign-in/sign-up components in A3.

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">MessageVault</h1>
        <p className="mt-2 text-muted-foreground">
          Your family message archive
        </p>
      </div>
    </main>
  );
}
