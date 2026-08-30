import {
  adminFirestore,
  credentialPath,
  firebaseProjectId,
} from "../server/firebase-admin.mjs";

try {
  const collections = await adminFirestore.listCollections();

  console.log(`Firebase Admin authenticated with project: ${firebaseProjectId}`);
  console.log(`Firestore connection verified (root collections: ${collections.length}).`);
  console.log(`Credential source: ${credentialPath}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Cloud Firestore API has not been used") || message.includes("it is disabled")) {
    console.error(`Firebase Admin authenticated with project: ${firebaseProjectId}`);
    console.error("Firestore is not enabled for this Firebase project yet.");
    console.error(
      "Create the default database at: https://console.firebase.google.com/project/lighthouse-bf85b/firestore",
    );
  } else {
    console.error("Firebase Admin authentication or Firestore connection failed.");
    console.error(message);
  }

  process.exitCode = 1;
} finally {
  await adminFirestore.terminate();
}
