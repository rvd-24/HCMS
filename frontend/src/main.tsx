import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/react";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { App } from "./app/App";
import { ApiError } from "./lib/api";
import { AuthProvider } from "./lib/auth";
import { keepBackendAwake } from "./lib/keepAlive";
import "./index.css";

keepBackendAwake();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

// Analytics leaves the clinic, so send only the route shape: drop query strings
// (patient search puts names/phones in ?q=) and collapse record IDs.
function anonymiseUrl(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/[0-9a-f]{32}(?=\/|$)/g, "/:id");
  return { ...event, url: url.toString() };
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
    <Analytics beforeSend={anonymiseUrl} />
  </React.StrictMode>,
);
