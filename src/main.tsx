import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LighthouseApp } from "./app";
import { DesktopUpdateBanner } from "./components/desktop-update-banner";
import { AuthProvider } from "./context/auth-context";
import { SyncProvider } from "./context/sync-context";
import {
  initializeFirebaseAnalytics,
  initializeFirebaseFirestore,
} from "./lib/firebase";
import "./styles.css";

void initializeFirebaseAnalytics();
void initializeFirebaseFirestore();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Lighthouse root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <AuthProvider>
      <SyncProvider>
        <LighthouseApp />
        <DesktopUpdateBanner />
      </SyncProvider>
    </AuthProvider>
  </StrictMode>,
);
