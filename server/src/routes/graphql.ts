import { createYoga } from "graphql-yoga";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { assertValidSchema } from "graphql";
import { typeDefs } from "../graphql/schema.js";
import { queryResolvers } from "../graphql/resolvers/query.js";
import { mutationResolvers } from "../graphql/resolvers/mutation.js";
import { subscriptionResolvers } from "../graphql/resolvers/subscription.js";

const schema = makeExecutableSchema({
  typeDefs,
  resolvers: [queryResolvers, mutationResolvers, subscriptionResolvers],
  resolverValidationOptions: {
    // Warn at startup if any non-scalar field on Query, Mutation, or Subscription
    // has no resolver — catches schema/resolver drift before the client hits it.
    requireResolversForArgs: "warn",
  },
});

// Validate the schema itself is internally consistent (types reference each other correctly,
// no missing interface implementations, etc.). Throws on structural errors.
assertValidSchema(schema);

export const yoga = createYoga({
  schema,
  graphqlEndpoint: "/graphql",
  cors: {
    origin: process.env.NODE_ENV === "production" ? false : "http://localhost:5173",
    credentials: true,
  },
});
