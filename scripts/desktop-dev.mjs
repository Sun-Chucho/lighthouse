import { spawn } from "node:child_process";
import electronPath from "electron";

const rendererUrl = "http://127.0.0.1:3000";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const viteProcess = spawn(npmCommand, ["run", "dev"], {
  stdio: "inherit",
  env: process.env,
});

async function waitForRenderer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(rendererUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not become available at ${rendererUrl}.`);
}

function stopVite() {
  if (!viteProcess.killed) viteProcess.kill("SIGTERM");
}

try {
  await waitForRenderer();
  const electronEnvironment = { ...process.env, ELECTRON_RENDERER_URL: rendererUrl };
  delete electronEnvironment.ELECTRON_RUN_AS_NODE;
  const electronProcess = spawn(electronPath, ["."], {
    stdio: "inherit",
    env: electronEnvironment,
  });

  electronProcess.on("exit", (code) => {
    stopVite();
    process.exitCode = code ?? 0;
  });
} catch (error) {
  stopVite();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

process.on("SIGINT", stopVite);
process.on("SIGTERM", stopVite);
