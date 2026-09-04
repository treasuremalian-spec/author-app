-- Author App -- initial schema
-- Hand-translated from packages/database/prisma/schema.prisma (kept as the
-- source of truth). Applied directly because this sandbox's shell can't
-- reach Prisma's own binary-download host -- see docs/decisions/0002.
-- Once Vercel is connected, `prisma db pull` can re-sync Prisma's view of
-- this database, and `prisma generate` will work normally on Vercel's
-- build servers.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type "PresenceStatus" as enum ('ONLINE','WRITING','SPRINTING','BUSY','INVISIBLE');
create type "PlanTier" as enum ('FREE','WRITER','AUTHOR_PRO');
create type "SubscriptionStatus" as enum ('ACTIVE','TRIALING','PAST_DUE','CANCELED');
create type "ProjectStatus" as enum ('IDEA','PLANNING','DRAFTING','REVISING','EDITING','FORMATTING','COMPLETED','PUBLISHED','ARCHIVED');
create type "ManuscriptNodeType" as enum ('PART','CHAPTER','SCENE');
create type "SceneStatus" as enum ('PLANNED','DRAFTING','WRITTEN','REVISING','COMPLETE');
create type "StoryBibleEntryType" as enum ('ORGANIZATION','FAMILY','BUSINESS','OBJECT','WORLDBUILDING','TERMINOLOGY','RULE','HISTORICAL_EVENT','RESEARCH','FACT','IDEA','TITLE_IDEA','DIALOGUE_SNIPPET','QUOTE','SCENE_IDEA','PLOT_TWIST');
create type "MediaAttachedToType" as enum ('PROJECT','CHARACTER','LOCATION','SCENE','STORY_BIBLE_ENTRY','MOOD_BOARD');
create type "CollaboratorRole" as enum ('VIEW_ONLY','BETA_READER','COMMENTER','EDITOR','CO_AUTHOR');
create type "CollaboratorStatus" as enum ('INVITED','ACCEPTED','REVOKED');
create type "FriendshipStatus" as enum ('PENDING','ACCEPTED','BLOCKED');
create type "CircleRole" as enum ('OWNER','MODERATOR','MEMBER');
create type "SprintType" as enum ('SOLO','FRIEND','GROUP','CIRCLE');
create type "SprintStatus" as enum ('SCHEDULED','ACTIVE','COMPLETED','CANCELED');
create type "GoalType" as enum ('DAILY_WORDS','WEEKLY_WORDS','MANUSCRIPT_TOTAL','DEADLINE','CHAPTER_TARGET');
create type "GoalStatus" as enum ('ACTIVE','ACHIEVED','MISSED','ARCHIVED');
create type "AchievementKey" as enum ('WORDS_1K','WORDS_10K','WORDS_50K','WORDS_100K','FIRST_CHAPTER_COMPLETE','STREAK_7_DAY','STREAK_30_DAY','MANUSCRIPT_COMPLETE','FIRST_SPRINT','FIRST_EXPORT');
create type "NotificationType" as enum ('FRIEND_REQUEST','SPRINT_INVITE','CIRCLE_INVITE','COMMENT','BETA_FEEDBACK','ACHIEVEMENT','GOAL_REMINDER');
create type "ThemeCategory" as enum ('CONTEMPORARY_ROMANCE','URBAN_FICTION','DARK_ROMANCE','FANTASY','MINIMAL','CLASSIC','LUXURY','NONFICTION');
create type "ExportType" as enum ('EPUB','PRINT_PDF','PROOF_PDF','DOCX');
create type "ExportStatus" as enum ('QUEUED','PROCESSING','READY','FAILED');

-- ---------------------------------------------------------------------------
-- 1. Accounts, profiles & presence
-- ---------------------------------------------------------------------------
create table "users" (
  "id" text primary key,
  "email" text not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table "author_profiles" (
  "id" text primary key default gen_random_uuid()::text,
  "userId" text not null unique references "users"("id") on delete cascade,
  "displayName" text not null,
  "username" text not null unique,
  "avatarUrl" text,
  "bio" text,
  "genres" text[] not null default '{}',
  "presenceStatus" "PresenceStatus" not null default 'INVISIBLE',
  "presenceUpdatedAt" timestamptz default now(),
  "privacySettings" jsonb not null default '{}',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Subscriptions
-- ---------------------------------------------------------------------------
create table "subscription_plans" (
  "id" text primary key default gen_random_uuid()::text,
  "tier" "PlanTier" not null unique,
  "name" text not null,
  "priceUsd" integer not null,
  "features" jsonb not null default '{}'
);

create table "subscriptions" (
  "id" text primary key default gen_random_uuid()::text,
  "userId" text not null unique references "users"("id") on delete cascade,
  "planId" text not null references "subscription_plans"("id"),
  "status" "SubscriptionStatus" not null default 'ACTIVE',
  "stripeCustomerId" text,
  "stripeSubscriptionId" text,
  "currentPeriodEnd" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Library -- series & projects
-- ---------------------------------------------------------------------------
create table "series" (
  "id" text primary key default gen_random_uuid()::text,
  "userId" text not null references "users"("id") on delete cascade,
  "title" text not null,
  "description" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table "themes" (
  "id" text primary key default gen_random_uuid()::text,
  "name" text not null,
  "category" "ThemeCategory" not null,
  "isSystem" boolean not null default true,
  "config" jsonb not null default '{}',
  "seriesId" text unique references "series"("id"),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table "projects" (
  "id" text primary key default gen_random_uuid()::text,
  "userId" text not null references "users"("id") on delete cascade,
  "seriesId" text references "series"("id"),
  "seriesPosition" integer,
  "title" text not null,
  "coverImageUrl" text,
  "status" "ProjectStatus" not null default 'IDEA',
  "genres" text[] not null default '{}',
  "targetWordCount" integer,
  "lastEditedNodeId" text,
  "themeId" text references "themes"("id"),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Manuscript -- Part / Chapter / Scene tree
-- ---------------------------------------------------------------------------
create table "manuscript_nodes" (
  "id" text primary key default gen_random_uuid()::text,
  "projectId" text not null references "projects"("id") on delete cascade,
  "parentId" text references "manuscript_nodes"("id") on delete cascade,
  "type" "ManuscriptNodeType" not null,
  "title" text not null,
  "orderIndex" integer not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index "manuscript_nodes_project_parent_order_idx" on "manuscript_nodes" ("projectId","parentId","orderIndex");

create table "characters" (
  "id" text primary key default gen_random_uuid()::text,
  "projectId" text not null references "projects"("id") on delete cascade,
  "name" text not null,
  "nickname" text,
  "photoUrl" text,
  "age" text,
  "birthday" text,
  "appearance" text,
  "personality" text,
  "occupation" text,
  "family" text,
  "backstory" text,
  "goals" text,
  "motivation" text,
  "fears" text,
  "secrets" text,
  "likesDislikes" text,
  "arc" text,
  "dialogueStyle" text,
  "notes" text,
  "customFields" jsonb not null default '{}',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table "locations" (
  "id" text primary key default gen_random_uuid()::text,
  "projectId" text not null references "projects"("id") on delete cascade,
  "name" text not null,
  "description" text,
  "notes" text,
  "customFields" jsonb not null default '{}',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table "scenes" (
  "id" text primary key default gen_random_uuid()::text,
  "nodeId" text not null unique references "manuscript_nodes"("id") on delete cascade,
  "content" jsonb not null default '{}',
  "wordCount" integer not null default 0,
  "povCharacterId" text references "characters"("id"),
  "locationId" text references "locations"("id"),
  "storyDate" text,
  "status" "SceneStatus" not null default 'PLANNED',
  "purpose" text,
  "plotline" text,
  "notes" text,
  "targetWordCount" integer,
  "characterIds" text[] not null default '{}',
  "updatedAt" timestamptz not null default now()
);

create table "scene_versions" (
  "id" text primary key default gen_random_uuid()::text,
  "sceneId" text not null references "scenes"("id") on delete cascade,
  "content" jsonb not null,
  "wordCount" integer not null,
  "savedById" text,
  "createdAt" timestamptz not null default now()
);
create index "scene_versions_scene_created_idx" on "scene_versions" ("sceneId","createdAt");

-- ---------------------------------------------------------------------------
-- 5. Story bible
-- ---------------------------------------------------------------------------
create table "story_bible_entries" (
  "id" text primary key default gen_random_uuid()::text,
  "projectId" text references "projects"("id") on delete cascade,
  "authorId" text,
  "type" "StoryBibleEntryType" not null,
  "title" text not null,
  "body" text,
  "customFields" jsonb not null default '{}',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index "story_bible_entries_project_type_idx" on "story_bible_entries" ("projectId","type");

-- ---------------------------------------------------------------------------
-- 6. Visual plot board
-- ---------------------------------------------------------------------------
create table "plot_board_cards" (
  "id" text primary key default gen_random_uuid()::text,
  "projectId" text not null references "projects"("id") on delete cascade,
  "title" text not null,
  "column" text not null,
  "orderIndex" integer not null,
  "colorTag" text,
  "sceneId" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index "plot_board_cards_project_column_order_idx" on "plot_board_cards" ("projectId","column","orderIndex");

-- ---------------------------------------------------------------------------
-- 7. Media
-- ---------------------------------------------------------------------------
create table "media_assets" (
  "id" text primary key default gen_random_uuid()::text,
  "ownerId" text not null references "users"("id") on delete cascade,
  "projectId" text references "projects"("id") on delete cascade,
  "url" text not null,
  "altText" text,
  "attachedToType" "MediaAttachedToType" not null,
  "attachedToId" text,
  "createdAt" timestamptz not null default now()
);
create index "media_assets_project_attached_idx" on "media_assets" ("projectId","attachedToType","attachedToId");

-- ---------------------------------------------------------------------------
-- 8. Collaboration -- the ONLY path to manuscript access
-- ---------------------------------------------------------------------------
create table "collaborators" (
  "id" text primary key default gen_random_uuid()::text,
  "projectId" text not null references "projects"("id") on delete cascade,
  "userId" text not null references "users"("id") on delete cascade,
  "role" "CollaboratorRole" not null,
  "status" "CollaboratorStatus" not null default 'INVITED',
  "invitedAt" timestamptz not null default now(),
  "respondedAt" timestamptz,
  unique ("projectId","userId")
);

-- ---------------------------------------------------------------------------
-- 9. Social -- friends, circles
-- ---------------------------------------------------------------------------
create table "friendships" (
  "id" text primary key default gen_random_uuid()::text,
  "userIdA" text not null references "users"("id") on delete cascade,
  "userIdB" text not null references "users"("id") on delete cascade,
  "status" "FriendshipStatus" not null default 'PENDING',
  "createdAt" timestamptz not null default now(),
  unique ("userIdA","userIdB")
);

create table "writing_circles" (
  "id" text primary key default gen_random_uuid()::text,
  "name" text not null,
  "description" text,
  "ownerId" text not null,
  "createdAt" timestamptz not null default now()
);

create table "circle_members" (
  "id" text primary key default gen_random_uuid()::text,
  "circleId" text not null references "writing_circles"("id") on delete cascade,
  "userId" text not null references "users"("id") on delete cascade,
  "role" "CircleRole" not null default 'MEMBER',
  "joinedAt" timestamptz not null default now(),
  unique ("circleId","userId")
);

-- ---------------------------------------------------------------------------
-- 10. Writing sprints -- stats only, never manuscript content
-- ---------------------------------------------------------------------------
create table "sprints" (
  "id" text primary key default gen_random_uuid()::text,
  "creatorId" text not null references "users"("id") on delete cascade,
  "type" "SprintType" not null,
  "status" "SprintStatus" not null default 'SCHEDULED',
  "durationMinutes" integer not null,
  "wordGoal" integer,
  "circleId" text,
  "scheduledStart" timestamptz,
  "startedAt" timestamptz,
  "endedAt" timestamptz,
  "createdAt" timestamptz not null default now()
);

create table "sprint_participants" (
  "id" text primary key default gen_random_uuid()::text,
  "sprintId" text not null references "sprints"("id") on delete cascade,
  "userId" text not null references "users"("id") on delete cascade,
  "startingWordCount" integer not null default 0,
  "currentWordCount" integer not null default 0,
  "endingWordCount" integer,
  "joinedAt" timestamptz not null default now(),
  unique ("sprintId","userId")
);

-- ---------------------------------------------------------------------------
-- 11. Productivity -- goals, daily stats, achievements
-- ---------------------------------------------------------------------------
create table "writing_goals" (
  "id" text primary key default gen_random_uuid()::text,
  "userId" text not null references "users"("id") on delete cascade,
  "projectId" text references "projects"("id") on delete cascade,
  "type" "GoalType" not null,
  "label" text not null,
  "targetValue" integer not null,
  "deadline" timestamptz,
  "status" "GoalStatus" not null default 'ACTIVE',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table "daily_writing_stats" (
  "id" text primary key default gen_random_uuid()::text,
  "userId" text not null references "users"("id") on delete cascade,
  "projectId" text references "projects"("id") on delete cascade,
  "date" date not null,
  "wordCount" integer not null default 0,
  unique ("userId","projectId","date")
);

create table "user_achievements" (
  "id" text primary key default gen_random_uuid()::text,
  "userId" text not null references "users"("id") on delete cascade,
  "key" "AchievementKey" not null,
  "earnedAt" timestamptz not null default now(),
  unique ("userId","key")
);

-- ---------------------------------------------------------------------------
-- 12. Notifications
-- ---------------------------------------------------------------------------
create table "notifications" (
  "id" text primary key default gen_random_uuid()::text,
  "userId" text not null references "users"("id") on delete cascade,
  "type" "NotificationType" not null,
  "payload" jsonb not null default '{}',
  "readAt" timestamptz,
  "createdAt" timestamptz not null default now()
);
create index "notifications_user_read_idx" on "notifications" ("userId","readAt");

-- ---------------------------------------------------------------------------
-- 13. Formatting studio -- exports
-- ---------------------------------------------------------------------------
create table "exports" (
  "id" text primary key default gen_random_uuid()::text,
  "projectId" text not null references "projects"("id") on delete cascade,
  "type" "ExportType" not null,
  "status" "ExportStatus" not null default 'QUEUED',
  "themeId" text,
  "fileUrl" text,
  "errorMessage" text,
  "createdAt" timestamptz not null default now(),
  "completedAt" timestamptz
);

-- ---------------------------------------------------------------------------
-- Seed the subscription plan catalog (Free / Writer / Author Pro)
-- ---------------------------------------------------------------------------
insert into "subscription_plans" ("tier","name","priceUsd","features") values
  ('FREE', 'Free', 0, '{"maxProjects": 1, "sprintsEnabled": true, "formattingExportsPerMonth": 0}'),
  ('WRITER', 'Writer', 900, '{"maxProjects": null, "sprintsEnabled": true, "formattingExportsPerMonth": 0}'),
  ('AUTHOR_PRO', 'Author Pro', 1900, '{"maxProjects": null, "sprintsEnabled": true, "formattingExportsPerMonth": null, "aiCreditsPerMonth": 100}');
