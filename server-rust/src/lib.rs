pub mod db;
pub mod graphql;
pub mod relay;
pub mod request_context;
pub mod telemetry;

use axum::{response::IntoResponse, routing::get, Router};

use crate::db::Db;
use crate::graphql::{build_schema, XstreamSchema};
use crate::request_context::extract_request_context;

#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    pub schema: XstreamSchema,
}

impl AppState {
    pub fn new(db: Db) -> Self {
        let schema = build_schema(db.clone());
        Self { db, schema }
    }
}

pub fn build_router(state: AppState) -> Router {
    use async_graphql_axum::{GraphQL, GraphQLSubscription};
    use axum::routing::MethodRouter;

    // POST /graphql → query/mutation handler
    // GET  /graphql → WebSocket upgrade for subscriptions (graphql-transport-ws)
    let graphql_method: MethodRouter<()> = MethodRouter::new()
        .post_service(GraphQL::new(state.schema.clone()))
        .get_service(GraphQLSubscription::new(state.schema.clone()))
        .options(|| async { axum::http::StatusCode::NO_CONTENT });

    Router::new()
        .route("/healthz", get(healthz))
        .route("/graphql", graphql_method)
        // Single outer middleware: extract W3C traceparent, build RequestContext,
        // create a per-request `http.request` span whose parent is the inbound
        // OTel context. Spans created downstream inherit it via Instrument.
        // We deliberately do NOT use `tower_http::TraceLayer`; its spans don't
        // inherit the W3C-extracted context, which silently breaks distributed
        // tracing across the client → server boundary.
        .layer(axum::middleware::from_fn(extract_request_context))
        .layer(make_cors())
        .fallback(|| async { (axum::http::StatusCode::NOT_FOUND, "Not Found") })
}

fn make_cors() -> tower_http::cors::CorsLayer {
    use http::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE};
    use http::Method;
    use tower_http::cors::{AllowOrigin, CorsLayer};

    // Dev-mode CORS — mirrors the Bun config (`server/src/routes/graphql.ts`).
    // Allowing both the Rsbuild dev server origin and the Tauri webview origin
    // (forward constraint, see `04-Web-Server-Layer.md` §4.1).
    let origins = AllowOrigin::list([
        "http://localhost:5173".parse().expect("static origin"),
        "tauri://localhost".parse().expect("static origin"),
    ]);
    CorsLayer::new()
        .allow_origin(origins)
        .allow_credentials(true)
        .allow_headers([
            CONTENT_TYPE,
            ACCEPT,
            AUTHORIZATION,
            "traceparent".parse().expect("static header name"),
            "tracestate".parse().expect("static header name"),
        ])
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
}

async fn healthz() -> impl IntoResponse {
    "ok"
}
