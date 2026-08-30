import type { StaffSession } from "../context/auth-context";

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
  storeVerifiedSession: (session: StaffSession) => Promise<boolean>;
  loadVerifiedSession: () => Promise<StaffSession | null>;
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
