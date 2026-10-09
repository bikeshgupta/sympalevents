import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { App } from "@/app";
import { EventProvider } from "@/lib/event-context";
import { restorePersistedCache, startPersistingCache } from "@/lib/query-persist";
import "@/styles/globals.css";

const queryClient = new QueryClient();
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
