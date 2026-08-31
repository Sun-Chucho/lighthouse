"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_HARDWARE_SETTINGS,
  HardwareLane,
  HardwareSettings,
  STORAGE_HARDWARE_SETTINGS,
} from "@/app/lib/hardware-settings";
import { readJson, writeJson } from "@/app/lib/storage";
import { listSystemPrinters } from "@/app/lib/receipt-print";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Bell,
  CreditCard,
  Printer,
  Save,
  Settings,
  Shield,
  User,
} from "lucide-react";
import { useIsDirector } from "@/hooks/use-is-director";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { subscribeToSyncedStorageKey } from "@/app/lib/firebase-sync";
import { normalizeRole } from "@/app/lib/auth";
import { Role } from "@/app/lib/mock-data";
import {
  readActiveSessionUsername,
  STORAGE_LOGIN_PROFILES,
  subscribeToSessionIdentity,
} from "@/app/lib/login-profiles";

type SettingsSection = "profile" | "notifications" | "security" | "general" | "billing" | "hardware";

interface AppSettings {
  fullName: string;
  email: string;
  department: string;
  notificationsRealtime: boolean;
  notificationsEmailDigest: boolean;
  analyticsAdvanced: boolean;
  requirePinForCheckout: boolean;
  autoLockMinutes: number;
  currency: "TSh" | "USD";
  timezone: string;
}

const STORAGE_KEY = "lighthouse-settings";

const DEFAULT_SETTINGS: AppSettings = {
  fullName: "",
  email: "",
  department: "Lodge Operations",
  notificationsRealtime: true,
  notificationsEmailDigest: true,
  analyticsAdvanced: false,
  requirePinForCheckout: true,
  autoLockMinutes: 15,
  currency: "TSh",
  timezone: "Africa/Dar_es_Salaam",
};

const FALLBACK_PRINTERS = [
  "Generic / Text Only",
  "POS-80 Printer",
  "POS-58 Printer",
  "Kitchen Printer",
  "Barista Printer",
];

export default function SettingsPage() {
  const router = useRouter();
  const isDirector = useIsDirector();
  const { confirm, dialog } = useConfirmDialog();
  const [section, setSection] = useState<SettingsSection>("profile");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [hardwareSettings, setHardwareSettings] = useState<HardwareSettings>(DEFAULT_HARDWARE_SETTINGS);
  const [printerNames, setPrinterNames] = useState<string[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [role, setRole] = useState<Role>("manager");
  const [activeUsername, setActiveUsername] = useState("");

  useEffect(() => {
    const applySettingsSnapshot = (value?: Partial<AppSettings> | null) => {
      const parsed = value ?? readJson<Partial<AppSettings>>(STORAGE_KEY);
      if (!parsed) {
        setSettings(DEFAULT_SETTINGS);
        return;
      }

      try {
        setSettings((current) => ({ ...current, ...parsed }));
      } catch {
        setSettings(DEFAULT_SETTINGS);
      }
    };

    const applyHardwareSnapshot = (value?: Partial<HardwareSettings> | null) => {
      const parsed = value ?? readJson<Partial<HardwareSettings>>(STORAGE_HARDWARE_SETTINGS);
      if (!parsed) {
        setHardwareSettings(DEFAULT_HARDWARE_SETTINGS);
        return;
      }

      try {
        setHardwareSettings({
          kitchen: { ...DEFAULT_HARDWARE_SETTINGS.kitchen, ...parsed.kitchen },
          barista: { ...DEFAULT_HARDWARE_SETTINGS.barista, ...parsed.barista },
        });
      } catch {
        setHardwareSettings(DEFAULT_HARDWARE_SETTINGS);
      }
    };

    applySettingsSnapshot();
    applyHardwareSnapshot();

    const unsubscribeSettings = subscribeToSyncedStorageKey<Partial<AppSettings>>(STORAGE_KEY, applySettingsSnapshot);
    const unsubscribeHardware = subscribeToSyncedStorageKey<Partial<HardwareSettings>>(STORAGE_HARDWARE_SETTINGS, applyHardwareSnapshot);

    return () => {
      unsubscribeSettings();
      unsubscribeHardware();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const applySession = () => {
      const storedRole = normalizeRole(localStorage.getItem("lighthouse-role")) ?? "manager";
      const sessionUsername = readActiveSessionUsername(storedRole);
      setRole(storedRole);
      setActiveUsername(sessionUsername);
    };

    const handleProfilesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key !== STORAGE_LOGIN_PROFILES) return;
      applySession();
    };

    applySession();
    const unsubscribeSession = subscribeToSessionIdentity(applySession);
    window.addEventListener("lighthouse-storage-updated", handleProfilesUpdated as EventListener);

    return () => {
      unsubscribeSession();
      window.removeEventListener("lighthouse-storage-updated", handleProfilesUpdated as EventListener);
    };
  }, []);

  const loadPrinters = async () => {
    setLoadingPrinters(true);
    const printers = await listSystemPrinters();
    setPrinterNames(printers);
    setLoadingPrinters(false);
  };

  useEffect(() => {
    void loadPrinters();
  }, []);

  const saveChanges = async () => {
    const approved = await confirm({
      title: "Save Settings",
      description: isDirector
        ? "Are you sure you want to save your MD profile details?"
        : "Are you sure you want to save these system and hardware settings?",
      actionLabel: "Save Changes",
    });
    if (!approved) return;
    writeJson(STORAGE_KEY, settings);
    if (!isDirector) {
      writeJson(STORAGE_HARDWARE_SETTINGS, hardwareSettings);
    }
    setSavedAt(Date.now());
  };

  const resetDefaults = async () => {
    if (isDirector) return;
    const approved = await confirm({
      title: "Reset Settings",
      description: "Are you sure you want to reset the current settings form back to defaults?",
      actionLabel: "Reset",
    });
    if (!approved) return;
    setSettings(DEFAULT_SETTINGS);
    setHardwareSettings(DEFAULT_HARDWARE_SETTINGS);
  };

  const savedLabel = useMemo(() => {
    if (!savedAt) return "Not saved yet";
    return `Saved ${Math.max(0, Math.floor((Date.now() - savedAt) / 1000))}s ago`;
  }, [savedAt]);

  const updateHardwareLane = (lane: HardwareLane, next: Partial<HardwareSettings[HardwareLane]>) => {
    setHardwareSettings((current) => ({
      ...current,
      [lane]: { ...current[lane], ...next },
    }));
  };

  const selectablePrinters = useMemo(() => {
    const currentSelections = [hardwareSettings.kitchen.printerName, hardwareSettings.barista.printerName].filter(Boolean);
    return Array.from(new Set([...printerNames, ...currentSelections, ...FALLBACK_PRINTERS]));
  }, [hardwareSettings.barista.printerName, hardwareSettings.kitchen.printerName, printerNames]);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {dialog}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">System Settings</h1>
          <p className="text-muted-foreground text-sm uppercase font-bold tracking-wider">Configure your preferences and workspace</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="font-bold px-6 h-12" onClick={resetDefaults}>
            {isDirector ? "Read Only" : "Reset"}
          </Button>
          <Button className="bg-primary hover:bg-primary/90 font-bold px-8 h-12 shadow-lg shadow-primary/20" onClick={saveChanges}>
            <Save className="w-4 h-4 mr-2" /> Save Changes
          </Button>
        </div>
      </header>

      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">{savedLabel}</p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-1 space-y-2">
          {[
            { id: "profile", label: "Profile", icon: User },
            { id: "notifications", label: "Notifications", icon: Bell },
            { id: "security", label: "Security", icon: Shield },
            { id: "general", label: "General", icon: Settings },
            { id: "billing", label: "Billing", icon: CreditCard },
            { id: "hardware", label: "Hardware", icon: Printer },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id as SettingsSection)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                section === item.id ? "bg-primary text-white shadow-md" : "hover:bg-muted text-muted-foreground"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </div>

        <div className="md:col-span-3 space-y-6">
          {section === "profile" && (
            <Card className="border-none shadow-sm">
              <CardHeader className="bg-muted/30 border-b">
                <CardTitle className="text-xl font-black">Account Information</CardTitle>
                <CardDescription>Manage profile details shown in the dashboard.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-bold uppercase text-[10px] tracking-widest opacity-60">Full Name</Label>
                    <Input value={settings.fullName} onChange={(event) => setSettings((current) => ({ ...current, fullName: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold uppercase text-[10px] tracking-widest opacity-60">Email Address</Label>
                    <Input value={settings.email} onChange={(event) => setSettings((current) => ({ ...current, email: event.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold uppercase text-[10px] tracking-widest opacity-60">Work Department</Label>
                  <Input value={settings.department} onChange={(event) => setSettings((current) => ({ ...current, department: event.target.value }))} />
                </div>
              </CardContent>
            </Card>
          )}

          {section === "profile" && (
            <Card className="border-none shadow-sm">
              <CardHeader className="bg-muted/30 border-b">
                <CardTitle className="text-xl font-black">Login Account</CardTitle>
                <CardDescription>View the centrally managed role used for this session.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-5">
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Current Account</p>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xl font-black">{activeUsername || role}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{role}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-800">Role PIN Policy</p>
                  <p className="mt-2 text-sm font-bold leading-6 text-muted-foreground">
                    Staff sign in by selecting a role and entering its centrally managed four-digit PIN. No email or personal username is required, and role PINs cannot be changed from this screen.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {section === "notifications" && (
            <Card className="border-none shadow-sm">
              <CardHeader className="bg-muted/30 border-b">
                <CardTitle className="text-xl font-black">Notifications</CardTitle>
                <CardDescription>Control communication preferences for operations updates.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20">
                  <div className="space-y-0.5">
                    <Label className="text-base font-bold">Real-time Notifications</Label>
                    <p className="text-xs text-muted-foreground">Receive instant alerts for new orders and check-ins.</p>
                  </div>
                  <Switch checked={settings.notificationsRealtime} onCheckedChange={(checked) => setSettings((current) => ({ ...current, notificationsRealtime: checked }))} disabled={isDirector} />
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20">
                  <div className="space-y-0.5">
                    <Label className="text-base font-bold">Email Digest</Label>
                    <p className="text-xs text-muted-foreground">Receive a daily operational summary at end of shift.</p>
                  </div>
                  <Switch checked={settings.notificationsEmailDigest} onCheckedChange={(checked) => setSettings((current) => ({ ...current, notificationsEmailDigest: checked }))} disabled={isDirector} />
                </div>
              </CardContent>
            </Card>
          )}

          {section === "security" && (
            <Card className="border-none shadow-sm">
              <CardHeader className="bg-muted/30 border-b">
                <CardTitle className="text-xl font-black">Security</CardTitle>
                <CardDescription>Define validation and lock policies.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20">
                  <div className="space-y-0.5">
                    <Label className="text-base font-bold">Require PIN for Checkout</Label>
                    <p className="text-xs text-muted-foreground">Prompt cashier PIN before completing a payment.</p>
                  </div>
                  <Switch checked={settings.requirePinForCheckout} onCheckedChange={(checked) => setSettings((current) => ({ ...current, requirePinForCheckout: checked }))} disabled={isDirector} />
                </div>
                <div className="space-y-2">
                  <Label className="font-bold uppercase text-[10px] tracking-widest opacity-60">Auto-Lock Minutes</Label>
                  <Input
                    type="number"
                    min="1"
                    value={settings.autoLockMinutes}
                    onChange={(event) => setSettings((current) => ({ ...current, autoLockMinutes: Math.max(1, Number(event.target.value) || 1) }))}
                    disabled={isDirector}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {section === "general" && (
            <Card className="border-none shadow-sm">
              <CardHeader className="bg-muted/30 border-b">
                <CardTitle className="text-xl font-black">General Preferences</CardTitle>
                <CardDescription>Workspace options used across dashboards.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20">
                  <div className="space-y-0.5">
                    <Label className="text-base font-bold">Advanced Analytics</Label>
                    <p className="text-xs text-muted-foreground">Display additional trend charts and KPIs.</p>
                  </div>
                  <Switch checked={settings.analyticsAdvanced} onCheckedChange={(checked) => setSettings((current) => ({ ...current, analyticsAdvanced: checked }))} disabled={isDirector} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-bold uppercase text-[10px] tracking-widest opacity-60">Currency</Label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={settings.currency}
                      onChange={(event) => setSettings((current) => ({ ...current, currency: event.target.value as AppSettings["currency"] }))}
                      disabled={isDirector}
                    >
                      <option value="TSh">TSh</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold uppercase text-[10px] tracking-widest opacity-60">Timezone</Label>
                    <Input value={settings.timezone} onChange={(event) => setSettings((current) => ({ ...current, timezone: event.target.value }))} disabled={isDirector} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {section === "billing" && (
            <Card className="border-none shadow-sm">
              <CardHeader className="bg-muted/30 border-b">
                <CardTitle className="text-xl font-black">Billing Preferences</CardTitle>
                <CardDescription>Configure statement and settlement defaults.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <p className="text-sm text-muted-foreground">Billing controls are configured per role. Use the cashier and manager modules for transaction operations.</p>
                <Button variant="outline" className="font-bold" onClick={() => router.push("/dashboard/payments")}>
                  View Recent Settlements
                </Button>
              </CardContent>
            </Card>
          )}

          {section === "hardware" && (
            <Card className="border-none shadow-sm">
              <CardHeader className="bg-muted/30 border-b">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl font-black">POS Hardware</CardTitle>
                    <CardDescription>Configure raw receipt printing and cash drawer actions for kitchen and barista.</CardDescription>
                  </div>
                  <Button variant="outline" className="font-bold" onClick={() => void loadPrinters()} disabled={loadingPrinters}>
                    {loadingPrinters ? "Loading Printers..." : "Refresh Printers"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {(["kitchen", "barista"] as HardwareLane[]).map((lane) => (
                  <div key={lane} className="rounded-2xl border p-5 space-y-4">
                    <div>
                      <h3 className="text-lg font-black uppercase tracking-tight">{lane}</h3>
                      <p className="text-xs text-muted-foreground">
                        Select the POS printer installed on this machine and control receipt and drawer behavior.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="font-bold uppercase text-[10px] tracking-widest opacity-60">Printer</Label>
                      <select
                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={hardwareSettings[lane].printerName}
                        onChange={(event) => updateHardwareLane(lane, { printerName: event.target.value })}
                        disabled={isDirector}
                      >
                        <option value="">Select system printer</option>
                        {selectablePrinters.map((printer) => (
                          <option key={`${lane}-${printer}`} value={printer}>
                            {printer}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={hardwareSettings[lane].printerName}
                        onChange={(event) => updateHardwareLane(lane, { printerName: event.target.value })}
                        placeholder="Or type printer name manually"
                        disabled={isDirector}
                      />
                      {printerNames.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No system printers were returned automatically. Choose a fallback printer above or type the exact Windows printer name manually.
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20">
                      <div className="space-y-0.5">
                        <Label className="text-base font-bold">Auto Print Receipt</Label>
                        <p className="text-xs text-muted-foreground">
                          Send two formatted ESC/POS raw receipts after each sale: one customer copy and one receptionist/bartender copy.
                        </p>
                      </div>
                      <Switch
                        checked={hardwareSettings[lane].autoPrintReceipt}
                        onCheckedChange={(checked) => updateHardwareLane(lane, { autoPrintReceipt: checked })}
                        disabled={isDirector}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20">
                      <div className="space-y-0.5">
                        <Label className="text-base font-bold">Open Cash Drawer</Label>
                        <p className="text-xs text-muted-foreground">Send the cash drawer pulse together with the receipt print job.</p>
                      </div>
                      <Switch
                        checked={hardwareSettings[lane].openDrawerOnSale}
                        onCheckedChange={(checked) => updateHardwareLane(lane, { openDrawerOnSale: checked })}
                        disabled={isDirector}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
