import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LighthouseDashboard } from "./components/lighthouse-dashboard";
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
    <LighthouseDashboard />
  </StrictMode>,
);
