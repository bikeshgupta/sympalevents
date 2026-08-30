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

Use the full-stack dev server when testing Firebase-backed roles and admin actions:

```bash
npm run dev:full
```

## Supabase

Create a Supabase project and add these browser/public values to `.env`:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

In Vercel, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as **Config** values. These are intentionally available to the browser.

Run the migration in `supabase/migrations/001_initial_schema.sql`, then optionally run `supabase/seed.sql` for demo development data.

Run `supabase/migrations/002_access_control.sql` after the initial schema to add access control, event creation helpers, and page-level permissions.

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

For server-side Firebase token verification, create a Firebase service account in Project settings > Service accounts and add either:

```bash
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

or the full JSON as:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON=
```

The private key must remain server-only. Do not prefix it with `VITE_`.

## Server API

Firebase login is verified by Vercel serverless functions under `api/`. These functions use the Supabase service role key to map Firebase users into `app_users` and manage per-event roles.

Add these server-only values locally and in Vercel:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

In Vercel, add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` as **Secret** values. Do not expose `SUPABASE_SERVICE_ROLE_KEY` or Firebase private keys in browser code.

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

- `/dashboard` and `/expenses` are public read pages.
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
4. Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` in Vercel as Secret values.
5. Deploy using the default Vite settings.

## Next Modules

Expenses, Procurement, Prasad, Volunteers, Event Plan, Run Sheet, Inventory, Vendors, Contacts, Safety/Risk, file uploads, and full CRUD data flows are planned after the foundation.
