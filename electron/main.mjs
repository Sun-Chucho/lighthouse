import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
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
let appIsQuitting = false;

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

async function readPreferredRendererPort() {
  const portFile = resolve(app.getPath("userData"), "renderer-port.txt");
  try {
    const savedPort = Number((await readFile(portFile, "utf8")).trim());
    if (Number.isInteger(savedPort) && savedPort >= 1024 && savedPort <= 65535) return savedPort;
  } catch {}

  try {
    const log = await readFile(startupLogPath(), "utf8");
    const matches = [...log.matchAll(/Starting bundled server at http:\/\/127\.0\.0\.1:(\d+)/g)];
    const previousPort = Number(matches.at(-1)?.[1]);
    if (Number.isInteger(previousPort) && previousPort >= 1024 && previousPort <= 65535) return previousPort;
  } catch {}

  return null;
}

function findRendererPort(preferredPort) {
  const tryPort = (port) => new Promise((resolvePort, rejectPort) => {
    const probe = createServer();
    probe.once("error", rejectPort);
    probe.listen(port, "127.0.0.1", () => {
      const address = probe.address();
      const selectedPort = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => error ? rejectPort(error) : resolvePort(selectedPort));
    });
  });

  return preferredPort
    ? tryPort(preferredPort).catch(() => tryPort(0))
    : tryPort(0);
}

async function waitForServer(origin) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1_000);
    try {
      const response = await net.fetch(`${origin}/staff`, {
        bypassCustomProtocolHandlers: true,
        signal: controller.signal,
      });
      if (response.ok) return;
    } catch {
      // The bundled Next.js server is still starting.
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error("The bundled Lighthouse server did not start.");
}

function startupLogPath() {
  return resolve(app.getPath("userData"), "startup.log");
}

function showStartupFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  const logPath = startupLogPath();
  console.error(error);
  if (mainWindow && !mainWindow.isDestroyed()) {
    const document = `<!doctype html><html><head><meta charset="utf-8"><style>html{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#140c07;color:#f7e7bd;font:16px/1.5 Segoe UI,sans-serif}.card{max-width:640px;margin:32px;padding:32px;border:1px solid #b98a3d;border-radius:18px;background:#21130c}h1{color:#e3bd6a;margin-top:0}code{word-break:break-all;color:#fff}</style></head><body><main class="card"><h1>Lighthouse could not start</h1><p>${escapeReceiptText(message)}</p><p>Close and reopen the application. If the problem continues, send this log file to support:</p><code>${escapeReceiptText(logPath)}</code></main></body></html>`;
    void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`);
  }
  dialog.showErrorBox(
    "Lighthouse startup error",
    `${message}\n\nDiagnostic log: ${logPath}`,
  );
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

  const preferredPort = await readPreferredRendererPort();
  const port = await findRendererPort(preferredPort);
  localOrigin = `http://127.0.0.1:${port}`;
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(resolve(app.getPath("userData"), "renderer-port.txt"), String(port), "utf8");
  const serverLog = createWriteStream(startupLogPath(), { flags: "a" });
  serverLog.write(`\n[${new Date().toISOString()}] Starting bundled server at ${localOrigin}\n`);
  const runtimeModules = resolve(serverRoot, app.isPackaged ? "runtime" : "node_modules");
  const inheritedNodePath = process.env.NODE_PATH?.trim();
  localServer = spawn(process.execPath, [serverEntry], {
    cwd: serverRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "production",
      NODE_PATH: inheritedNodePath
        ? `${runtimeModules}${delimiter}${inheritedNodePath}`
        : runtimeModules,
    },
    stdio: app.isPackaged ? ["ignore", "pipe", "pipe"] : "inherit",
    windowsHide: true,
  });
  const startedServer = localServer;
  let serverIsReady = false;
  if (app.isPackaged) {
    startedServer.stdout?.pipe(serverLog, { end: false });
    startedServer.stderr?.pipe(serverLog, { end: false });
  }
  const serverExit = new Promise((_, reject) => {
    startedServer.once("error", reject);
    startedServer.once("exit", (code, signal) => {
      serverLog.write(`[${new Date().toISOString()}] Server exited (code=${code ?? "none"}, signal=${signal ?? "none"}).\n`);
      serverLog.end();
      if (localServer === startedServer) localServer = null;
      if (serverIsReady && !appIsQuitting) {
        showStartupFailure(new Error(`The bundled Lighthouse server stopped unexpectedly (code ${code ?? "unknown"}).`));
      }
      reject(new Error(`The bundled Lighthouse server stopped during startup (code ${code ?? "unknown"}).`));
    });
  });
  await Promise.race([waitForServer(localOrigin), serverExit]);
  serverIsReady = true;
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
  ipcMain.handle("desktop:authenticate-staff", async (event, role, password) => {
    assertTrustedSender(event);
    if (
      !["manager", "director", "inventory", "cashier", "kitchen", "barista"].includes(role)
      || typeof password !== "string"
      || password.length > 32
    ) {
      throw new Error("Invalid staff authentication request.");
    }

    const response = await net.fetch("https://www.lighthousemoshi.com/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, password }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.token !== "string") {
      throw new Error(typeof payload.error === "string" ? payload.error : "Cloud role verification failed.");
    }
    return payload.token;
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

async function createWindow(origin = null) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1040,
    minHeight: 700,
    show: true,
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

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isTrustedRendererUrl(url) || url.startsWith("data:text/html")) return;
    event.preventDefault();
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
  });
  if (origin) await mainWindow.loadURL(`${origin}/staff`);
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
    await createWindow();
    const origin = await startBundledServer();
    await mainWindow?.loadURL(`${origin}/staff`);
    configureUpdater();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow(origin);
    });
  }).catch((error) => {
    showStartupFailure(error);
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  appIsQuitting = true;
  if (updateInterval) clearInterval(updateInterval);
  if (localServer) localServer.kill();
});
