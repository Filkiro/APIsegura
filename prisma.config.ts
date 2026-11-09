import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Comando executado por: npx prisma db seed
    seed: "tsx prisma/seed.js",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
