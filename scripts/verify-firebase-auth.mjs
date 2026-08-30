import { deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { firebaseAdminApp, firebaseProjectId } from "../server/firebase-admin.mjs";

try {
  await getAuth(firebaseAdminApp).listUsers(1);
  console.log(`Firebase Admin authenticated with project: ${firebaseProjectId}`);
  console.log("Firebase Authentication Admin access verified (read only). ");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("There is no configuration corresponding to the provided identifier")) {
    console.error(`Firebase Admin authenticated with project: ${firebaseProjectId}`);
    console.error("Firebase Authentication has not been initialized for this project yet.");
    console.error(
      "Enable Email/Password at: https://console.firebase.google.com/project/lighthouse-bf85b/authentication/providers",
    );
  } else {
    console.error("Firebase Authentication Admin access could not be verified.");
    console.error(message);
  }
  process.exitCode = 1;
} finally {
  await deleteApp(firebaseAdminApp);
}
