# Lighthouse

A clean, frontend-only foundation for the Lighthouse Lodge management system.

## What is included

- Lighthouse Lodge branding using the supplied logo
- Dark brown, black, cream, and gold visual system
- Responsive overview and room directory
- 20 configured rooms split into Luxury and Classic categories
- Static Vite build for simple frontend hosting

## Room configuration

| Category | Nightly rate | Rooms |
| --- | ---: | --- |
| Luxury | TZS 60,000 | 301, 304, 308, 313, 314, 315, 317, 318, 319, 320 |
| Classic | TZS 80,000 | 302, 303, 305, 306, 307, 309, 310, 311, 312, 316 |

Room configuration lives in `src/data/rooms.ts`.

## Clean-slate scope

This repository intentionally has no backend, database, API routes, authentication, payment processing, transactions, guest records, bookings, menu, bar stock, kitchen stock, inventory, seeds, or legacy-system history. Those capabilities can be designed and connected in later phases without inheriting any prior data or infrastructure.

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
```

The production-ready static frontend is written to `dist/`.
