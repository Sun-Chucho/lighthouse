# Lighthouse

Lighthouse Lodge is an offline-first booking website and role-based staff application built with React, Firebase, and Electron.

- Live website: <https://www.lighthousemoshi.com/>
- Staff portal: <https://www.lighthousemoshi.com/staff>
- Latest Windows release: <https://github.com/Sun-Chucho/lighthouse/releases/latest>

## Included

- Public lodge and booking experience at `/`
- Dark brown, black, cream, and gold branding using the supplied Lighthouse logo
- Twenty configured rooms split into Luxury and Classic categories
- Five visible staff portals at `/staff`
- Unlisted Managing Director login at `/login`
- Role-specific four-digit staff password access with no email field
- Firebase Anonymous Authentication for public booking requests
- Secured Firebase Realtime Database synchronization and a durable local booking outbox
- Installable Windows x64 NSIS application
- Background desktop update checks and GitHub Release delivery
- Automatic Windows release workflow for every push to `main`

## Public and staff routes

| Experience | Route | Dashboard route |
| --- | --- | --- |
| Public lodge and reservations | `/` | — |
| Staff portal directory | `/staff` | — |
| Hotel Manager | `/manager` | `/dashboard` |
| Reception & Bookings | `/rb` | `/dashboard/cashier` |
| Inventory Manager | `/im` | `/dashboard/inventory` |
| Kitchen Operations | `/kp` | `/dashboard/kitchen` |
| Bar & POS | `/bp` | `/dashboard/barista` |
| Managing Director, unlisted | `/login` | `/dashboard` |

The Managing Director portal is intentionally omitted from `/staff` and remains available directly at `/login`. Logging out from any dashboard returns to `/staff`. The Windows application also starts at `/staff` on every launch.

## Current role passwords

| Role | Password |
| --- | --- |
| Hotel Manager | `4321` |
| Reception & Bookings | `1234` |
| Inventory Manager | `1234` |
| Kitchen Operations | `1234` |
| Bar & POS | `1234` |
| Managing Director | `1234` |

These shared PINs are deliberately implemented as requested for the current local/offline workflow. Because the application is publicly distributed, they are not a replacement for individual server-verified staff identities when sensitive operational data is added later.

## Room configuration

| Category | Nightly rate | Rooms |
| --- | ---: | --- |
| Luxury | TZS 60,000 | 301, 304, 308, 313, 314, 315, 317, 318, 319, 320 |
| Classic | TZS 80,000 | 302, 303, 305, 306, 307, 309, 310, 311, 312, 316 |

The canonical room list is in `src/data/rooms.ts`.

## Offline and synchronization behavior

The Electron application serves the compiled Next.js UI from its own application bundle, so the staff directory, PIN login screens, room catalogue, and previously cached operational data load without internet.

Public booking requests are first saved to a local outbox. If internet is unavailable, they remain on the device and are submitted automatically after connectivity returns. Anonymous Firebase Authentication verifies the guest request, then the booking enters the secured Realtime Database feed used by Reception.

Staff PIN access does not require a network connection. When connected, every role exchanges its PIN for a claim-bearing Firebase token before operational synchronization begins. Logout clears the Firebase and encrypted desktop sessions and returns to `/staff`; reopening the Windows application starts there as well.

## Firebase security

Client configuration is kept in the browser-side Firebase modules. Trusted Admin SDK code is limited to server-only scripts and Next.js API routes; it is never bundled into the Electron renderer.

The service account belongs at `firebase-service-account.json` in the repository root. That path is ignored by Git and is not packaged into the Windows application.

`database.rules.json` permits only claim-bearing Lighthouse staff sessions to read or write operational data and validates the configured room numbers and prices. `firestore.rules` limits anonymous enquiries to each guest's own validated records. All unspecified paths remain denied.

## Local development

Web application:

```bash
npm install
npm run dev
```

Windows desktop application with Next.js development reload:

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
npm run firebase:verify-database
npm run desktop:pack
```

`firebase:verify-client` creates a temporary anonymous user and temporary booking enquiry, verifies the permitted and denied rule paths, and removes both test resources before exiting.
