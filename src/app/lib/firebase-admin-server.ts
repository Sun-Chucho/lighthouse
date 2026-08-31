import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const PROJECT_ID = "lighthouse-bf85b";
let adminApp: App | null = null;

function readServiceAccount() {
  const inlineCredential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const credentialPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim()
    ? resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
    : resolve(process.cwd(), "firebase-service-account.json");
  const raw = inlineCredential || (existsSync(credentialPath)
    ? readFileSync(/* turbopackIgnore: true */ credentialPath, "utf8")
    : "");
  if (!raw) throw new Error("Firebase Admin credentials are not configured.");

  const value = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
  if (value.project_id !== PROJECT_ID || !value.client_email || !value.private_key) {
    throw new Error("Firebase Admin credentials do not match the Lighthouse project.");
  }
  return {
    projectId: value.project_id,
    clientEmail: value.client_email,
    privateKey: value.private_key.replace(/\\n/g, "\n"),
  };
}

function getAdminApp() {
  if (adminApp) return adminApp;
  adminApp = getApps().find((candidate) => candidate.name === "lighthouse-next-admin")
    ?? initializeApp({ credential: cert(readServiceAccount()) }, "lighthouse-next-admin");
  return adminApp;
}

export function getLighthouseAdminAuth() {
  return getAuth(getAdminApp());
}
