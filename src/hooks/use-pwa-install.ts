"use client";

import { useCallback, useEffect, useState } from "react";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let serviceWorkerRegistration: Promise<ServiceWorkerRegistration | null> | null = null;
const promptListeners = new Set<(prompt: BeforeInstallPromptEvent | null) => void>();
let listenersRegistered = false;

function ensureInstallPromptListener() {
  if (typeof window === "undefined" || listenersRegistered) return;
  listenersRegistered = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    promptListeners.forEach((listener) => listener(deferredPrompt));
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    promptListeners.forEach((listener) => listener(null));
  });
}

export function registerPwaServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }

  if (!serviceWorkerRegistration) {
    serviceWorkerRegistration = navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .catch(() => null);
  }

  return serviceWorkerRegistration;
}

export function usePwaInstall(registerServiceWorker = false) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandaloneApp, setIsStandaloneApp] = useState(false);
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as NavigatorWithStandalone).standalone === true;
    setIsStandaloneApp(standalone);

    ensureInstallPromptListener();
    setInstallPrompt(deferredPrompt);

    const listener = (prompt: BeforeInstallPromptEvent | null) => setInstallPrompt(prompt);
    promptListeners.add(listener);

    if (registerServiceWorker) {
      void registerPwaServiceWorker().then((registration) => {
        setServiceWorkerReady(Boolean(registration));
      });
    }

    return () => {
      promptListeners.delete(listener);
    };
  }, [registerServiceWorker]);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return null;

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    promptListeners.forEach((listener) => listener(null));
    return choice;
  }, []);

  return { installPrompt, isStandaloneApp, serviceWorkerReady, promptInstall };
}
