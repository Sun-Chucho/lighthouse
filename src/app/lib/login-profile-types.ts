import type { Role } from "@/app/lib/mock-data";

export const STORAGE_LOGIN_PROFILES = "lighthouse-login-profiles";
export const STORAGE_ACTIVE_USERNAME = "lighthouse-username";
export const SESSION_IDENTITY_EVENT = "lighthouse-session-identity-updated";
export const DEFAULT_LOGIN_PASSWORD = "1234";
export const MANAGER_LOGIN_PASSWORD = "4321";
export const MANAGER_SESSION_VERSION = "manager-password-4321-v1";
export const STORAGE_MANAGER_SESSION_VERSION = "lighthouse-manager-session-version";

export interface LoginUserAccount {
  username: string;
  password?: string;
  blocked?: boolean;
  updatedAt: number;
}

export interface LoginProfileEntry {
  username: string;
  password?: string;
  shift?: "day" | "night";
  users?: LoginUserAccount[];
  updatedAt: number;
}

export type LoginProfiles = Partial<Record<Role, LoginProfileEntry>>;
