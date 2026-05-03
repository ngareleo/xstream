/**
 * ErrorBoundary — catches unhandled render errors and shows a recovery screen.
 *
 * Two modes driven by process.env.NODE_ENV:
 *
 *   DEV   — full stack trace + React component stack in a scrollable code block,
 *            copy-to-clipboard, and a "reload" escape hatch.
 *            Includes a "Preview customer view" toggle so devs can see exactly
 *            what a customer would see without switching to prod.
 *
 *   PROD  — renders the M9 ErrorPage (red-bordered identity, optional stack
 *            details, "← Back to library" + "Retry" CTAs).
 *
 * Usage — wrap the entire app in main.tsx:
 *   <ErrorBoundary>
 *     <RouterProvider router={router} />
 *   </ErrorBoundary>
 */

import { mergeClasses } from "@griffel/react";
import { Component, type ErrorInfo, type FC, type ReactNode, useState } from "react";

import { IconBug, IconRefresh } from "~/lib/icons.js";
import ErrorPage from "~/pages/error-page/ErrorPage.js";
import { getClientLogger } from "~/telemetry.js";

import { strings } from "./ErrorBoundary.strings.js";
import { useErrorBoundaryStyles } from "./ErrorBoundary.styles.js";

const log = getClientLogger("errorBoundary");

// ── DevErrorScreen ────────────────────────────────────────────────────────────

const DevErrorScreen: FC<{
  error: Error;
  errorInfo: ErrorInfo;
  onReset: () => void;
}> = ({ error, errorInfo, onReset }) => {
  const [copied, setCopied] = useState(false);
  const [previewProd, setPreviewProd] = useState(false);
  const styles = useErrorBoundaryStyles();

  const fullText = [
    `${error.name}: ${error.message}`,
    "",
    "── JavaScript stack ─────────────────────────",
    error.stack ?? "(no stack)",
    "",
    "── React component stack ────────────────────",
    errorInfo.componentStack?.trim() ?? "(no component stack)",
  ].join("\n");

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (previewProd) {
    return (
      <div style={{ position: "relative" }}>
        <div className={styles.previewBanner}>
          <span className={styles.previewLabel}>{strings.devPreviewBanner}</span>
          <span className={styles.previewSub}>{strings.devPreviewSub}</span>
          <button
            className={mergeClasses(styles.actionBtn, styles.previewBack)}
            onClick={() => setPreviewProd(false)}
          >
            {strings.devPreviewBack}
          </button>
        </div>
        <ErrorPage
          error={error}
          componentStack={errorInfo.componentStack ?? null}
          onRetry={onReset}
        />
      </div>
    );
  }

  return (
    <div className={mergeClasses(styles.root, styles.devRoot)}>
      <div className={styles.grain} />

      <div className={styles.panel}>
        <div className={styles.head}>
          <div className={styles.headLeft}>
            <span className={styles.iconWrap}>
              <IconBug size={16} />
            </span>
            <div>
              <div className={styles.label}>{strings.devUnhandledError}</div>
              <div className={styles.errorName}>{error.name}</div>
            </div>
          </div>
          <div className={styles.headActions}>
            <button
              className={mergeClasses(styles.actionBtn, styles.actionPreview)}
              onClick={() => setPreviewProd(true)}
            >
              {strings.devPreviewCustomerView}
            </button>
            <button className={styles.actionBtn} onClick={handleCopy}>
              {copied ? strings.devCopied : strings.devCopy}
            </button>
            <button
              className={mergeClasses(styles.actionBtn, styles.actionPrimary)}
              onClick={onReset}
            >
              <IconRefresh size={12} />
              {strings.devTryAgain}
            </button>
            <button className={styles.actionBtn} onClick={() => window.location.reload()}>
              {strings.devReloadPage}
            </button>
          </div>
        </div>

        <div className={styles.message}>{error.message}</div>

        <div className={styles.sectionLabel}>{strings.devJsStack}</div>
        <pre className={styles.code}>{error.stack}</pre>

        {errorInfo.componentStack && (
          <>
            <div className={styles.sectionLabel}>{strings.devComponentStack}</div>
            <pre className={mergeClasses(styles.code, styles.componentStack)}>
              {errorInfo.componentStack.trim()}
            </pre>
          </>
        )}
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
    log.error("Unhandled render error", {
      error_name: error.name,
      message: error.message,
      component_stack: errorInfo.componentStack?.trim() ?? "",
    });
  }

  handleReset = (): void => {
    (window as unknown as { __devToolsReset?: () => void }).__devToolsReset?.();
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;

    if (!hasError || !error) return this.props.children;

    if (process.env.NODE_ENV !== "production") {
      return (
        <DevErrorScreen
          error={error}
          errorInfo={errorInfo ?? { componentStack: null }}
          onReset={this.handleReset}
        />
      );
    }

    return (
      <ErrorPage
        error={error}
        componentStack={errorInfo?.componentStack ?? null}
        onRetry={this.handleReset}
      />
    );
  }
}
