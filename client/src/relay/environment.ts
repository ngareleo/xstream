import { context } from "@opentelemetry/api";
import { createClient } from "graphql-ws";
import type { FetchFunction, SubscribeFunction } from "relay-runtime";
import { Environment, Network, Observable, RecordSource, Store } from "relay-runtime";

import { graphqlHttpUrl, graphqlWsUrl } from "~/config/rustOrigin.js";
import { getAccessToken } from "~/services/auth.js";
import { getSessionContext } from "~/services/playbackSession.js";

const SERVER_URL = graphqlHttpUrl();
const WS_URL = graphqlWsUrl();

// Function form so the handshake sees the latest token after auto-refresh.
const wsClient = createClient({
  url: WS_URL,
  connectionParams: async () => {
    const token = await getAccessToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  },
});

const fetchFn: FetchFunction = async (operation, variables) => {
  // Per-request read avoids racing Supabase's background refresh.
  const accessToken = await getAccessToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  // FetchInstrumentation inherits the active playback context for traceparent linking.
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
