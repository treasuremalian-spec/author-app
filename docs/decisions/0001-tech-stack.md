# 0001 -- Tech stack

**Date:** 2026-09-04

**Decision:** Next.js (React/TypeScript) + Tailwind CSS for the app,
Supabase (Postgres + Auth + Realtime + Storage) as the backend, Prisma to
manage the database schema, Vercel to host it, Stripe for payments later,
and a custom EPUB/PDF generator for the formatting studio.

**Why, in plain language:**

- **Next.js** is the most common, well-documented way to build a modern web
  app -- that matters a lot when one AI agent is doing all the engineering,
  since it means fewer mistakes and faster fixes.
- **Supabase** bundles four things we'd otherwise have to build separately
  (login, database, "who's online" live updates, file storage) into one
  service with a generous free tier -- ideal for a beta of you + a few
  friends.
- **Prisma** is a tool that lets me define the app's entire data structure
  (books, chapters, characters, sprints, subscriptions) in one readable file
  I can always show you, and safely evolve it as we add features.
- **Vercel** hosts Next.js apps with a "push a button, get a live link"
  workflow, made by the same team that builds Next.js.
- **Stripe** is the standard, trusted way to handle real subscriptions --
  wired in from the start (per your requirement) but not turned on until
  you're ready to charge for anything.
- There is no off-the-shelf "Vellum in a box" library -- the EPUB and
  print-PDF formatting studio is real engineering work we'll build and
  scope carefully, in its own isolated part of the codebase
  (`packages/formatting-engine`) so it can grow without disrupting the rest
  of the app.

**Full detail:** see the approved project plan for the complete
architecture, phased roadmap to January 2027, and honest risk notes.
