import { context } from "@opentelemetry/api";
import { createClient } from "graphql-ws";
import type { FetchFunction, SubscribeFunction } from "relay-runtime";
import { Environment, Network, Observable, RecordSource, Store } from "relay-runtime";

import { graphqlHttpUrl, graphqlWsUrl } from "~/config/rustOrigin.js";
import { getAccessToken } from "~/services/auth.js";
import { getSessionContext } from "~/services/playbackSession.js";

const SERVER_URL = graphqlHttpUrl();
const WS_URL = graphqlWsUrl();

// `connectionParams` is read once per upgrade by graphql-ws; supplying a
// function lets the WS handshake pick up the latest access token even
// after the SDK has auto-refreshed it. Subscription resolvers do not
// gate on identity in alpha, but the field is in place for follow-up.
const wsClient = createClient({
  url: WS_URL,
  connectionParams: async () => {
    const token = await getAccessToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  },
});

const fetchFn: FetchFunction = async (operation, variables) => {
  // Pull the JWT per request — Supabase auto-refreshes in the
  // background, so a stale module-level read could race against a
  // refresh.
  const accessToken = await getAccessToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  // Wrap fetch in the active session context so FetchInstrumentation injects
  // the correct traceparent, linking GraphQL mutations to the playback trace.
  const response = await context.with(getSessionContext(), () =>
    fetch(SERVER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: operation.text, variables }),
    })
  );
  return response.json();
};

const subscribeFn: SubscribeFunction = (operation, variables) => {
  return Observable.create((sink) => {
    const unsubscribe = wsClient.subscribe(
      { query: operation.text ?? "", variables },
      {
        next: (data) => sink.next(data as Parameters<typeof sink.next>[0]),
        error: sink.error.bind(sink),
        complete: sink.complete.bind(sink),
      }
    );
    return () => unsubscribe();
  });
};

export const environment = new Environment({
  network: Network.create(fetchFn, subscribeFn),
  store: new Store(new RecordSource()),
});
