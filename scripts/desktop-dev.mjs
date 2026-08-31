import { spawn } from "node:child_process";
import electronPath from "electron";

const rendererUrl = "http://127.0.0.1:3000";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const nextProcess = spawn(npmCommand, ["run", "dev"], {
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
      // Next.js is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next.js did not become available at ${rendererUrl}.`);
}

function stopNext() {
  if (!nextProcess.killed) nextProcess.kill("SIGTERM");
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
    stopNext();
    process.exitCode = code ?? 0;
  });
} catch (error) {
  stopNext();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

process.on("SIGINT", stopNext);
process.on("SIGTERM", stopNext);
