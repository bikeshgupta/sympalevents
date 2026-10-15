import { useEffect } from "react";
import { Link } from "react-router-dom";

/**
 * What everybody who is not on the platform list sees at `/platform/analytics`: a plain "Page not found", with no
 * mention of analytics, no sign-in prompt and no "access denied". The API gives them the same 404. Kept in the
 * main bundle and deliberately tiny; the Control Center itself is a separate chunk they never download.
 */
export function PlatformNotFound() {
  useEffect(() => {
    const previous = document.title;
    document.title = "Page not found · SymPal Events";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center bg-background px-4 py-16">
      <div className="mx-auto w-full max-w-md">
        <p className="font-display text-6xl text-primary">404</p>
        <h1 className="mt-4 font-display text-3xl">This page doesn't exist</h1>
        <p className="mt-2 text-muted-foreground">Check the address, or go back to your society.</p>
        <Link
          to="/society"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Go to Sympal Events
        </Link>
      </div>
    </main>
  );
}

/** The network failed, or the server did. Says nothing about what this page is, and retries the same request. */
export function PlatformRetry({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <main className="flex min-h-screen items-center bg-background px-4 py-16">
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-display text-3xl">Couldn't connect</h1>
        <p className="mt-2 text-muted-foreground">Check your connection and try again.</p>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {retrying ? "Trying again" : "Try again"}
        </button>
      </div>
    </main>
  );
}

/** A quiet blank page while the gate asks the server. No spinner and no words, so nothing is given away. */
export function PlatformBlank() {
  return <main aria-busy="true" className="min-h-screen bg-background" />;
}
