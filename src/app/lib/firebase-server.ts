import { readFileSync } from "fs";
import path from "path";
import { createSign } from "crypto";

const FIREBASE_API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyCZK3HSQwhAZI1T3AzjBVBBAFqtC8xMy28";
const FIREBASE_DATABASE_URL =
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ??
  "https://lighthouse-bf85b-default-rtdb.firebaseio.com/";
const FIREBASE_STORAGE_ROOT = "lighthouse-v1";

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? path.join(process.cwd(), "firebase-service-account.json");
type ServiceAccountConfig = {
  client_email: string;
  private_key: string;
};

let serviceAccountConfig: ServiceAccountConfig | null | undefined;

function loadServiceAccountConfig() {
  if (serviceAccountConfig !== undefined) return serviceAccountConfig;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      ?? readFileSync(/* turbopackIgnore: true */ serviceAccountPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ServiceAccountConfig>;
    serviceAccountConfig = parsed.client_email && parsed.private_key
      ? { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n") }
      : null;
  } catch {
    serviceAccountConfig = null;
  }
  return serviceAccountConfig;
}

type FirebaseAnonSession = {
  idToken: string;
  expiresAt: number;
};

let anonSessionPromise: Promise<FirebaseAnonSession> | null = null;
let serviceAccountSessionPromise: Promise<FirebaseAnonSession> | null = null;

function encodeBase64Url(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function getServiceAccountSession(serviceAccount: ServiceAccountConfig) {
  if (!serviceAccountSessionPromise) {
    serviceAccountSessionPromise = (async () => {
      const now = Math.floor(Date.now() / 1000);
      const unsignedToken = `${encodeBase64Url({ alg: "RS256", typ: "JWT" })}.${encodeBase64Url({
        iss: serviceAccount.client_email,
        scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      })}`;
      const signature = createSign("RSA-SHA256")
        .update(unsignedToken)
        .sign(serviceAccount.private_key, "base64url");
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: `${unsignedToken}.${signature}`,
        }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Firebase service authentication failed (${response.status})`);
      const payload = (await response.json()) as { access_token?: string; expires_in?: number };
      if (!payload.access_token) throw new Error("Firebase service authentication did not return an access token.");
      return {
        idToken: payload.access_token,
        expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000 - 60000,
      };
    })().catch((error) => {
      serviceAccountSessionPromise = null;
      throw error;
    });
  }

  const session = await serviceAccountSessionPromise;
  if (Date.now() >= session.expiresAt) {
    serviceAccountSessionPromise = null;
    return getServiceAccountSession(serviceAccount);
  }
  return session;
}

function getDatabaseBaseUrl() {
  return FIREBASE_DATABASE_URL.replace(/\/+$/, "");
}

function toStoragePath(key: string) {
  return `${FIREBASE_STORAGE_ROOT}/${key.replace(/[.#$[\]/]/g, "-")}`;
}

async function getAnonymousSession() {
  if (!anonSessionPromise) {
    anonSessionPromise = fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnSecureToken: true }),
        cache: "no-store",
      },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Anonymous Firebase auth failed (${response.status})`);
        }

        const payload = (await response.json()) as { idToken?: string; expiresIn?: string };
        if (!payload.idToken) {
          throw new Error("Anonymous Firebase auth did not return an ID token.");
        }

        const expiresInMs = Math.max(60, Number(payload.expiresIn ?? "3600")) * 1000;
        return {
          idToken: payload.idToken,
          expiresAt: Date.now() + expiresInMs - 60000,
        };
      })
      .catch((error) => {
        anonSessionPromise = null;
        throw error;
      });
  }

  const session = await anonSessionPromise;
  if (Date.now() >= session.expiresAt) {
    anonSessionPromise = null;
    return getAnonymousSession();
  }

  return session;
}

async function requestDatabase<T>(key: string, init?: RequestInit) {
  const serviceAccount = loadServiceAccountConfig();
  const basePath = `${getDatabaseBaseUrl()}/${toStoragePath(key)}.json`;

  const runRequest = async (token?: string, tokenType: "auth" | "access_token" = "auth") => {
    const path = token ? `${basePath}?${tokenType}=${encodeURIComponent(token)}` : basePath;
    return fetch(path, {
      ...init,
      cache: "no-store",
    });
  };

  let response: Response | null = null;
  if (serviceAccount) {
    try {
      const { idToken } = await getServiceAccountSession(serviceAccount);
      response = await runRequest(idToken, "access_token");
    } catch {}
  }

  if (!response || response.status === 401 || response.status === 403) {
    try {
      const { idToken } = await getAnonymousSession();
      response = await runRequest(idToken);
    } catch {}
  }

  if (!response || response.status === 401 || response.status === 403) {
    response = await runRequest();
  }

  if (!response.ok) {
    throw new Error(`Realtime Database request failed (${response.status})`);
  }

  return response;
}

export async function readServerSyncedStorageValue<T>(key: string) {
  void loadServiceAccountConfig();
  const response = await requestDatabase<T>(key, { method: "GET" });
  return (await response.json()) as T | null;
}

export async function writeServerSyncedStorageValue<T>(key: string, value: T) {
  void loadServiceAccountConfig();
  await requestDatabase(key, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

export async function appendServerSyncedStorageItem<T>(key: string, item: T) {
  const current = await readServerSyncedStorageValue<T[]>(key);
  const next = Array.isArray(current) ? [item, ...current] : [item];
  await writeServerSyncedStorageValue(key, next);
}
