---
name: axiom
description: Read OTel traces + logs from the team's Axiom dataset via the Axiom REST + APL API. Use to verify telemetry is reaching production / dev-flag-on Axiom — never drive Axiom in a browser when you can curl it.
---

# Axiom

Query the team's Axiom dataset (`xstream` on `cloud.us-east-1.aws`) from the shell. Use this **whenever** the task is "did event X reach Axiom?" / "what's the trace count over the last hour?" / "show me all `playback.session` spans for trace Y" — one `curl` returns parsable JSON and skips the browser-tab cost.

For local-Seq dev queries, use the `seq` skill instead. Both backends host xstream telemetry; they're swapped by the `flag.useAxiomExporter` runtime flag (see `docs/architecture/Deployment/04-Axiom-Production-Backend.md`).

## When NOT to use this skill

- User explicitly asks to *see* the Axiom UI ("open Axiom", "show me the dashboard") — use the `browser` skill.
- You need to take a screenshot for the user — use `browser`.

## Self-update rule

When you discover a new query pattern, dataset, or API quirk this session, **append it to the "Tips" section of this file before finishing**. Future sessions rely on this.

## 1. Extract the auth token from `.env`

The dev token lives in repo-root `.env`:

```sh
# Server-side token (use this — it's the one the Rust server posts with)
TOKEN=$(grep '^OTEL_EXPORTER_OTLP_AXIOM_HEADERS=' /home/dag/Projects/xstream/.env \
  | sed -E 's/.*Authorization=Bearer ([^,"]+).*/\1/')
echo "Token prefix: ${TOKEN:0:8}..."
```

The token starts with `xaat-` (Axiom Application API Token prefix). If `.env` is missing or has placeholder `<xstream-server-dev>` content, stop and tell the user to populate it per `04-Axiom-Production-Backend.md` § "Bring-up checklist".

**Token-scope caveat.** Spec says we use Basic (ingest-only) tokens. In practice some dev tokens have been minted with broader scope. If `GET /v1/datasets` (below) succeeds with your token, you have read scope too — useful for this skill but worth flagging in PR review since it weakens the threat model in `05-Telemetry-Ingestion-Security.md`.

## 2. Probe endpoint health

Two endpoints to know — they accept different APIs:

| Endpoint | Use for |
|---|---|
| `https://api.axiom.co` | REST API: `/v1/datasets`, `/v1/datasets/_apl` (queries). |
| `https://us-east-1.aws.edge.axiom.co` | OTLP ingest only: `/v1/traces`, `/v1/logs`, `/v1/metrics`. **404s on `/v1/datasets`.** |

Quick reachability + token check:

```sh
curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  https://api.axiom.co/v1/datasets
```

`HTTP 200` = token works + has read scope. `HTTP 401` = token rejected. `HTTP 403` = ingest-only token (you cannot read; this skill is mostly useless — ask user for a read-capable token).

## 3. Confirm the `xstream` dataset exists

```sh
curl -sS -H "Authorization: Bearer $TOKEN" https://api.axiom.co/v1/datasets \
  | python3 -c "import json, sys; ds=json.load(sys.stdin); print('\n'.join(d['name'] + ' (' + d.get('edgeDeployment', '?') + ')' for d in ds))"
```

Expect `xstream (cloud.us-east-1.aws)` in the list. If missing, the user hasn't minted the dataset yet — stop.

## 4. Run an APL query

Axiom uses **APL** (Axiom Processing Language), NOT Seq's SQL-like filter. The query endpoint:

```sh
curl -sS -X POST "https://api.axiom.co/v1/datasets/_apl?format=tabular" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "apl": "['"'"'xstream'"'"'] | where _time > ago(1h) | count",
    "startTime": "'"$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)"'",
    "endTime":   "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
  }' | python3 -m json.tool
```

Notes:
- Dataset name in APL is **wrapped in single quotes inside square brackets**: `['xstream']`. Bare `xstream` errors.
- `_time > ago(1h)` is APL's "last hour" predicate.
- `?format=tabular` returns `matches[]` rows; omit for the raw protobuf-shaped response.
- Always pass `startTime` + `endTime` in ISO 8601 UTC. Without them the query window defaults narrowly; older events appear missing.

## 5. Common queries (copy/paste templates)

Assumes `TOKEN` is set per § 1.

```sh
# Total event count in the last hour
APL="['xstream'] | where _time > ago(1h) | count"

# Count by service.name to see client vs server share
APL="['xstream'] | where _time > ago(1h) | summarize count() by ['attributes.service.name']"

# Distinct trace IDs in the last 24h
APL="['xstream'] | where _time > ago(24h) | distinct ['attributes.trace_id']"

# All events for a specific trace (use the 32-hex traceparent middle field)
TRACE_ID="ca7fc90d4c58f84cfd9f7381b7a2c94c"
APL="['xstream'] | where ['attributes.trace_id'] == '$TRACE_ID' | order by _time asc"

# Dev-environment-only events
APL="['xstream'] | where ['attributes.deployment.environment'] == 'development' | summarize count()"

# Then run:
curl -sS -X POST "https://api.axiom.co/v1/datasets/_apl?format=tabular" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"apl\":\"$APL\",\"startTime\":\"$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)\",\"endTime\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
  | python3 -m json.tool
```

## 6. Verifying ingest end-to-end after a change

A common task: "I just toggled `flag.useAxiomExporter` ON and played a video — did events arrive?"

```sh
# 1. Note the current timestamp BEFORE you trigger telemetry in the app
T0=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# 2. Trigger the action in the app (play a video, etc.)

# 3. Wait ~15 s for BatchSpanProcessor / BatchLogRecordProcessor to flush

# 4. Count events that arrived since T0 in the dev-environment slice
TOKEN=$(grep '^OTEL_EXPORTER_OTLP_AXIOM_HEADERS=' /home/dag/Projects/xstream/.env | sed -E 's/.*Authorization=Bearer ([^,"]+).*/\1/')
curl -sS -X POST "https://api.axiom.co/v1/datasets/_apl?format=tabular" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"apl\":\"['xstream'] | where _time >= datetime($T0) and ['attributes.deployment.environment'] == 'development' | count\",\"startTime\":\"$T0\",\"endTime\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
  | python3 -m json.tool
```

`> 0` rows in the result = ingest works. `0` rows after 30 s wait = check the browser DevTools Network tab for the POST status (CORS / 401 / wrong endpoint).

## 7. Failure modes at a glance

| Symptom | Likely cause |
|---|---|
| Empty result in APL but BatchSpanProcessor flushed in browser | CORS rejected the POST — check DevTools Network for `(blocked: CORS)`. Axiom edge endpoint may need an allow-list for `http://localhost:5173`. |
| `HTTP 401` on `/v1/datasets` | Token expired or revoked. Check Axiom UI Settings → API tokens. |
| `HTTP 403` on `/v1/datasets` | Token is ingest-only — fine for app traffic, but you need a read-scoped token (Advanced or PAT) to run this skill. |
| `HTTP 422` on `/v1/datasets/_apl` with "invalid APL" | Likely missing `['xstream']` quoting around the dataset name. |
| `HTTP 404` on `/v1/datasets` against `us-east-1.aws.edge.axiom.co` | Wrong endpoint — REST API lives on `api.axiom.co`. Edge URL only serves OTLP ingest. |
| Server-side spans missing but client-side present | Server-rust process started before `.env` was sourced. Restart `bun run dev`. |

## Tips

*Appended by agents as they discover query patterns or quirks. Keep entries scoped — a one-line lesson, not an essay.*

- **Dataset names in APL are bracket-quoted.** `['xstream']` not bare `xstream`. Bare names cause "invalid query" errors.
- **`api.axiom.co` ≠ `us-east-1.aws.edge.axiom.co`.** REST API (datasets / queries) lives on `api.axiom.co`. Edge URL accepts OTLP ingest but 404s on `/v1/datasets`. Empirically verified 2026-05-11.
- **`POST /v1/traces` returns 422 when auth + path are right but body is empty.** Use this for cheap reachability/auth checks: `curl -sS -X POST <endpoint>/v1/traces -H "Authorization: Bearer $TOKEN" -H "X-Axiom-Dataset: xstream"` — anything except 422 means a real failure.
- **`xaat-` token scope is finer than "ingest vs read".** Basic ingest tokens CAN return `GET /v1/datasets` (200, with the org's dataset list) yet still 403 on `POST /v1/datasets/_apl` with `"token does not have access to resource: query with action: read"`. Listing datasets and running APL queries are separate permissions in Axiom's model. To run the queries in this skill you need a token with `query:read` action — mint one in **Settings → API tokens → New token → Advanced** with Datasets=`xstream`, Actions=`Read` (do not commit it to `.env`; use a separate `.env.local` line or pass inline).
- **Dev verification fallback if no read token.** When the ingest token can't query, confirm data lands by opening the Axiom UI dataset explorer directly: `https://app.axiom.co/<org>/datasets/xstream`. Events appear within ~30 s of an action that emits them. The skill's CLI verification path requires a read-scoped token.
- **Rsbuild `/relay/axiom` proxy + IPv4-only DNS.** The dev proxy at `client/rsbuild.config.ts` forwards `/relay/axiom/*` to the Axiom edge endpoint. In environments where DNS returns only NAT64-prefixed AAAA records (`64:ff9b::`), Node v24's `https.request` defaults to IPv6 and times out (curl/bun fall back to IPv4 fine, Node doesn't). The fix in `client/package.json` is `NODE_OPTIONS=--dns-result-order=ipv4first` on the `dev` script. Even with that, ~20–30% of proxied POSTs still ETIMEDOUT under load — the fix isn't 100%. If you see "504 Gateway Timeout" from `/relay/axiom/v1/traces` in DevTools, that's the proxy giving up on an upstream that resolved to IPv6 anyway (connection pool reuse or similar). Most events still land; this is "known imperfect" not "broken".
- **`deployment.environment` is the dev/prod filter.** Set as resource attribute on every span by both client (`IS_DEV_BUILD ? "development" : "production"`) and server (driven by `XSTREAM_VARIANT`). Filter with `where ['attributes.deployment.environment'] == 'development'` to slice dev traffic.
- **Date ranges default narrow.** Always pass `startTime` and `endTime` in the query body, or older events appear missing. Use `date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ` to generate ISO timestamps.
