import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const expectedProjectId = "lighthouse-bf85b";
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDirectory, "..");
const configuredCredentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

export const credentialPath = configuredCredentialPath
  ? isAbsolute(configuredCredentialPath)
    ? configuredCredentialPath
    : resolve(process.cwd(), configuredCredentialPath)
  : join(repositoryRoot, "firebase-service-account.json");

function readServiceAccount() {
  let serviceAccount;

  try {
    serviceAccount = JSON.parse(readFileSync(credentialPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to read the Firebase service account at ${credentialPath}.`,
      { cause: error },
    );
  }

  const projectId = serviceAccount.project_id;
  const clientEmail = serviceAccount.client_email;
  const privateKey = serviceAccount.private_key;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("The Firebase service account is missing required fields.");
  }

  if (projectId !== expectedProjectId) {
    throw new Error(
      `Expected Firebase project ${expectedProjectId}, but the credential belongs to ${projectId}.`,
    );
  }

  return { projectId, clientEmail, privateKey };
}

const adminAppName = "lighthouse-admin";
const existingAdminApp = getApps().find((app) => app.name === adminAppName);

export const firebaseAdminApp = existingAdminApp ?? initializeApp(
  { credential: cert(readServiceAccount()) },
  adminAppName,
);

export const adminFirestore = getFirestore(firebaseAdminApp);
export const firebaseProjectId = expectedProjectId;
