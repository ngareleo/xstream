import { makeExecutableSchema } from "@graphql-tools/schema";
import { assertValidSchema } from "graphql";
import { createYoga } from "graphql-yoga";

import { jobResolvers } from "../graphql/resolvers/job.js";
import { libraryResolvers } from "../graphql/resolvers/library.js";
import { mutationResolvers } from "../graphql/resolvers/mutation.js";
import { queryResolvers } from "../graphql/resolvers/query.js";
import { subscriptionResolvers } from "../graphql/resolvers/subscription.js";
import { videoResolvers } from "../graphql/resolvers/video.js";
import { typeDefs } from "../graphql/schema.js";

const schema = makeExecutableSchema({
  typeDefs,
  resolvers: [
    queryResolvers,
    libraryResolvers,
    videoResolvers,
    jobResolvers,
    mutationResolvers,
    subscriptionResolvers,
  ],
  resolverValidationOptions: {
    // Warn at startup if any field that declares arguments has no resolver —
    // catches missing implementations for argument-driven fields before the
    // client hits them at runtime.
    requireResolversForArgs: "warn",
  },
});

// Validate the schema itself is internally consistent (types reference each other correctly,
// no missing interface implementations, etc.). Throws on structural errors.
assertValidSchema(schema);

export const yoga = createYoga({
  schema,
  graphqlEndpoint: "/graphql",
  cors:
    process.env.NODE_ENV === "production"
      ? false
      : { origin: "http://localhost:5173", credentials: true },
});
