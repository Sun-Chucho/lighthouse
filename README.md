# Lighthouse

A clean Lighthouse Lodge management foundation with a React frontend and Firebase connectivity.

## What is included

- Lighthouse Lodge branding using the supplied logo
- Dark brown, black, cream, and gold visual system
- Responsive overview and room directory
- 20 configured rooms split into Luxury and Classic categories
- Dedicated login portals and protected dashboards for six staff roles
- Firebase Web SDK with Firestore and browser-safe Analytics initialization
- Firebase Admin SDK for trusted server-side Firestore access
- Firebase Hosting rewrites for direct access to nested role URLs

## Room configuration

| Category | Nightly rate | Rooms |
| --- | ---: | --- |
| Luxury | TZS 60,000 | 301, 304, 308, 313, 314, 315, 317, 318, 319, 320 |
| Classic | TZS 80,000 | 302, 303, 305, 306, 307, 309, 310, 311, 312, 316 |

Room configuration lives in `src/data/rooms.ts`.

## Staff routes

| Portal | Login route | Dashboard route |
| --- | --- | --- |
| All staff portals | `/staff` | — |
| Hotel Manager | `/manager` | `/manager/dashboard` |
| Managing Director | `/md` | `/md/dashboard` |
| Reception & Bookings | `/rb` | `/rb/dashboard` |
| Inventory Manager | `/im` | `/im/dashboard` |
| Kitchen Operations | `/kp` | `/kp/dashboard` |
| Bar & POS | `/bp` | `/bp/dashboard` |

The staff portal directory is available at `/staff`. The root route `/` redirects there. Protected routes require a Firebase Authentication user whose custom `role` claim matches the portal. No default usernames or passwords are stored in the frontend.

## Firebase

The browser integration is in `src/lib/firebase.ts`. Trusted server-side access is isolated in `server/firebase-admin.mjs`; never import that file into frontend code.

The local service-account key belongs at `firebase-service-account.json` in the repository root. That path and common service-account filename patterns are ignored by Git. A different local path can be supplied through `GOOGLE_APPLICATION_CREDENTIALS`.

`firestore.rules` denies all browser reads and writes by default. Keep that baseline until Lighthouse authentication and per-role permissions are designed; trusted Admin SDK code is controlled through IAM instead.

Enable Email/Password in Firebase Authentication before creating staff accounts. The Admin connection can be checked without changing users:

```bash
npm run firebase:verify-auth
```

Create or update a staff user locally by setting `LIGHTHOUSE_USER_EMAIL`, `LIGHTHOUSE_USER_PASSWORD`, `LIGHTHOUSE_USER_NAME`, and `LIGHTHOUSE_USER_ROLE`, then running `npm run firebase:create-user`. Valid claims are `manager`, `director`, `reception`, `inventory`, `kitchen`, and `bar`. The private service-account key stays server-side and is never bundled into the Vite frontend.

Before the first database check, create the project's default Cloud Firestore database in the [Firebase console](https://console.firebase.google.com/project/lighthouse-bf85b/firestore). Choose its permanent location deliberately; the application does not make that infrastructure decision automatically.

Verify Admin authentication and Firestore connectivity with a read-only check:

```bash
npm run firebase:verify
```

This foundation does not create collections, seed documents, or restore any old records. Transactions, guest records, bookings, menu items, drinks, kitchen stock, inventory, and other domain features remain intentionally absent until they are designed for Lighthouse.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verify

```bash
npm run typecheck
npm run build
npm run firebase:verify-auth
npm run firebase:verify
```

The production-ready static frontend is written to `dist/`.
