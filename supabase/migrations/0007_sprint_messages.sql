-- A sprint's own scoped chat -- visible only to that sprint's
-- participants (checked in lib/actions/sprints.ts, the same pattern this
-- project already uses for its other non-manuscript social data). Plain
-- text only; this table structurally can never hold manuscript content,
-- same spirit as sprint_participants only ever storing word counts.

create table "sprint_messages" (
  "id" text primary key default gen_random_uuid()::text,
  "sprintId" text not null references "sprints"("id") on delete cascade,
  "userId" text not null references "users"("id") on delete cascade,
  "text" text not null,
  "createdAt" timestamptz not null default now()
);

create index "sprint_messages_sprintId_createdAt_idx" on "sprint_messages" ("sprintId", "createdAt");
