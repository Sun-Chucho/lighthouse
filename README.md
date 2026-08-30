# Lighthouse

A clean Lighthouse Lodge management foundation with a React frontend and Firebase connectivity.

## What is included

- Lighthouse Lodge branding using the supplied logo
- Dark brown, black, cream, and gold visual system
- Responsive overview and room directory
- 20 configured rooms split into Luxury and Classic categories
- Firebase Web SDK with Firestore and browser-safe Analytics initialization
- Firebase Admin SDK for trusted server-side Firestore access
- Static Vite build for simple frontend hosting

## Room configuration

| Category | Nightly rate | Rooms |
| --- | ---: | --- |
| Luxury | TZS 60,000 | 301, 304, 308, 313, 314, 315, 317, 318, 319, 320 |
| Classic | TZS 80,000 | 302, 303, 305, 306, 307, 309, 310, 311, 312, 316 |

Room configuration lives in `src/data/rooms.ts`.

## Firebase

The browser integration is in `src/lib/firebase.ts`. Trusted server-side access is isolated in `server/firebase-admin.mjs`; never import that file into frontend code.

The local service-account key belongs at `firebase-service-account.json` in the repository root. That path and common service-account filename patterns are ignored by Git. A different local path can be supplied through `GOOGLE_APPLICATION_CREDENTIALS`.

`firestore.rules` denies all browser reads and writes by default. Keep that baseline until Lighthouse authentication and per-role permissions are designed; trusted Admin SDK code is controlled through IAM instead.

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
npm run firebase:verify
```

The production-ready static frontend is written to `dist/`.
