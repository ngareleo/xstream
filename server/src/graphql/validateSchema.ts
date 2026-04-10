/**
 * Standalone script — validates the SDL in schema.ts by parsing it with graphql.
 * Run via: bun src/graphql/validateSchema.ts
 * Exits 0 on success, 1 on failure (CI-safe).
 */
import { buildSchema } from "graphql";

import { typeDefs } from "./schema.js";

try {
  buildSchema(typeDefs);
  console.log("GraphQL SDL is valid.");
  process.exit(0);
} catch (err) {
  console.error("GraphQL SDL validation failed:", (err as Error).message);
  process.exit(1);
}
