// Prisma 7 moved database connection config out of schema.prisma and into
// this file. See docs/decisions/0003-prisma-7-config-migration.md.
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "packages/database/prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
