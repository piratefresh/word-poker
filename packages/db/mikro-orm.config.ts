import { defineConfig } from "@mikro-orm/core";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { TsMorphMetadataProvider } from "@mikro-orm/reflection";
import { Actor, Director, Movie } from "./src/entities/index.js";

export default defineConfig({
  driver: PostgreSqlDriver,
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "admin",
  password: process.env.DB_PASS || "password",
  dbName: process.env.DB_NAME || "movie_db",
  entities: [Movie, Actor, Director],
  metadataProvider: TsMorphMetadataProvider,
  debug: true,
  allowGlobalContext: true,
  migrations: {
    path: "./src/migrations",
    glob: "!(*.d).{js,ts}",
  },
});
