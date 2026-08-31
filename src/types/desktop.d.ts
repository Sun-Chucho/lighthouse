import type { Role } from "../app/lib/mock-data";

export type DesktopStaffSession = {
  uid: string;
  displayName: string;
  role: Role;
};

export type DesktopUpdateStage =
  | "development"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "current"
  | "offline"
  | "error";

export type DesktopUpdateState = {
  stage: DesktopUpdateStage;
  detail: string;
};

export type LighthouseDesktopBridge = {
  isDesktop: true;
  platform: string;
  getVersion: () => Promise<string>;
  storeVerifiedSession: (session: DesktopStaffSession) => Promise<boolean>;
  loadVerifiedSession: () => Promise<DesktopStaffSession | null>;
  clearVerifiedSession: () => Promise<boolean>;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
  onUpdateState: (callback: (state: DesktopUpdateState) => void) => () => void;
};

declare global {
  interface Window {
    lighthouseDesktop?: LighthouseDesktopBridge;
  }
}

export {};
