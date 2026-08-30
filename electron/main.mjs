import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  net,
  protocol,
  safeStorage,
  session,
  shell,
} from "electron";
import updater from "electron-updater";

const { autoUpdater } = updater;
const applicationId = "tz.co.lighthouse.lodge";
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDirectory, "..");
const rendererRoot = resolve(repositoryRoot, "dist");
const rendererDevelopmentUrl = process.env.ELECTRON_RENDERER_URL;
const trustedDevelopmentOrigin = rendererDevelopmentUrl
  ? new URL(rendererDevelopmentUrl).origin
  : null;

let mainWindow = null;
let updateInterval = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "lighthouse",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

app.setAppUserModelId(applicationId);

function isTrustedRendererUrl(value) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "lighthouse:" && url.host === "app")
      || (trustedDevelopmentOrigin !== null && url.origin === trustedDevelopmentOrigin)
    );
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
      && typeof value.email === "string"
      && typeof value.displayName === "string"
      && ["manager", "director", "reception", "inventory", "kitchen", "bar"].includes(value.role),
  );
}

function sessionFilePath() {
  return resolve(app.getPath("userData"), "verified-staff-session.bin");
}

async function registerApplicationProtocol() {
  await protocol.handle("lighthouse", async (request) => {
    const requestUrl = new URL(request.url);
    const pathname = decodeURIComponent(requestUrl.pathname || "/");
    const requestedPath = extname(pathname)
      ? resolve(rendererRoot, `.${pathname}`)
      : resolve(rendererRoot, "index.html");
    const pathWithinRenderer = relative(rendererRoot, requestedPath);

    if (pathWithinRenderer.startsWith("..") || resolve(rendererRoot, pathWithinRenderer) !== requestedPath) {
      return new Response("Not found", { status: 404 });
    }

    const filePath = existsSync(requestedPath)
      ? requestedPath
      : resolve(rendererRoot, "index.html");
    return net.fetch(pathToFileURL(filePath).toString());
  });
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
  autoUpdater.on("download-progress", (progress) => {
    sendUpdateState("downloading", `${Math.round(progress.percent)}%`);
  });
  autoUpdater.on("update-downloaded", (info) => sendUpdateState("downloaded", info.version));
  autoUpdater.on("error", (error) => sendUpdateState("error", error.message));

  const checkForUpdates = () => {
    if (!net.isOnline()) {
      sendUpdateState("offline", "Update check will retry when connected.");
      return;
    }

    void autoUpdater.checkForUpdates().catch((error) => {
      sendUpdateState("error", error instanceof Error ? error.message : String(error));
    });
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
      const sessionValue = JSON.parse(
        safeStorage.decryptString(Buffer.from(encrypted, "base64")),
      );
      return isSafeSession(sessionValue) ? sessionValue : null;
    } catch {
      return null;
    }
  });

  ipcMain.handle("desktop:clear-session", async (event) => {
    assertTrustedSender(event);
    await rm(sessionFilePath(), { force: true });
    return true;
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    backgroundColor: "#140c07",
    autoHideMenuBar: true,
    icon: resolve(repositoryRoot, "build", "icon.png"),
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
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isTrustedRendererUrl(url)) return;
    event.preventDefault();
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
  });

  if (rendererDevelopmentUrl) {
    await mainWindow.loadURL(new URL("/staff", rendererDevelopmentUrl).toString());
  } else {
    await mainWindow.loadURL("lighthouse://app/staff");
  }
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
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });

    await registerApplicationProtocol();
    registerDesktopIpc();
    await createWindow();
    configureUpdater();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (updateInterval) clearInterval(updateInterval);
});
