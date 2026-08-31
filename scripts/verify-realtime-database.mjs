import { deleteApp } from "firebase-admin/app";
import { getDatabaseWithUrl } from "firebase-admin/database";
import { firebaseAdminApp, firebaseProjectId } from "../server/firebase-admin.mjs";

const databaseUrl = "https://lighthouse-bf85b-default-rtdb.firebaseio.com";

try {
  const snapshot = await getDatabaseWithUrl(databaseUrl, firebaseAdminApp).ref("lighthouse-v1").get();
  const value = snapshot.val();
  const keys = value && typeof value === "object" ? Object.keys(value).sort() : [];
  console.log(`Realtime Database authenticated with project: ${firebaseProjectId}`);
  console.log(`Lighthouse operational namespace keys: ${keys.length}`);
  if (keys.length > 0) console.log(`Stored business sections: ${keys.join(", ")}`);
} catch (error) {
  console.error("Realtime Database connection failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await deleteApp(firebaseAdminApp).catch(() => undefined);
}
