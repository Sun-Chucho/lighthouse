import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const standaloneRoot = resolve(repositoryRoot, ".next", "standalone");

await mkdir(resolve(standaloneRoot, ".next"), { recursive: true });
await cp(
  resolve(repositoryRoot, ".next", "static"),
  resolve(standaloneRoot, ".next", "static"),
  { recursive: true, force: true },
);
await cp(
  resolve(repositoryRoot, "public"),
  resolve(standaloneRoot, "public"),
  { recursive: true, force: true },
);

console.log("Prepared Lighthouse Next.js standalone server for Windows packaging.");
