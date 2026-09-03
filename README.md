# SymPal Events

A multi-event committee management app built with React, TypeScript, Vite, Tailwind CSS, shadcn-style components, TanStack Query, and Supabase.

## Features

- Multi-event architecture
- Desktop sidebar and mobile bottom navigation
- Dashboard with financial and operational KPIs
- Contributions, Sponsors, Budget, and Tasks starter modules
- Supabase schema for all planned workbook modules
- Row Level Security foundation for event-based roles
- Vercel-ready environment configuration

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Use the local Vite dev server when testing Firebase-backed roles and admin actions:

```bash
npm run dev
```

Local `/api/*` routes are executed through a Vite development middleware. The same files deploy as Vercel serverless functions.

## Supabase

Create a Supabase project and add these browser/public values to `.env`:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

In Vercel, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as **Config** values. These are intentionally available to the browser.

Run the migration in `supabase/migrations/001_initial_schema.sql`, then optionally run `supabase/seed.sql` for demo development data.

Run `supabase/migrations/002_access_control.sql` after the initial schema to add access control, event creation helpers, and page-level permissions.

Later migrations are numbered and applied in order. `supabase/migrations/014_contribution_payments.sql` is required for the UPI contribution flow below; without it the "Contribute now" button errors when a resident submits.

## UPI contributions

Residents can pay the committee directly from their own UPI app (PhonePe, Google Pay, Paytm or any other). There is **no payment gateway and no merchant account** — the money moves peer to peer, so nothing tells the site whether a payment succeeded. Every attempt is therefore recorded as pending, and a committee member confirms it on the Contributions page before it counts.

Add the committee's UPI id to `.env`:

```bash
VITE_UPI_ID=committee@bankhandle
VITE_UPI_PAYEE_NAME=Your Society Committee
```

In Vercel, add both as **Config** values — a UPI id is public information (it is what a payment QR code encodes), not a secret.

Leave `VITE_UPI_ID` empty and the feature stays completely hidden: no button on the dashboard or Contributions page, and no review panel.

## Firebase

Create a Firebase project, enable Authentication > Sign-in method > Google, and add your local/dev domain to the authorized domains list.

Add these browser/public values from Project settings > General > Your apps > Firebase SDK snippet > Config to `.env`:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

In Vercel, add the `VITE_FIREBASE_*` values as **Config** values. Firebase web config is public by design.

For server-side Firebase token verification, add the project id as a server-only value:

```bash
FIREBASE_PROJECT_ID=
```

The API verifies Firebase ID tokens against Google's public signing keys, so it does not need a Firebase service account private key.

## Server API

Firebase login is verified by Vercel serverless functions under `api/`. These functions use the Supabase service role key to map Firebase users into `app_users` and manage per-event roles.

Add these server-only values locally and in Vercel:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
FIREBASE_PROJECT_ID=
```

In Vercel, add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `FIREBASE_PROJECT_ID` as **Secret** values. Do not expose `SUPABASE_SERVICE_ROLE_KEY` in browser code.

## Testing Live Data

Vite reads `.env` or `.env.local`, not `.env.example`. Keep `.env.example` as the template and create a real local `.env` file with your Supabase values.

After restarting `npm.cmd run dev`, open `/dashboard`. The page shows a badge:

- `Supabase data`: the app is reading from your Supabase tables.
- `Demo fallback`: Supabase is not configured, no event rows are readable, or Row Level Security is blocking the current unauthenticated user.

For the current read-only smoke test, confirm rows exist in Supabase Table Editor for `events`, `sponsors`, `budgets`, and `tasks`. Full authenticated access is the next implementation step.

To test add/edit/delete before authentication is implemented, run `supabase/dev-anon-crud-policies.sql` in the Supabase SQL Editor. These policies are for local development only and should be removed before production.

When you are ready to test real login and page permissions, run `supabase/remove-dev-anon-policies.sql`.

## Google Login and Access Control

The app uses Firebase Authentication with the Google provider.

In Google Cloud OAuth setup, add:

- Authorized JavaScript origin: `http://localhost:5173`

Access model:

- `/dashboard`, `/budget`, and `/expenses` are public read pages.
- Other pages require Google login.
- Event creator becomes the event admin automatically.
- Settings lets an admin grant admin, committee, or read-only access to members for each event.
- A member must sign in with Google once before an admin can grant access by email.

## Build

```bash
npm run build
```

## Deploy to Vercel

1. Push this repository to GitHub.
2. Import the project in Vercel.
3. Add the `VITE_SUPABASE_*` and `VITE_FIREBASE_*` values in Vercel as Config values.
4. Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `FIREBASE_PROJECT_ID` in Vercel as Secret values.
5. Deploy using the default Vite settings.

## Next Modules

Expenses, Procurement, Prasad, Volunteers, Event Plan, Run Sheet, Inventory, Vendors, Contacts, Safety/Risk, file uploads, and full CRUD data flows are planned after the foundation.
