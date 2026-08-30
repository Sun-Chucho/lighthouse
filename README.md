# Lighthouse

Lighthouse Lodge is an offline-first booking website and role-based staff application built with React, Firebase, and Electron.

- Live website: <https://lighthouse-bf85b.web.app/>
- Latest Windows release: <https://github.com/Sun-Chucho/lighthouse/releases/latest>

## Included

- Public lodge and booking experience at `/`
- Dark brown, black, cream, and gold branding using the supplied Lighthouse logo
- Twenty configured rooms split into Luxury and Classic categories
- Five visible staff portals at `/staff`
- Unlisted Managing Director login at `/login`
- Firebase Email/Password staff authentication with role claims
- Firebase Anonymous Authentication for public booking requests
- Persistent Firestore cache and a durable local booking outbox
- Installable Windows x64 NSIS application
- Background desktop update checks and GitHub Release delivery
- Automatic Windows release workflow for every push to `main`

## Public and staff routes

| Experience | Route | Dashboard route |
| --- | --- | --- |
| Public lodge and reservations | `/` | — |
| Staff portal directory | `/staff` | — |
| Hotel Manager | `/manager` | `/manager/dashboard` |
| Reception & Bookings | `/rb` | `/rb/dashboard` |
| Inventory Manager | `/im` | `/im/dashboard` |
| Kitchen Operations | `/kp` | `/kp/dashboard` |
| Bar & POS | `/bp` | `/bp/dashboard` |
| Managing Director, unlisted | `/login` | `/login/dashboard` |

The Managing Director portal is intentionally omitted from `/staff`, but URL hiding is not its security boundary. Firebase custom role claims still protect the route. Logging out from any dashboard returns to `/staff`. The Windows application also starts at `/staff` on every launch.

## Room configuration

| Category | Nightly rate | Rooms |
| --- | ---: | --- |
| Luxury | TZS 60,000 | 301, 304, 308, 313, 314, 315, 317, 318, 319, 320 |
| Classic | TZS 80,000 | 302, 303, 305, 306, 307, 309, 310, 311, 312, 316 |

The canonical room list is in `src/data/rooms.ts`.

## Offline and synchronization behavior

The Electron application serves the compiled UI from its own signed application bundle, so the staff directory, login screens, cached session, room catalogue, and previously cached Firestore data load without internet.

Firestore uses persistent local caching. Public booking requests are first saved to a local outbox. If internet is unavailable, they remain on the device and are submitted automatically after connectivity returns. Firebase then synchronizes accepted changes with the cloud.

A staff member must successfully authenticate online at least once before that same Windows account can reopen the verified session offline. The desktop copy of the last verified session is encrypted through Electron `safeStorage` on Windows and is cleared on logout. Account revocation and fresh password login still require internet, as expected.

## Firebase security

The client configuration is in `src/lib/firebase.ts`. Trusted Admin SDK code is isolated in `server/firebase-admin.mjs`; it is never imported into frontend or Electron renderer code.

The service account belongs at `firebase-service-account.json` in the repository root. That path is ignored by Git and is not packaged into the Windows application.

`firestore.rules` permits anonymous users to create and read only their own validated booking enquiries. Reception, Manager, and Director roles can operate those requests. All unspecified collections remain denied.

Create or update a staff user by setting `LIGHTHOUSE_USER_EMAIL`, `LIGHTHOUSE_USER_PASSWORD`, `LIGHTHOUSE_USER_NAME`, and `LIGHTHOUSE_USER_ROLE`, then run:

```bash
npm run firebase:create-user
```

Valid role claims are `manager`, `director`, `reception`, `inventory`, `kitchen`, and `bar`.

## Local development

Web application:

```bash
npm install
npm run dev
```

Windows desktop application with Vite development reload:

```bash
npm run desktop:dev
```

## Build the Windows installer

```bash
npm run desktop:pack
```

The x64 installer and update metadata are written to `release/`. The installer creates Start Menu and optional desktop shortcuts and does not delete cached application data during uninstall.

For public distribution, configure a trusted Windows code-signing certificate to avoid SmartScreen warnings. The application can be packaged without a certificate for internal testing, but unsigned installers should not be presented as trusted public releases.

## Automatic desktop updates

Installed builds check the public `Sun-Chucho/lighthouse` GitHub Releases feed at launch and every four hours. Updates download in the background, install when the application exits, and can also be applied immediately from the in-app restart notice.

`.github/workflows/windows-desktop-release.yml` runs on every push to `main`, assigns a unique desktop version, builds the NSIS installer, and publishes the installer plus `latest.yml` update metadata. Users do not reinstall when application code changes; they receive the generated release through the updater after the workflow succeeds.

## Verification

```bash
npm run typecheck
npm run build
npm audit
npm run firebase:verify-auth
npm run firebase:verify
npm run firebase:verify-client
npm run desktop:pack
```

`firebase:verify-client` creates a temporary anonymous user and temporary booking enquiry, verifies the permitted and denied rule paths, and removes both test resources before exiting.
