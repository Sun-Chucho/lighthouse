"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/context/auth-context";
import { SyncProvider } from "@/context/sync-context";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SyncProvider>{children}</SyncProvider>
    </AuthProvider>
  );
}
