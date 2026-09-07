-- The Sprint model's schema.prisma gained an "isPublic" field (public
-- sprints, discoverable/joinable by any signed-in author) back in the
-- friends/presence commit, but that change was never actually pushed to
-- the live database -- "prisma db push" needs a schema-engine binary this
-- environment's network can't reach, so the field only ever existed in
-- the Prisma schema file. This shipped a real production bug: the live
-- /sprints page 500s on every load because listPublicSprints() (and
-- createSprint()) reference a column that doesn't exist yet. This
-- migration is the fix -- it makes the live table match what
-- schema.prisma has already described since that commit.

alter table "sprints" add column "isPublic" boolean not null default false;

create index "sprints_isPublic_status_idx" on "sprints" ("isPublic", "status");
