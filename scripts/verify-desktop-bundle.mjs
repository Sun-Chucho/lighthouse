import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { delimiter, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const unpackedRoot = resolve(repositoryRoot, "release", "win-unpacked");
const executable = resolve(unpackedRoot, "Lighthouse Lodge.exe");
const serverRoot = resolve(unpackedRoot, "resources", "server");
const serverEntry = resolve(serverRoot, "server.js");
const runtimeModules = resolve(serverRoot, "runtime");

for (const requiredPath of [
  executable,
  serverEntry,
  resolve(runtimeModules, "next", "package.json"),
]) {
  if (!existsSync(requiredPath)) {
    throw new Error(`Packaged desktop runtime is incomplete: ${requiredPath}`);
  }
}

const port = await new Promise((resolvePort, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const address = probe.address();
    const availablePort = typeof address === "object" && address ? address.port : 0;
    probe.close((error) => error ? reject(error) : resolvePort(availablePort));
  });
});

const output = [];
const bundledServer = spawn(executable, [serverEntry], {
  cwd: serverRoot,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    NODE_ENV: "production",
    NODE_PATH: process.env.NODE_PATH
      ? `${runtimeModules}${delimiter}${process.env.NODE_PATH}`
      : runtimeModules,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

bundledServer.stdout.on("data", (chunk) => output.push(chunk.toString()));
bundledServer.stderr.on("data", (chunk) => output.push(chunk.toString()));

const exited = new Promise((_, reject) => {
  bundledServer.once("error", reject);
  bundledServer.once("exit", (code, signal) => {
    reject(new Error(
      `Packaged server exited before verification completed (code=${code ?? "none"}, signal=${signal ?? "none"}).\n${output.join("")}`,
    ));
  });
});

async function waitForRoute(route) {
  const url = `http://127.0.0.1:${port}${route}`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // The packaged server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Packaged route did not become ready: ${url}\n${output.join("")}`);
}

try {
  await Promise.race([waitForRoute("/staff"), exited]);
  for (const route of ["/manager", "/rb", "/im", "/kp", "/bp", "/login"]) {
    await Promise.race([waitForRoute(route), exited]);
  }
  console.log("Verified packaged Lighthouse server and all staff entry routes.");
} finally {
  bundledServer.kill();
}
