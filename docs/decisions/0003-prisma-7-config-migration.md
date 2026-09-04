# 0003 -- Adjusting to a Prisma 7 breaking change

**Date:** 2026-09-04

**What happened:** The first real Vercel deploy failed. Prisma released a
new major version (7) that changed how it wants to know your database
connection string -- it used to live directly in `schema.prisma` (the `url`
and `directUrl` lines), but as of v7 that's no longer allowed. Since the
`prisma` version installed when this project was set up happened to be the
newest one, we hit this immediately.

**What changed:**
- `schema.prisma`'s datasource block now just says which kind of database
  it is (`provider = "postgresql"`) -- no more connection string here.
- A new file, `prisma.config.ts`, at the very root of the project, holds the
  actual connection info (reading `DATABASE_URL` the same as before).
- The shared database code (`packages/database/index.ts`) now builds the
  Prisma connection a slightly different way under the hood (an explicit
  "adapter" instead of Prisma finding it automatically) -- this is invisible
  to the rest of the app, which still just does
  `import { prisma } from "@author-app/database"`.

**Why this is worth knowing:** if a future Vercel deploy fails on something
Prisma-related again, it's very possibly another breaking change like this
one -- Prisma 7 is new. Check the build log's error text first; it's
usually explicit about what changed and links to their own docs.
