"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { Building2, Coffee, Download, Lock, Package, ShieldCheck, ShoppingCart, Smartphone, Utensils } from "lucide-react";
import type { Role } from "@/app/lib/mock-data";
import { authenticateStaffWithPin } from "@/app/lib/firebase";
import {
  getDefaultLoginPassword,
  MANAGER_SESSION_VERSION,
  STORAGE_ACTIVE_USERNAME,
  STORAGE_MANAGER_SESSION_VERSION,
} from "@/app/lib/login-profiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePwaInstall } from "@/hooks/use-pwa-install";

type LoginConfig = {
  label: string;
  username: string;
  initials: string;
  description: string;
  destination: string;
  icon: typeof ShieldCheck;
};

const ROLE_CONFIG: Record<Role, LoginConfig> = {
  manager: {
    label: "Hotel Manager",
    username: "manager",
    initials: "HM",
    description: "Full lodge oversight and operational control.",
    destination: "/dashboard",
    icon: ShieldCheck,
  },
  director: {
    label: "Managing Director",
    username: "director",
    initials: "MD",
    description: "Executive performance, finances, and strategic controls.",
    destination: "/dashboard",
    icon: Building2,
  },
  inventory: {
    label: "Inventory Manager",
    username: "inventory",
    initials: "IM",
    description: "Stock control, transfers, purchasing, and usage.",
    destination: "/dashboard/inventory",
    icon: Package,
  },
  cashier: {
    label: "Reception & Bookings",
    username: "reception",
    initials: "RB",
    description: "Reservations, guests, rooms, payments, and reception operations.",
    destination: "/dashboard/cashier",
    icon: ShoppingCart,
  },
  kitchen: {
    label: "Kitchen POS",
    username: "kitchen",
    initials: "KP",
    description: "Kitchen orders, preparation queue, menu, and stock usage.",
    destination: "/dashboard/kitchen",
    icon: Utensils,
  },
  barista: {
    label: "Bar & POS",
    username: "bar",
    initials: "BP",
    description: "Bar orders, beverage service, settlements, and stock usage.",
    destination: "/dashboard/barista",
    icon: Coffee,
  },
};

export function RoleLoginPage({ role }: { role: Role }) {
  const config = ROLE_CONFIG[role];
  const Icon = config.icon;
  const isInstallableRole = role === "director" || role === "kitchen" || role === "barista";
  const [shift, setShift] = useState<"day" | "night">("day");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [installFeedback, setInstallFeedback] = useState("");
  const { installPrompt, isStandaloneApp, promptInstall } = usePwaInstall(isInstallableRole);

  const handleInstall = async () => {
    if (installPrompt) {
      const result = await promptInstall();
      setInstallFeedback(result?.outcome === "accepted" ? "Lighthouse Lodge is being installed." : "Installation dismissed.");
      return;
    }
    setInstallFeedback("Open the browser menu and choose Install app or Add to Home Screen.");
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== getDefaultLoginPassword(role)) {
      setError("Incorrect password for this staff role.");
      return;
    }

    setSigningIn(true);
    setError("");
    try {
      await authenticateStaffWithPin(role, password).catch((authenticationError) => {
        console.warn("Cloud authentication is unavailable; continuing with offline role access.", authenticationError);
      });

      localStorage.setItem(STORAGE_ACTIVE_USERNAME, config.username);
      localStorage.setItem("lighthouse-role", role);
      if (role === "manager") localStorage.setItem(STORAGE_MANAGER_SESSION_VERSION, MANAGER_SESSION_VERSION);
      else localStorage.removeItem(STORAGE_MANAGER_SESSION_VERSION);
      if (role === "cashier") localStorage.setItem("lighthouse-shift", shift);
      else localStorage.removeItem("lighthouse-shift");
      await window.lighthouseDesktop?.storeVerifiedSession({
        uid: `lighthouse-${role}`,
        displayName: config.label,
        role,
      }).catch(() => false);
      window.location.assign(config.destination);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#140c07] p-5 text-[#17100c]">
      <section className="w-full max-w-md rounded-3xl border border-[#b98025]/35 bg-[#fcfaf6] p-7 shadow-2xl sm:p-9">
        <a href="/staff" className="mb-7 inline-flex text-xs font-black uppercase tracking-[0.18em] text-[#76552d]">← All staff portals</a>
        <div className="text-center">
          <div className="relative mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full border-4 border-[#efd18e] bg-[#28170d] text-[#e0b762] shadow-xl">
            <span className="text-2xl font-black">{config.initials}</span>
            <i className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-[#cf9c43] text-[#140c07]"><Icon className="h-4 w-4" /></i>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#b98025]">Lighthouse Lodge</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">{config.label}</h1>
          <p className="mt-2 text-sm leading-6 text-black/55">{config.description}</p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleLogin}>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-widest">Role password</span>
            <span className="relative block">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#76552d]" />
              <Input
                name="password"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                autoComplete="current-password"
                className="h-12 border-[#ded0ba] bg-white pl-10"
                value={password}
                onChange={(event) => setPassword(event.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="Enter 4-digit password"
                autoFocus
              />
            </span>
          </label>

          {role === "cashier" && (
            <Tabs value={shift} onValueChange={(value) => setShift(value as "day" | "night")}>
              <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="day">Day shift</TabsTrigger><TabsTrigger value="night">Night shift</TabsTrigger></TabsList>
            </Tabs>
          )}

          {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
          <Button type="submit" disabled={password.length !== 4 || signingIn} className="h-12 w-full bg-[#28170d] font-black uppercase tracking-widest text-[#efd18e] hover:bg-[#55351f]">
            {signingIn ? "Opening workspace..." : "Sign in securely"}
          </Button>
        </form>

        <p className="mt-5 flex items-center justify-center gap-2 text-xs text-black/50"><ShieldCheck className="h-4 w-4 text-[#b98025]" /> Password access works online and offline.</p>

        {isInstallableRole && !isStandaloneApp && (
          <div className="mt-5 border-t border-[#ded0ba] pt-5">
            <Button type="button" variant="outline" className="w-full" onClick={() => void handleInstall()}><Download className="mr-2 h-4 w-4" /> Install Lighthouse app</Button>
            {installFeedback && <p className="mt-2 flex items-center gap-2 text-xs text-black/50"><Smartphone className="h-4 w-4" />{installFeedback}</p>}
          </div>
        )}
      </section>
    </main>
  );
}
