/** Wires the user-session state machine to telemetry (start/end log + session metrics). */

import { getClientLogger } from "~/telemetry.js";

import { recordSessionDuration, recordSessionStarted } from "./clientMetrics.js";
import { initUserSession } from "./userSession.js";

const log = getClientLogger("user-session");

/** Start session tracking and emit session-boundary telemetry. Call once at boot. */
export function startSessionTelemetry(): void {
  initUserSession({
    onStart: (sessionId) => {
      recordSessionStarted();
      log.info("Session started", { "session.id": sessionId });
    },
    onEnd: (sessionId, durationMs) => {
      recordSessionDuration(durationMs);
      log.info("Session ended", {
        "session.id": sessionId,
        "session.duration_ms": Math.round(durationMs),
      });
    },
  });
}
