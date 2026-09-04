# 0002 -- Why the database was set up by hand, not by Prisma

**Date:** 2026-09-04

**What happened:** The sandboxed environment I (Claude) run commands in for
this project can't reach `binaries.prisma.sh`, the server Prisma's own
command-line tool needs to download a small helper program from the very
first time it runs. That means I can't run Prisma's usual setup commands
from here.

**What I did instead:** I wrote out the same database structure as plain
SQL (`supabase/migrations/0001_init.sql`) and had you run it yourself in
Supabase's own "SQL Editor" -- your browser doesn't have the same
restriction, so it worked immediately.

**Does this cause a problem later?** No. The Prisma schema file
(`packages/database/prisma/schema.prisma`) is still the real blueprint we
both refer to -- the SQL file is just a one-time, hand-written translation
of it. Once the app is deployed to Vercel (which has normal internet
access), Prisma's tools will work fine there for anything that needs them
going forward.
