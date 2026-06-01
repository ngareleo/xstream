import { useEffect } from "react";

/** Sets `document.title` while the calling component is mounted. A nullish or
 *  empty value is ignored, so a parent can defer to a child that owns the
 *  title (e.g. the home route yields to the film-overlay's movie title). */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return;
    document.title = title;
  }, [title]);
}
