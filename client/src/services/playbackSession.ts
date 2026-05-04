import { type Context, context } from "@opentelemetry/api";

// Store OTel context for playback session; correlates async callback logs. Browser has no AsyncLocalStorage.

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
