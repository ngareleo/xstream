/**
 * ErrorBoundary — catches unhandled render errors and shows a recovery screen.
 *
 * Two modes driven by import.meta.env.DEV:
 *
 *   DEV   — full stack trace + React component stack in a scrollable code block,
 *            copy-to-clipboard, and a "reload" escape hatch.
 *            Includes a "Preview customer view" toggle so devs can see exactly
 *            what a customer would see without switching to prod.
 *
 *   PROD  — customer-facing help page: friendly guidance, actionable steps,
 *            and a support contact. No internal details exposed.
 *
 * Usage — wrap the entire app in main.tsx:
 *   <ErrorBoundary>
 *     <BrowserRouter>
 *       <App />
 *     </BrowserRouter>
 *   </ErrorBoundary>
 *
 * The boundary resets when the user clicks "Try again", which re-mounts the
 * subtree. For navigation-triggered resets (e.g. clicking a sidebar link after
 * an error) wire resetKeys to the current pathname.
 */

import { Component, type ErrorInfo, type FC, type ReactNode, useState } from "react";
import { IconBug, IconRefresh, IconClose, IconChat, LogoShield } from "../../lib/icons.js";
import "./ErrorBoundary.css";

// ── DevErrorScreen ────────────────────────────────────────────────────────────
// Shows in development mode: full error message, JS stack, React component stack.
// Includes a "Preview customer view" toggle so devs can see the prod screen.

const DevErrorScreen: FC<{
  error: Error;
  errorInfo: ErrorInfo;
  onReset: () => void;
}> = ({ error, errorInfo, onReset }) => {
  const [copied, setCopied] = useState(false);
  const [previewProd, setPreviewProd] = useState(false);

  const fullText = [
    `${error.name}: ${error.message}`,
    "",
    "── JavaScript stack ─────────────────────────",
    error.stack ?? "(no stack)",
    "",
    "── React component stack ────────────────────",
    errorInfo.componentStack?.trim() ?? "(no component stack)",
  ].join("\n");

  const handleCopy = () => {
    void navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (previewProd) {
    return (
      <div style={{ position: "relative" }}>
        {/* Dev-only banner — not visible to customers */}
        <div className="eb-preview-banner">
          <span className="eb-preview-label">DEV PREVIEW</span>
          <span className="eb-preview-sub">Customer view — no stack traces are shown below</span>
          <button className="eb-action-btn eb-preview-back" onClick={() => setPreviewProd(false)}>
            ← Back to dev view
          </button>
        </div>
        <ProdErrorScreen onReset={onReset} />
      </div>
    );
  }

  return (
    <div className="eb-root eb-dev">
      <div className="eb-grain" />

      <div className="eb-panel">
        {/* Header */}
        <div className="eb-head">
          <div className="eb-head-left">
            <span className="eb-icon-wrap">
              <IconBug size={16} />
            </span>
            <div>
              <div className="eb-label">Unhandled render error</div>
              <div className="eb-error-name">{error.name}</div>
            </div>
          </div>
          <div className="eb-head-actions">
            <button
              className="eb-action-btn eb-action-preview"
              onClick={() => setPreviewProd(true)}
              title="See what a customer would see"
            >
              Preview customer view
            </button>
            <button className="eb-action-btn" onClick={handleCopy} title="Copy error to clipboard">
              {copied ? "Copied!" : "Copy"}
            </button>
            <button className="eb-action-btn eb-action-primary" onClick={onReset}>
              <IconRefresh size={12} />
              Try again
            </button>
            <button className="eb-action-btn" onClick={() => window.location.reload()} title="Hard reload">
              Reload page
            </button>
          </div>
        </div>

        {/* Error message */}
        <div className="eb-message">{error.message}</div>

        {/* JS stack */}
        <div className="eb-section-label">JavaScript stack</div>
        <pre className="eb-code">{error.stack}</pre>

        {/* React component stack */}
        {errorInfo.componentStack && (
          <>
            <div className="eb-section-label">React component stack</div>
            <pre className="eb-code eb-component-stack">
              {errorInfo.componentStack.trim()}
            </pre>
          </>
        )}
      </div>
    </div>
  );
};

// ── ProdErrorScreen ───────────────────────────────────────────────────────────
// Customer-facing help page. No stack traces, no internal detail.
// Guides the user through self-service steps before offering a support contact.

const ProdErrorScreen: FC<{ onReset: () => void }> = ({ onReset }) => (
  <div className="eb-root eb-prod">
    <div className="eb-grain" />
    <div className="eb-prod-body">
      <LogoShield />
      <div className="eb-prod-title">Something went wrong</div>
      <div className="eb-prod-sub">
        Moran ran into an unexpected problem. Your library and watchlist
        are safe — this is a display issue only.
      </div>

      <div className="eb-prod-steps">
        <div className="eb-prod-step-label">Things to try</div>
        <div className="eb-prod-step">
          <span className="eb-prod-step-num">1</span>
          <div className="eb-prod-step-body">
            <strong>Retry</strong> — tap the button below to reload just this screen without a full page refresh.
          </div>
        </div>
        <div className="eb-prod-step">
          <span className="eb-prod-step-num">2</span>
          <div className="eb-prod-step-body">
            <strong>Reload the page</strong> — a full browser reload clears any stale state.
          </div>
        </div>
        <div className="eb-prod-step">
          <span className="eb-prod-step-num">3</span>
          <div className="eb-prod-step-body">
            <strong>Clear your cache</strong> — open your browser's history settings, clear cached files, then reload.
          </div>
        </div>
      </div>

      <div className="eb-prod-actions">
        <button className="btn btn-red btn-md" onClick={onReset}>
          <IconRefresh size={14} />
          Try again
        </button>
        <button
          className="btn btn-ghost btn-md"
          onClick={() => window.location.reload()}
        >
          <IconClose size={14} />
          Reload page
        </button>
      </div>

      <div className="eb-prod-contact">
        <IconChat size={13} />
        <span>
          Still having trouble?{" "}
          <a className="eb-prod-link" href="mailto:support@moran.app">
            Contact support
          </a>
          {" "}or visit{" "}
          <a className="eb-prod-link" href="https://help.moran.app">
            help.moran.app
          </a>
        </span>
      </div>
    </div>
  </div>
);

// ── ErrorBoundary (class) ─────────────────────────────────────────────────────

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

interface Props {
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    // In production you'd log to Sentry / DataDog here:
    // logErrorToService(error, errorInfo);
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  handleReset = (): void => {
    // Clear any pending DevTools throw target so the re-mounted subtree doesn't
    // immediately re-throw. The hook is registered by DevToolsProvider in dev mode;
    // it's a no-op (undefined) in prod and in tests.
    (window as unknown as { __devToolsReset?: () => void }).__devToolsReset?.();
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;

    if (!hasError || !error) return this.props.children;

    if (import.meta.env.DEV) {
      return (
        <DevErrorScreen
          error={error}
          errorInfo={errorInfo ?? { componentStack: null }}
          onReset={this.handleReset}
        />
      );
    }

    return <ProdErrorScreen onReset={this.handleReset} />;
  }
}
