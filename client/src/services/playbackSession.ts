import { type Context, context } from "@opentelemetry/api";

// Holds the OTel context for the active playback session so that log records
// emitted from async callbacks (fetch completions, RAF, Promise chains) are
// correlated to the session span. The browser has no AsyncLocalStorage, so
// context.with() only covers the synchronous frame — this module bridges that.

let _sessionCtx: Context = context.active();

export function setSessionContext(ctx: Context): void {
  _sessionCtx = ctx;
}

export function clearSessionContext(): void {
  _sessionCtx = context.active();
}

export function getSessionContext(): Context {
  return _sessionCtx;
}
