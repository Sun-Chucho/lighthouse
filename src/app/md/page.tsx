"use client";

import Image from "next/image";
import { useState } from "react";
import { STORAGE_ACTIVE_USERNAME, STORAGE_MANAGER_SESSION_VERSION } from "@/app/lib/login-profiles";

/**
 * The MD workspace is deliberately entered from the Lighthouse mark alone.
 * Keeping session creation here lets the existing dashboard continue to use
 * its normal director-only navigation, data hydration, and permissions.
 */
export default function ManagingDirectorEntryPage() {
  const [opening, setOpening] = useState(false);

  const enterDashboard = async () => {
    if (opening) return;

    setOpening(true);
    localStorage.setItem(STORAGE_ACTIVE_USERNAME, "director");
    localStorage.setItem("lighthouse-role", "director");
    localStorage.removeItem("lighthouse-shift");
    localStorage.removeItem(STORAGE_MANAGER_SESSION_VERSION);

    await window.lighthouseDesktop?.storeVerifiedSession({
      uid: "lighthouse-director",
      displayName: "Managing Director",
      role: "director",
    }).catch(() => false);

    window.location.assign("/dashboard");
  };

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#140c07] p-6">
      <div className="flex flex-col items-center gap-5 text-center">
        <button
          type="button"
          aria-label="Open Managing Director dashboard"
          onClick={() => void enterDashboard()}
          disabled={opening}
          className="touch-manipulation rounded-full outline-none transition-transform duration-200 hover:scale-105 focus-visible:ring-4 focus-visible:ring-[#efd18e] focus-visible:ring-offset-4 focus-visible:ring-offset-[#140c07] active:scale-95 disabled:cursor-wait"
        >
          <Image
            src="/logo-192.jpg"
            alt="Lighthouse Lodge"
            width={192}
            height={192}
            priority
            unoptimized
            className="h-auto w-[min(56vw,12rem)] rounded-full"
          />
        </button>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#efd18e]">Tap the logo to enter</p>
      </div>
    </main>
  );
}
