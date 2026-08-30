import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { App } from "@/app";
import { EventProvider } from "@/lib/event-context";
import "@/styles/globals.css";

const queryClient = new QueryClient();

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
