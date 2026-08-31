import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, resolve, sep } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const stagingRoot = resolve(repositoryRoot, ".desktop-package");

if (basename(stagingRoot) !== ".desktop-package" || !stagingRoot.startsWith(`${repositoryRoot}${sep}`)) {
  throw new Error("Refusing to prepare an unexpected desktop staging directory.");
}

const sourcePackage = JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8"));
const installedUpdater = JSON.parse(await readFile(resolve(repositoryRoot, "node_modules", "electron-updater", "package.json"), "utf8"));
const installedElectron = JSON.parse(await readFile(resolve(repositoryRoot, "node_modules", "electron", "package.json"), "utf8"));

await rm(stagingRoot, { recursive: true, force: true });
await mkdir(resolve(stagingRoot, "build"), { recursive: true });

await Promise.all([
  cp(resolve(repositoryRoot, "electron", "main.mjs"), resolve(stagingRoot, "main.mjs")),
  cp(resolve(repositoryRoot, "electron", "preload.cjs"), resolve(stagingRoot, "preload.cjs")),
  cp(resolve(repositoryRoot, "build", "icon.png"), resolve(stagingRoot, "build", "icon.png")),
]);

const desktopPackage = {
  name: "lighthouse-desktop-shell",
  version: sourcePackage.version,
  productName: sourcePackage.productName,
  description: sourcePackage.description,
  author: sourcePackage.author,
  private: true,
  main: "main.mjs",
  dependencies: {
    "electron-updater": installedUpdater.version,
  },
  build: {
    ...sourcePackage.build,
    electronVersion: installedElectron.version,
    directories: {
      output: resolve(repositoryRoot, "release"),
      buildResources: "build",
    },
    files: ["main.mjs", "preload.cjs", "package.json"],
    extraResources: [
      {
        from: resolve(repositoryRoot, ".next", "standalone"),
        to: "server",
      },
      {
        from: resolve(stagingRoot, "build", "icon.png"),
        to: "app-icon.png",
      },
    ],
  },
};

await writeFile(
  resolve(stagingRoot, "package.json"),
  `${JSON.stringify(desktopPackage, null, 2)}\n`,
  "utf8",
);

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm executable path is unavailable.");

await new Promise((resolveInstall, rejectInstall) => {
  const install = spawn(
    process.execPath,
    [npmCli, "install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
    { cwd: stagingRoot, stdio: "inherit", windowsHide: true },
  );
  install.once("error", rejectInstall);
  install.once("exit", (code) => code === 0
    ? resolveInstall()
    : rejectInstall(new Error(`Desktop dependency installation failed (${code ?? "unknown"}).`)));
});

console.log(`Prepared minimal Lighthouse desktop bundle for Electron ${installedElectron.version}.`);
