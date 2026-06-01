import { describe, expect, it } from "vitest";

import {
  type FilterRow,
  pickSuggestions,
} from "~/components/home-films-section/HomeFilmsSection.utils.js";

// pickSuggestions only reads id / director / genre / resolution / node, so a
// thin fixture is enough to pin the behaviour that regressed (#7): each
// suggestion must carry the Film id, not the bestCopy Video id.
function row(
  id: string,
  over: { director?: string; genre?: string; resolution?: string } = {}
): FilterRow {
  return {
    id,
    director: over.director ?? "",
    genre: over.genre ?? "drama",
    resolution: over.resolution ?? "1080p",
    node: { __videoId: `video-of-${id}` },
  } as unknown as FilterRow;
}

describe("pickSuggestions", () => {
  it("carries the Film id (not the Video id) for each suggestion", () => {
    const target = row("film-1", { director: "villeneuve", genre: "sci-fi" });
    const match = row("film-2", { director: "villeneuve", genre: "sci-fi" });
    const result = pickSuggestions(target, [target, match]);

    expect(result).toHaveLength(1);
    expect(result[0].filmId).toBe("film-2");
    // The Video fragment ref is still the matched film's bestCopy node.
    expect(result[0].video).toBe(match.node);
  });

  it("excludes the target film itself", () => {
    const target = row("film-1");
    expect(pickSuggestions(target, [target])).toHaveLength(0);
  });

  it("orders shared-director matches ahead of unrelated films", () => {
    const target = row("film-1", { director: "nolan", genre: "thriller" });
    const sameDirector = row("film-2", { director: "nolan", genre: "comedy" });
    const unrelated = row("film-3", { director: "someone", genre: "comedy" });
    const result = pickSuggestions(target, [target, unrelated, sameDirector]);

    expect(result[0].filmId).toBe("film-2");
  });
});
