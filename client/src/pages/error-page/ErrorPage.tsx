import { mergeClasses } from "@griffel/react";
import { type FC, useState } from "react";

import { strings } from "./ErrorPage.strings.js";
import { useErrorPageStyles } from "./ErrorPage.styles.js";

export interface ErrorPageProps {
  error?: Error | null;
  componentStack?: string | null;
  onRetry?: () => void;
}

const formatStack = (
  error: Error | null | undefined,
  componentStack: string | null | undefined
): string => {
  if (!error) return strings.placeholderStack;
  const head = `${error.name}: ${error.message}`;
  const js = error.stack ?? "(no stack)";
  const cs = componentStack?.trim();
  return cs ? `${head}\n\n${js}\n\n${cs}` : `${head}\n\n${js}`;
};

const ErrorPage: FC<ErrorPageProps> = ({ error, componentStack, onRetry }) => {
  const styles = useErrorPageStyles();
  const [showDetails, setShowDetails] = useState(false);

  const handleRetry = (): void => {
    if (onRetry) onRetry();
    else window.location.reload();
  };

  return (
    <div className={styles.shell}>
      <div className={styles.panel}>
        <div className={mergeClasses("eyebrow", styles.eyebrow)}>{strings.eyebrow}</div>
        <div className={styles.title}>{strings.title}</div>
        <p className={styles.body}>{error?.message ?? strings.body}</p>

        <button
          type="button"
          className={styles.detailsToggle}
          onClick={() => setShowDetails((v) => !v)}
          aria-expanded={showDetails}
        >
          {showDetails ? strings.hideDetails : strings.showDetails}
        </button>
        {showDetails && <pre className={styles.stack}>{formatStack(error, componentStack)}</pre>}

        <div className={styles.actions}>
          <a href="/" className={styles.ctaSecondary}>
            {strings.backToLibrary}
          </a>
          <button type="button" className={styles.ctaPrimary} onClick={handleRetry}>
            {strings.retry}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorPage;
