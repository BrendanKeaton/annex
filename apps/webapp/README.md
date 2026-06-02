# Annex

Web frontend for Annex — account management, auth, and onboarding.

Built with [Next.js](https://nextjs.org), [Supabase](https://supabase.com), [Tailwind CSS](https://tailwindcss.com), and [shadcn/ui](https://ui.shadcn.com/).

## Getting started

### Prerequisites

- Node.js 20+
- A [Supabase](https://database.new) project (for auth + database)
- An optional companion API backend (see `NEXT_PUBLIC_API_URL` below)

### Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env.local` in this directory:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-supabase-anon-or-publishable-key>
   NEXT_PUBLIC_API_URL=http://localhost:8000
   # Optional: URL scheme used by /desktop-callback to hand off to a paired desktop app.
   # Defaults to `annex`.
   NEXT_PUBLIC_DESKTOP_URL_SCHEME=annex
   ```

   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` can be found in your Supabase project's API settings.

3. Run the dev server:

   ```bash
   npm run dev
   ```

   The app runs on [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` — start the Next.js dev server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — run ESLint

## Project layout

- `app/` — Next.js App Router routes (auth pages, onboarding, portal)
- `components/` — shared UI components (forms, sidebar, etc.) and `ui/` primitives
- `lib/supabase/` — Supabase client/server helpers
- `proxy.ts` — Next.js middleware (session refresh / route gating)

## License

[MIT](../LICENSE)
