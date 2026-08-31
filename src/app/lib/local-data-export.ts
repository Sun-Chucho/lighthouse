const LIGHTHOUSE_EXPORT_FORMAT = "lighthouse-local-business-data";
const LIGHTHOUSE_EXPORT_VERSION = 1;

const PRIVATE_KEY_FRAGMENTS = [
  "login-profiles",
  "manager-session-version",
  "password",
  "server-sync-etag",
] as const;

const PRIVATE_KEYS = new Set([
  "lighthouse-role",
  "lighthouse-username",
]);

type ExportSaveResult = "saved" | "downloaded" | "cancelled";

interface FileSystemWritableFileStreamLike {
  close(): Promise<void>;
  write(data: Blob): Promise<void>;
}

interface FileSystemFileHandleLike {
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
}

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<FileSystemFileHandleLike>;
}

export interface LighthouseLocalDataExport {
  format: typeof LIGHTHOUSE_EXPORT_FORMAT;
  version: typeof LIGHTHOUSE_EXPORT_VERSION;
  exportedAt: string;
  source: {
    origin: string;
    role: string;
    username: string;
    online: boolean;
  };
  summary: {
    dataKeyCount: number;
    pendingSyncCount: number;
  };
  data: Record<string, unknown>;
  pendingSync: Record<string, string>;
}

function isPrivateKey(key: string) {
  const normalizedKey = key.toLowerCase();
  return PRIVATE_KEYS.has(normalizedKey) || PRIVATE_KEY_FRAGMENTS.some((fragment) => normalizedKey.includes(fragment));
}

function isPendingSyncKey(key: string) {
  return key.startsWith("lighthouse-pending-sync:");
}

function isLighthouseBusinessDataKey(key: string) {
  if (isPrivateKey(key) || isPendingSyncKey(key)) return false;
  return key.startsWith("lighthouse-v1:lighthouse-") || key.startsWith("lighthouse-");
}

function parseStoredValue(rawValue: string) {
  try {
    return JSON.parse(rawValue) as unknown;
  } catch {
    return rawValue;
  }
}

function sanitizeFilenamePart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "user";
}

export function buildLighthouseLocalDataExport(storage: Storage): LighthouseLocalDataExport {
  const data: Record<string, unknown> = {};
  const pendingSync: Record<string, string> = {};

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;

    const rawValue = storage.getItem(key);
    if (rawValue === null) continue;

    if (isPendingSyncKey(key)) {
      pendingSync[key] = rawValue;
      continue;
    }

    if (isLighthouseBusinessDataKey(key)) {
      data[key] = parseStoredValue(rawValue);
    }
  }

  return {
    format: LIGHTHOUSE_EXPORT_FORMAT,
    version: LIGHTHOUSE_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    source: {
      origin: window.location.origin,
      role: storage.getItem("lighthouse-role") || "unknown",
      username: storage.getItem("lighthouse-username") || "unknown",
      online: window.navigator.onLine,
    },
    summary: {
      dataKeyCount: Object.keys(data).length,
      pendingSyncCount: Object.keys(pendingSync).length,
    },
    data,
    pendingSync,
  };
}

export function getLighthouseExportFilename(payload: LighthouseLocalDataExport) {
  const timestamp = payload.exportedAt.replace(/[:.]/g, "-");
  return `Lighthouse-${sanitizeFilenamePart(payload.source.role)}-data-${timestamp}.json`;
}

export async function exportLighthouseLocalData(): Promise<ExportSaveResult> {
  const payload = buildLighthouseLocalDataExport(window.localStorage);
  const filename = getLighthouseExportFilename(payload);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const pickerWindow = window as SaveFilePickerWindow;

  if (typeof pickerWindow.showSaveFilePicker === "function") {
    try {
      const fileHandle = await pickerWindow.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "Lighthouse data backup",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // If the File System Access API is unavailable or blocked, use a normal
      // browser download so the local recovery copy is still created.
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  return "downloaded";
}
