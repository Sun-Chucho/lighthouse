export {};

declare global {
  interface Window {
    lighthouseHardware?: {
      listPrinters?: () => Promise<string[]>;
      printRaw?: (job: {
        printerName: string;
        content: string;
        openDrawer?: boolean;
      }) => Promise<{ ok: boolean; error?: string }>;
    };
  }
}
