import { describe, expect, it } from "bun:test";

import { parseTitleFromFilename } from "../libraryScanner.js";

describe("parseTitleFromFilename", () => {
  // ── Standard dot-separated torrent names ─────────────────────────────────
  it("handles dot-separated title with 4-digit year", () => {
    expect(parseTitleFromFilename("Dune.Part.Two.2024.2160p.mkv")).toEqual({
      title: "Dune Part Two",
      year: 2024,
    });
  });

  it("handles classic dot-separated title", () => {
    expect(parseTitleFromFilename("The.Shining.1980.1080p.mkv")).toEqual({
      title: "The Shining",
      year: 1980,
    });
  });

  it("handles foreign-language label in name", () => {
    expect(parseTitleFromFilename("Parasite.Korean.2019.mkv")).toEqual({
      title: "Parasite Korean",
      year: 2019,
    });
  });

  // ── Parenthesized year ────────────────────────────────────────────────────
  it("handles parenthesized year followed by quality token", () => {
    expect(parseTitleFromFilename("Furiosa: A Mad Max Saga (2024) 4K.mkv")).toEqual({
      title: "Furiosa: A Mad Max Saga",
      year: 2024,
    });
  });

  it("handles parenthesized year at end of base name", () => {
    expect(parseTitleFromFilename("Mad Max: Fury Road (2015).mkv")).toEqual({
      title: "Mad Max: Fury Road",
      year: 2015,
    });
  });

  // ── Year at end of string (no trailing separator) ─────────────────────────
  it("handles year at very end of base name (no trailing chars)", () => {
    expect(parseTitleFromFilename("One Battle After Another 2025.mkv")).toEqual({
      title: "One Battle After Another",
      year: 2025,
    });
  });

  // ── No year present ───────────────────────────────────────────────────────
  it("strips resolution token when no year is present", () => {
    expect(parseTitleFromFilename("Memento.1080p.mkv")).toEqual({
      title: "Memento",
      year: undefined,
    });
  });

  it("returns full base name when no year or resolution token found", () => {
    expect(parseTitleFromFilename("Some_Unknown_Film.mkv")).toEqual({
      title: "Some Unknown Film",
      year: undefined,
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────
  it("normalises underscores and multiple spaces", () => {
    expect(parseTitleFromFilename("The_Dark_Knight.2008.BluRay.mkv")).toEqual({
      title: "The Dark Knight",
      year: 2008,
    });
  });

  it("ignores invalid years (before 1900)", () => {
    // 1850 is outside 19xx/20xx range — should not be extracted as year
    const { year } = parseTitleFromFilename("Old.Title.1850.mkv");
    expect(year).toBeUndefined();
  });

  it("handles hyphen-separated name", () => {
    // "2049" is ambiguous — it's both the movie title suffix and looks like a year.
    // The parser picks the first year-like token; callers disambiguate via OMDb results.
    expect(parseTitleFromFilename("Blade-Runner-2049-2017-4K.mkv")).toEqual({
      title: "Blade-Runner", // hyphens are not normalised to spaces
      year: 2049,
    });
  });
});
