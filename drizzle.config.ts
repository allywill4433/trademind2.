import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config();

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required to apply the database schema");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url },
});
