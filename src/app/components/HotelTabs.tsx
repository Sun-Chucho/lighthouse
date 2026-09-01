"use client";

import Link from 'next/link';
import { useState } from 'react';
import { Download, Smartphone, Info } from 'lucide-react';
import { usePwaInstall } from '@/hooks/use-pwa-install';

export default function HotelTabs() {
  const [installFeedback, setInstallFeedback] = useState("");
  const { installPrompt, isStandaloneApp, promptInstall } = usePwaInstall(true);

  const handleInstallApp = async () => {
    if (installPrompt) {
      const choice = await promptInstall();
      if (choice?.outcome === "accepted") {
        setInstallFeedback("Lighthouse Lodge app is being installed successfully!");
      } else {
        setInstallFeedback("Installation dismissed.");
      }
    } else {
      setInstallFeedback("Please use your browser's menu to install Lighthouse Lodge as a PWA app.");
    }
  };

  const links = [
    { name: "Hotel Manager", url: "/manager" },
    { name: "Reception & Bookings", url: "/rb" },
    { name: "Kitchen POS", url: "/kp" },
    { name: "Bar & POS", url: "/bp" },
    { name: "Inventory Manager", url: "/im" },
  ];

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center p-4 bg-cover bg-center bg-no-repeat relative"
      style={{
        backgroundImage: "linear-gradient(rgba(10, 10, 10, 0.96), rgba(10, 10, 10, 0.96)), url('/logo-512.jpg')",
        backgroundSize: "contain",
      }}
    >
      <div className="w-full max-w-lg rounded-3xl bg-[#140c07]/95 backdrop-blur shadow-2xl overflow-hidden border border-[#b98025]/40 text-white">
        <div className="p-6 text-center border-b border-[#b98025]/30 bg-[#1d110a]/90">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-2xl overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-192.jpg" alt="Lighthouse Lodge logo" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">LIGHTHOUSE LODGE</h1>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#e0b762] mt-1">Lodge Management Suite</p>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#cf9c43] mb-2">Available Portals</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[22rem] overflow-y-auto pr-1">
            {links.map((link) => (
              <Link
                key={link.name}
                href={link.url}
                className="flex items-center justify-center p-4 rounded-xl font-bold text-center border border-[#b98025]/35 bg-[#28170d]/75 text-[#f7f2e9] hover:bg-[#cf9c43] hover:text-[#140c07] hover:border-[#e0b762] transition-all duration-200"
              >
                {link.name}
              </Link>
            ))}
          </div>

          {!isStandaloneApp && (
            <div className="mt-6 pt-5 border-t border-slate-800">
              <div className="bg-slate-900/70 rounded-xl p-4 border border-slate-700 text-left">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-950 shadow-sm">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-white">Install Lighthouse Lodge App</h3>
                    <p className="text-xs font-medium text-slate-300 mt-1 leading-relaxed">
                      Install this app on Chrome or your browser to access shortcuts, offline modes, and fast launch.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleInstallApp}
                  className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-white text-slate-950 hover:bg-slate-100 active:bg-slate-200 font-bold text-xs uppercase tracking-[0.3em] transition-colors shadow-sm"
                >
                  <Download className="h-4 w-4" />
                  {installPrompt ? "Install Now" : "Show Install Steps"}
                </button>

                {installFeedback && (
                  <p className="mt-2 text-xs font-semibold text-slate-200 flex items-center gap-1.5 bg-white/10 px-2 py-1 rounded border border-slate-700">
                    <Info className="h-3 w-3 shrink-0" /> {installFeedback}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
