"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Clock, Home, Hotel, Menu, Package, ReceiptText, Search, User, WalletCards } from "lucide-react";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { SyncStatusIndicator } from "@/components/sync-status-indicator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { normalizeRole } from "@/app/lib/auth";
import { hydrateStorageKeyFromFirebase, isFirebaseConnected } from "@/app/lib/firebase-sync";
import { ensureStaffCloudAuthentication } from "@/app/lib/firebase";
import { removeKnownErroneousCashierBooking } from "@/app/lib/storage";
import {
  getDefaultLoginPassword,
  MANAGER_SESSION_VERSION,
  STORAGE_MANAGER_SESSION_VERSION,
  readActiveSessionUsername,
  readLocalLoginProfiles,
  renameProfileUser,
  saveLoginProfileToServer,
  writeActiveSessionUsername,
} from "@/app/lib/login-profiles";
import type { Role } from "@/app/lib/mock-data";
import { cn } from "@/lib/utils";

const VALID_ROLES: Role[] = ["manager", "director", "inventory", "cashier", "kitchen", "barista"];

const DIRECTOR_MOBILE_NAV = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Rooms", href: "/dashboard/rooms", icon: Hotel },
  { label: "Kitchen", href: "/dashboard/kitchen", icon: ReceiptText },
  { label: "Stock", href: "/dashboard/company-stock", icon: Package },
  { label: "Payments", href: "/dashboard/payments", icon: WalletCards },
  { label: "Expenses", href: "/dashboard/expenses", icon: ReceiptText },
] as const;

const ALL_OPERATIONAL_KEYS = [
  "lighthouse-settings",
  "lighthouse-login-profiles",
  "lighthouse-staff-members",
  "lighthouse-cashier-state",
  "lighthouse-rooms-state",
  "lighthouse-kitchen-state",
  "lighthouse-barista-state",
  "lighthouse-main-store-items",
  "lighthouse-inventory-items",
  "lighthouse-stock-logic",
  "lighthouse-store-movements",
  "lighthouse-store-usage",
  "lighthouse-cancelled-tickets",
  "lighthouse-barista-waste",
  "lighthouse-expenses",
  "lighthouse-laundry-records",
  "lighthouse-company-stock",
  "lighthouse-website-bookings",
  "lighthouse-live-chat",
  "lighthouse-menu-audit-trail",
  "lighthouse-kitchen-purchase-session",
  "lighthouse-kitchen-purchase-history",
  "lighthouse-kitchen-daily-stock-session",
  "lighthouse-kitchen-daily-stock-history",
  "lighthouse-barista-purchase-session",
  "lighthouse-barista-purchase-history",
  "lighthouse-barista-daily-stock-session",
  "lighthouse-barista-daily-stock-history",
] as const;

const STARTUP_SYNC_KEYS_BY_ROLE: Record<Role, readonly string[]> = {
  manager: ALL_OPERATIONAL_KEYS,
  director: ALL_OPERATIONAL_KEYS,
  inventory: ALL_OPERATIONAL_KEYS.filter((key) => key.includes("settings") || key.includes("login") || key.includes("store") || key.includes("inventory") || key.includes("stock")),
  cashier: ALL_OPERATIONAL_KEYS.filter((key) => key.includes("settings") || key.includes("login") || key.includes("cashier") || key.includes("rooms") || key.includes("booking") || key.includes("laundry") || key.includes("live-chat")),
  kitchen: ALL_OPERATIONAL_KEYS.filter((key) => key.includes("settings") || key.includes("login") || key.includes("kitchen") || key.includes("store") || key.includes("inventory") || key.includes("cancelled")),
  barista: ALL_OPERATIONAL_KEYS.filter((key) => key.includes("settings") || key.includes("login") || key.includes("barista") || key.includes("store") || key.includes("inventory") || key.includes("cancelled")),
};

const ALLOWED_ROUTES: Record<Role, string[]> = {
  manager: ["/dashboard", "/dashboard/rooms", "/dashboard/inventory", "/dashboard/inventory/kitchen-stock", "/dashboard/inventory/barista-stock", "/dashboard/menu-create", "/dashboard/company-stock", "/dashboard/cashier", "/dashboard/laundry", "/dashboard/expenses", "/dashboard/finances", "/dashboard/payments", "/dashboard/kitchen", "/dashboard/cancelled", "/dashboard/barista", "/dashboard/staff", "/dashboard/analytics", "/dashboard/settings", "/dashboard/settings/sync", "/dashboard/settings/password"],
  director: ["/dashboard", "/dashboard/rooms", "/dashboard/company-stock", "/dashboard/cashier", "/dashboard/laundry", "/dashboard/expenses", "/dashboard/finances", "/dashboard/payments", "/dashboard/kitchen", "/dashboard/barista", "/dashboard/staff", "/dashboard/analytics", "/dashboard/settings", "/dashboard/settings/sync", "/dashboard/settings/password"],
  inventory: ["/dashboard/inventory", "/dashboard/inventory/kitchen-stock", "/dashboard/inventory/barista-stock", "/dashboard/company-stock", "/dashboard/settings/password"],
  cashier: ["/dashboard/cashier", "/dashboard/laundry", "/dashboard/cash-requests", "/dashboard/website-bookings", "/dashboard/live-chat", "/dashboard/payments", "/dashboard/rooms", "/dashboard/settings/password"],
  kitchen: ["/dashboard/fnb-pos", "/dashboard/kitchen", "/dashboard/kitchen/past-payments", "/dashboard/menu-create", "/dashboard/cancelled", "/dashboard/payments", "/dashboard/settings/password"],
  barista: ["/dashboard/fnb-pos", "/dashboard/barista", "/dashboard/barista/past-sales", "/dashboard/barista/restock", "/dashboard/payments", "/dashboard/cancelled", "/dashboard/settings/password"],
};

const DEFAULT_ROUTE: Record<Role, string> = {
  manager: "/dashboard",
  director: "/dashboard",
  inventory: "/dashboard/inventory",
  cashier: "/dashboard/cashier",
  kitchen: "/dashboard/kitchen",
  barista: "/dashboard/barista",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<Role>("manager");
  const [shift, setShift] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeUsername, setActiveUsername] = useState("");
  const [usernameDialogOpen, setUsernameDialogOpen] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameFeedback, setUsernameFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const savedRole = normalizeRole(localStorage.getItem("lighthouse-role"));
    const savedShift = localStorage.getItem("lighthouse-shift");

    if (!savedRole || !VALID_ROLES.includes(savedRole)) {
      router.replace("/staff");
      return;
    }

    if (savedRole === "manager" && localStorage.getItem(STORAGE_MANAGER_SESSION_VERSION) !== MANAGER_SESSION_VERSION) {
      localStorage.removeItem("lighthouse-role");
      localStorage.removeItem("lighthouse-shift");
      localStorage.removeItem("lighthouse-username");
      localStorage.removeItem(STORAGE_MANAGER_SESSION_VERSION);
      router.replace("/manager");
      return;
    }

    setRole(savedRole);
    setShift(savedShift);
    setActiveUsername(readActiveSessionUsername(savedRole));
    setSidebarOpen(window.innerWidth >= 768);
    setMounted(true);

    removeKnownErroneousCashierBooking();

    const authenticateAndSynchronize = async () => {
      try {
        await ensureStaffCloudAuthentication(savedRole, getDefaultLoginPassword(savedRole));
        await Promise.all(
          STARTUP_SYNC_KEYS_BY_ROLE[savedRole].map((key) => hydrateStorageKeyFromFirebase(key, true)),
        );
      } catch (error) {
        if (!cancelled) console.error("Dashboard cloud authentication or hydration failed", error);
      }
    };

    void authenticateAndSynchronize();
    window.addEventListener("online", authenticateAndSynchronize);
    const authenticationRetry = window.setInterval(() => {
      if (window.navigator.onLine && !isFirebaseConnected()) void authenticateAndSynchronize();
    }, 30_000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", authenticateAndSynchronize);
      window.clearInterval(authenticationRetry);
    };
  }, [router]);

  useEffect(() => {
    const onResize = () => setSidebarOpen(window.innerWidth >= 768);
    const onSidebarClose = () => setSidebarOpen(false);
    window.addEventListener("resize", onResize);
    window.addEventListener("lighthouse-sidebar-close", onSidebarClose);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("lighthouse-sidebar-close", onSidebarClose);
    };
  }, []);

  useEffect(() => {
    if (mounted && !ALLOWED_ROUTES[role].includes(pathname)) router.replace(DEFAULT_ROUTE[role]);
  }, [mounted, pathname, role, router]);

  const saveUsername = async () => {
    const nextUsername = usernameDraft.trim();
    const previousUsername = activeUsername.trim();
    if (!nextUsername || !previousUsername) return;

    setUsernameSaving(true);
    setUsernameFeedback(null);
    try {
      const profiles = readLocalLoginProfiles() ?? {};
      const currentProfile = profiles[role] ?? { username: previousUsername, updatedAt: Date.now(), users: [] };
      const nextProfile = renameProfileUser(currentProfile, previousUsername, nextUsername);
      if (!await saveLoginProfileToServer(role, nextProfile)) {
        setUsernameFeedback("Username was not saved. Check the internet connection and try again.");
        return;
      }
      writeActiveSessionUsername(nextUsername);
      setActiveUsername(nextUsername);
      setUsernameDialogOpen(false);
    } finally {
      setUsernameSaving(false);
    }
  };

  const isDirector = role === "director";
  const directorCurrentLabel = DIRECTOR_MOBILE_NAV.find((item) => item.href === pathname)?.label ?? "Dashboard";
  if (!mounted) return null;

  return (
    <div className={cn("flex h-[100dvh] w-full overflow-hidden bg-background", isDirector && "bg-[#f7f2e9] md:bg-background")}>
      <aside className={cn("fixed left-0 top-0 z-50 h-[100dvh] w-64 transition-transform duration-300", sidebarOpen ? "translate-x-0" : "-translate-x-full")}>
        <SidebarNav role={role} />
      </aside>
      {sidebarOpen && <button type="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-40 bg-black/40 md:hidden" />}

      <div className={cn("flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden transition-[margin] duration-300", sidebarOpen ? "md:ml-64" : "md:ml-0")}>
        <header className={cn("flex h-16 shrink-0 items-center justify-between border-b bg-white px-4 shadow-sm md:px-8", isDirector && "bg-[#140c07] text-white md:bg-white md:text-foreground")}>
          <div className="flex min-w-0 items-center gap-4">
            <button type="button" onClick={() => setSidebarOpen((current) => !current)} aria-label="Toggle sidebar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input">
              <Menu className="h-4 w-4" />
            </button>
            {isDirector && <p className="truncate text-xs font-black uppercase tracking-widest md:hidden">{directorCurrentLabel}</p>}
            <div className="relative hidden w-full max-w-sm md:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search resources..." className="h-9 border-none bg-muted/50 pl-10" />
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-6">
            {shift && <Badge variant="outline" className="border-primary text-primary"><Clock className="mr-1 h-3 w-3" />{shift}</Badge>}
            <div className="hidden items-center gap-3 text-muted-foreground md:flex"><SyncStatusIndicator /><Bell className="h-5 w-5" /></div>
            <div className="flex items-center gap-3 border-l pl-3 md:pl-6">
              <div className="hidden text-right sm:block"><p className="text-xs font-bold">{activeUsername || role}</p><p className="text-[10px] uppercase text-muted-foreground">{role}</p></div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-white"><User className="h-5 w-5" /></div>
              <Button type="button" variant="outline" className="hidden h-9 text-[10px] font-black uppercase md:inline-flex" onClick={() => { setUsernameDraft(activeUsername || role); setUsernameDialogOpen(true); }}>Change Username</Button>
            </div>
          </div>
        </header>

        <main className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:p-8", isDirector && "pb-24 md:pb-8")}>{children}</main>
      </div>

      {isDirector && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#140c07]/95 px-3 pb-3 pt-2 text-white backdrop-blur md:hidden">
          <div className="grid grid-cols-6 gap-1">
            {DIRECTOR_MOBILE_NAV.map((item) => {
              const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
              return <button key={item.href} type="button" onClick={() => router.push(item.href)} className={cn("flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-black uppercase text-white/60", active && "bg-[#cf9c43] text-[#140c07]")}><item.icon className="h-4 w-4" />{item.label}</button>;
            })}
          </div>
        </nav>
      )}

      <Dialog open={usernameDialogOpen} onOpenChange={setUsernameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Change Username</DialogTitle><DialogDescription>Update the username for the current account.</DialogDescription></DialogHeader>
          <Input value={usernameDraft} onChange={(event) => setUsernameDraft(event.target.value)} placeholder="Enter new username" />
          {usernameFeedback && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{usernameFeedback}</p>}
          <DialogFooter><Button variant="outline" onClick={() => setUsernameDialogOpen(false)} disabled={usernameSaving}>Cancel</Button><Button onClick={() => void saveUsername()} disabled={!usernameDraft.trim() || usernameSaving}>{usernameSaving ? "Saving..." : "Update Username"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
