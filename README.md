# Author App

The creative, all-in-one home base for authors -- write and organize a
manuscript, build a story bible, sprint with writer friends, and (later)
format and export a finished book. See `docs/decisions/` for plain-language
notes on the big choices behind this project.

## What's here so far (Phase 0 -- Foundation)

- `apps/web` -- the Next.js app itself (this is what you'll eventually visit
  in a browser)
- `packages/database` -- the Prisma schema: the single blueprint for every
  piece of data the app stores (accounts, books, chapters, characters,
  sprints, subscriptions, everything)
- `supabase/` -- database-level privacy rules (added in the next phase)
- `docs/decisions/` -- short write-ups of major decisions, in plain language

Working so far: the project structure, the full database blueprint, and a
real sign-up -> confirm email -> create profile -> logged-in-area flow (the
onboarding you asked to have working for real, even in the small beta).

**Not hooked up to anything live yet** -- there's no real database or hosting
connected. That's the very next step, and it needs a few things from you
(below).

## What I need from you to bring this online

1. **Create a free Supabase account** at supabase.com and create a new
   project (pick any name/region -- e.g. "author-app"). This gives us the
   database, login system, and file storage in one place.
   - Once created, go to **Project Settings -> API** and copy the "Project
     URL" and "anon public" key.
   - Then go to **Project Settings -> Database -> Connection string** and
     copy both the pooled ("Transaction") and direct connection strings.
2. **Create a free Vercel account** at vercel.com (you can sign up with
   GitHub). This is where the live website will be hosted once we're ready
   to deploy.
3. Share the Supabase values with me (the project URL, anon key, and the two
   database connection strings) and I'll wire them into the app.

You do **not** need to set up Stripe, Resend, or Sentry yet -- those come in
later phases.

## Local setup (for reference -- I'll run these as we go)

```bash
npm install
# Copy the example env files and fill in real values:
cp apps/web/.env.example apps/web/.env.local
cp packages/database/.env.example packages/database/.env
npm run db:generate   # generates the Prisma client from the schema
npm run db:push       # creates all the tables in your Supabase database
npm run dev           # starts the app at http://localhost:3000
```

## A known limitation right now

The sandboxed environment I (Claude) work in for this project has a
restricted internet connection for a couple of specific tools -- notably,
Prisma's own CLI needs to download a small helper program from
`binaries.prisma.sh` the first time it runs, and that domain isn't reachable
from here. This means I've written the full database schema but haven't
been able to run it yet to double-check it. Once you have a Supabase
project, running `npm run db:generate` and `npm run db:push` from your own
Terminal (or once we deploy to Vercel, which has normal internet access)
should work fine -- if it doesn't, that's the first thing we debug together.
