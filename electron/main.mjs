import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  net,
  safeStorage,
  session,
  shell,
} from "electron";
import updater from "electron-updater";

const { autoUpdater } = updater;
const applicationId = "tz.co.lighthouse.lodge";
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDirectory, "..");
const developmentOrigin = process.env.ELECTRON_RENDERER_URL
  ? new URL(process.env.ELECTRON_RENDERER_URL).origin
  : null;

let mainWindow = null;
let localServer = null;
let localOrigin = developmentOrigin;
let updateInterval = null;

app.setAppUserModelId(applicationId);

function isTrustedRendererUrl(value) {
  try {
    const url = new URL(value);
    return localOrigin !== null && url.origin === localOrigin;
  } catch {
    return false;
  }
}

function assertTrustedSender(event) {
  if (!isTrustedRendererUrl(event.senderFrame.url)) {
    throw new Error("Untrusted desktop IPC sender.");
  }
}

function isSafeSession(value) {
  return Boolean(
    value
      && typeof value === "object"
      && typeof value.uid === "string"
      && typeof value.displayName === "string"
      && ["manager", "director", "inventory", "cashier", "kitchen", "barista"].includes(value.role),
  );
}

function sessionFilePath() {
  return resolve(app.getPath("userData"), "verified-staff-session.bin");
}

function escapeReceiptText(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function findAvailablePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

async function waitForServer(origin) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await net.fetch(`${origin}/staff`, { bypassCustomProtocolHandlers: true });
      if (response.ok) return;
    } catch {
      // The bundled Next.js server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error("The bundled Lighthouse server did not start.");
}

async function startBundledServer() {
  if (developmentOrigin) return developmentOrigin;

  const serverRoot = app.isPackaged
    ? resolve(process.resourcesPath, "server")
    : resolve(repositoryRoot, ".next", "standalone");
  const serverEntry = resolve(serverRoot, "server.js");
  if (!existsSync(serverEntry)) {
    throw new Error(`Lighthouse server bundle was not found at ${serverEntry}.`);
  }

  const port = await findAvailablePort();
  localOrigin = `http://127.0.0.1:${port}`;
  localServer = spawn(process.execPath, [serverEntry], {
    cwd: serverRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "production",
    },
    stdio: app.isPackaged ? "ignore" : "inherit",
    windowsHide: true,
  });
  localServer.once("exit", () => {
    localServer = null;
  });
  await waitForServer(localOrigin);
  return localOrigin;
}

function sendUpdateState(stage, detail = "") {
  if (!mainWindow?.isDestroyed()) {
    mainWindow.webContents.send("desktop:update-state", { stage, detail });
  }
}

function configureUpdater() {
  if (!app.isPackaged) {
    sendUpdateState("development", "Automatic updates are active in installed builds.");
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = console;
  autoUpdater.on("checking-for-update", () => sendUpdateState("checking"));
  autoUpdater.on("update-available", (info) => sendUpdateState("available", info.version));
  autoUpdater.on("update-not-available", () => sendUpdateState("current", app.getVersion()));
  autoUpdater.on("download-progress", (progress) => sendUpdateState("downloading", `${Math.round(progress.percent)}%`));
  autoUpdater.on("update-downloaded", (info) => sendUpdateState("downloaded", info.version));
  autoUpdater.on("error", (error) => sendUpdateState("error", error.message));

  const checkForUpdates = () => {
    if (!net.isOnline()) {
      sendUpdateState("offline", "Update check will retry when connected.");
      return;
    }
    void autoUpdater.checkForUpdates().catch((error) => sendUpdateState("error", error.message));
  };

  setTimeout(checkForUpdates, 10_000);
  updateInterval = setInterval(checkForUpdates, 4 * 60 * 60 * 1_000);
  ipcMain.handle("desktop:check-for-updates", (event) => {
    assertTrustedSender(event);
    checkForUpdates();
  });
  ipcMain.handle("desktop:install-update", (event) => {
    assertTrustedSender(event);
    autoUpdater.quitAndInstall(false, true);
  });
}

function registerDesktopIpc() {
  ipcMain.handle("desktop:get-version", (event) => {
    assertTrustedSender(event);
    return app.getVersion();
  });
  ipcMain.handle("desktop:store-session", async (event, staffSession) => {
    assertTrustedSender(event);
    if (!isSafeSession(staffSession) || !safeStorage.isEncryptionAvailable()) return false;
    await mkdir(app.getPath("userData"), { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(staffSession)).toString("base64");
    await writeFile(sessionFilePath(), encrypted, "utf8");
    return true;
  });
  ipcMain.handle("desktop:load-session", async (event) => {
    assertTrustedSender(event);
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      const encrypted = await readFile(sessionFilePath(), "utf8");
      const value = JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, "base64")));
      return isSafeSession(value) ? value : null;
    } catch {
      return null;
    }
  });
  ipcMain.handle("desktop:clear-session", async (event) => {
    assertTrustedSender(event);
    await rm(sessionFilePath(), { force: true });
    return true;
  });
  ipcMain.handle("hardware:list-printers", async (event) => {
    assertTrustedSender(event);
    const printers = await event.sender.getPrintersAsync();
    return printers.map((printer) => printer.displayName || printer.name);
  });
  ipcMain.handle("hardware:print-receipt", async (event, job) => {
    assertTrustedSender(event);
    if (
      !job
      || typeof job !== "object"
      || typeof job.printerName !== "string"
      || typeof job.content !== "string"
      || job.content.length > 100_000
    ) {
      return { ok: false, error: "Invalid receipt print job." };
    }

    const printers = await event.sender.getPrintersAsync();
    const printer = printers.find((candidate) =>
      candidate.name === job.printerName || candidate.displayName === job.printerName,
    );
    if (!printer) return { ok: false, error: "Selected printer is unavailable." };

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    const printableContent = job.content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
    const document = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:80mm auto;margin:4mm}html,body{margin:0;color:#000;background:#fff}pre{white-space:pre-wrap;font:12px/1.35 Consolas,monospace}</style></head><body><pre>${escapeReceiptText(printableContent)}</pre></body></html>`;

    try {
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`);
      const result = await new Promise((resolvePrint) => {
        printWindow.webContents.print(
          { silent: true, printBackground: false, deviceName: printer.name },
          (success, failureReason) => resolvePrint(success
            ? { ok: true }
            : { ok: false, error: failureReason || "Receipt printing failed." }),
        );
      });
      return result;
    } finally {
      if (!printWindow.isDestroyed()) printWindow.destroy();
    }
  });
}

async function createWindow(origin) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    backgroundColor: "#140c07",
    autoHideMenuBar: true,
    icon: app.isPackaged
      ? resolve(process.resourcesPath, "app-icon.png")
      : resolve(repositoryRoot, "build", "icon.png"),
    webPreferences: {
      preload: resolve(moduleDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isTrustedRendererUrl(url)) return;
    event.preventDefault();
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
  });
  await mainWindow.loadURL(`${origin}/staff`);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    registerDesktopIpc();
    const origin = await startBundledServer();
    await createWindow(origin);
    configureUpdater();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow(origin);
    });
  }).catch((error) => {
    console.error(error);
    app.quit();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (updateInterval) clearInterval(updateInterval);
  if (localServer) localServer.kill();
});
