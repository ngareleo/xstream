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

import { mergeClasses } from "@griffel/react";
import { Component, type ErrorInfo, type FC, type ReactNode, useState } from "react";
import { IconBug, IconRefresh, IconClose, IconChat, LogoShield } from "../../lib/icons.js";
import { useErrorBoundaryStyles } from "./ErrorBoundary.styles.js";

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
  const s = useErrorBoundaryStyles();

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
        <div className={s.previewBanner}>
          <span className={s.previewLabel}>DEV PREVIEW</span>
          <span className={s.previewSub}>Customer view — no stack traces are shown below</span>
          <button className={mergeClasses(s.actionBtn, s.previewBack)} onClick={() => setPreviewProd(false)}>
            ← Back to dev view
          </button>
        </div>
        <ProdErrorScreen onReset={onReset} />
      </div>
    );
  }

  return (
    <div className={mergeClasses(s.root, s.dev)}>
      <div className={s.grain} />

      <div className={s.panel}>
        <div className={s.head}>
          <div className={s.headLeft}>
            <span className={s.iconWrap}>
              <IconBug size={16} />
            </span>
            <div>
              <div className={s.label}>Unhandled render error</div>
              <div className={s.errorName}>{error.name}</div>
            </div>
          </div>
          <div className={s.headActions}>
            <button
              className={mergeClasses(s.actionBtn, s.actionPreview)}
              onClick={() => setPreviewProd(true)}
              title="See what a customer would see"
            >
              Preview customer view
            </button>
            <button className={s.actionBtn} onClick={handleCopy} title="Copy error to clipboard">
              {copied ? "Copied!" : "Copy"}
            </button>
            <button className={mergeClasses(s.actionBtn, s.actionPrimary)} onClick={onReset}>
              <IconRefresh size={12} />
              Try again
            </button>
            <button className={s.actionBtn} onClick={() => window.location.reload()} title="Hard reload">
              Reload page
            </button>
          </div>
        </div>

        <div className={s.message}>{error.message}</div>

        <div className={s.sectionLabel}>JavaScript stack</div>
        <pre className={s.code}>{error.stack}</pre>

        {errorInfo.componentStack && (
          <>
            <div className={s.sectionLabel}>React component stack</div>
            <pre className={mergeClasses(s.code, s.componentStack)}>
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

const ProdErrorScreen: FC<{ onReset: () => void }> = ({ onReset }) => {
  const s = useErrorBoundaryStyles();
  return (
    <div className={mergeClasses(s.root, s.prod)}>
      <div className={s.grain} />
      <div className={s.prodBody}>
        <LogoShield />
        <div className={s.prodTitle}>Something went wrong</div>
        <div className={s.prodSub}>
          Moran ran into an unexpected problem. Your library and watchlist
          are safe — this is a display issue only.
        </div>

        <div className={s.prodSteps}>
          <div className={s.prodStepLabel}>Things to try</div>
          <div className={s.prodStep}>
            <span className={s.prodStepNum}>1</span>
            <div className={s.prodStepBody}>
              <strong>Retry</strong> — tap the button below to reload just this screen without a full page refresh.
            </div>
          </div>
          <div className={s.prodStep}>
            <span className={s.prodStepNum}>2</span>
            <div className={s.prodStepBody}>
              <strong>Reload the page</strong> — a full browser reload clears any stale state.
            </div>
          </div>
          <div className={s.prodStep}>
            <span className={s.prodStepNum}>3</span>
            <div className={s.prodStepBody}>
              <strong>Clear your cache</strong> — open your browser's history settings, clear cached files, then reload.
            </div>
          </div>
        </div>

        <div className={s.prodActions}>
          <button className={mergeClasses(s.actionBtn, s.actionPrimary)} onClick={onReset} style={{ fontSize: 13, padding: "10px 22px" }}>
            <IconRefresh size={14} />
            Try again
          </button>
          <button
            className={mergeClasses(s.actionBtn, s.btnGhost)}
            onClick={() => window.location.reload()}
            style={{ fontSize: 13, padding: "10px 22px" }}
          >
            <IconClose size={14} />
            Reload page
          </button>
        </div>

        <div className={s.prodContact}>
          <IconChat size={13} />
          <span>
            Still having trouble?{" "}
            <a className={s.prodLink} href="mailto:support@moran.app">
              Contact support
            </a>
            {" "}or visit{" "}
            <a className={s.prodLink} href="https://help.moran.app">
              help.moran.app
            </a>
          </span>
        </div>
      </div>
    </div>
  );
};

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
