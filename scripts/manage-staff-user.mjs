import { deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { firebaseAdminApp, firebaseProjectId } from "../server/firebase-admin.mjs";

const allowedRoles = new Set(["manager", "director", "reception", "inventory", "kitchen", "bar"]);
const email = process.env.LIGHTHOUSE_USER_EMAIL?.trim().toLowerCase();
const password = process.env.LIGHTHOUSE_USER_PASSWORD;
const displayName = process.env.LIGHTHOUSE_USER_NAME?.trim();
const role = process.env.LIGHTHOUSE_USER_ROLE?.trim().toLowerCase();

if (!email || !role || !allowedRoles.has(role)) {
  console.error("Set LIGHTHOUSE_USER_EMAIL and a valid LIGHTHOUSE_USER_ROLE before running this command.");
  console.error("Valid roles: manager, director, reception, inventory, kitchen, bar.");
  process.exit(1);
}

if (password && password.length < 6) {
  console.error("LIGHTHOUSE_USER_PASSWORD must contain at least 6 characters.");
  process.exit(1);
}

try {
  const auth = getAuth(firebaseAdminApp);
  let user;
  let created = false;

  try {
    user = await auth.getUserByEmail(email);
    const updates = {
      ...(displayName ? { displayName } : {}),
      ...(password ? { password } : {}),
    };
    if (Object.keys(updates).length > 0) user = await auth.updateUser(user.uid, updates);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    if (!password) {
      console.error("LIGHTHOUSE_USER_PASSWORD is required when creating a new user.");
      process.exitCode = 1;
    } else {
      user = await auth.createUser({ email, password, ...(displayName ? { displayName } : {}) });
      created = true;
    }
  }

  if (user) {
    await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), role });

    console.log(`${created ? "Created" : "Updated"} Lighthouse staff account in ${firebaseProjectId}.`);
    console.log(`Email: ${email}`);
    console.log(`Role claim: ${role}`);
    console.log("The password was not printed or written to the repository.");
  }
} finally {
  await deleteApp(firebaseAdminApp);
}
