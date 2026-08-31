"use client";

import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { normalizeRole } from "@/app/lib/auth";
import type { Role } from "@/app/lib/mock-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PasswordSettingsPage() {
  const [role, setRole] = useState<Role>("manager");

  useEffect(() => {
    setRole(normalizeRole(localStorage.getItem("lighthouse-role")) ?? "manager");
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight uppercase">Access Settings</h1>
        <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Central role-based access for Lighthouse staff
        </p>
      </header>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-tight">
            <ShieldCheck className="h-5 w-5 text-amber-600" /> Protected Role PIN
          </CardTitle>
          <CardDescription>Lighthouse uses a shared four-digit PIN for each operational role.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#28170d] text-[#e0b762]">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <p className="font-black uppercase tracking-tight">{role} access is centrally managed</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                No email address or personal username is required. Role PINs cannot be changed from a staff workstation.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
