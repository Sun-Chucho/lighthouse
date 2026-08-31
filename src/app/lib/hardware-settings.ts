export type HardwareLane = "kitchen" | "barista";

export interface HardwareLaneSettings {
  printerName: string;
  autoPrintReceipt: boolean;
  openDrawerOnSale: boolean;
}

export interface HardwareSettings {
  kitchen: HardwareLaneSettings;
  barista: HardwareLaneSettings;
}

export const STORAGE_HARDWARE_SETTINGS = "lighthouse-hardware-settings";

export const DEFAULT_HARDWARE_SETTINGS: HardwareSettings = {
  kitchen: {
    printerName: "",
    autoPrintReceipt: false,
    openDrawerOnSale: false,
  },
  barista: {
    printerName: "",
    autoPrintReceipt: false,
    openDrawerOnSale: false,
  },
};
