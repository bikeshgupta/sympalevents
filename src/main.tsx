import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { App } from "@/app";
import { EventProvider } from "@/lib/event-context";
import { restorePersistedCache, startPersistingCache } from "@/lib/query-persist";
import "@/styles/globals.css";

// Two defaults, both about load time:
// - An answer is fresh for 30 seconds. With React Query's default of 0, every
//   screen that mounted re-asked for data that had arrived a moment earlier
//   (the dashboard re-read the whole event the layout had just read). Saving
//   anything still refetches at once: writes invalidate their queries.
// - A refusal is not retried. 401/403/404 are answers, not failures, and the
//   default three retries with backoff held a page on its skeleton for about
//   seven seconds before it could say so. Anything else is retried once.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        const status = (error as { status?: number } | null)?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 1;
      },
    },
  },
});
// Draw from the last answers while everything refreshes behind them - see src/lib/query-persist.ts.
restorePersistedCache(queryClient, __BUILD_ID__);
startPersistingCache(queryClient, __BUILD_ID__);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <EventProvider>
          <App />
        </EventProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
