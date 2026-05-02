import { describe, expect, test } from "bun:test";

import {
  applyFilters,
  EMPTY_FILTERS,
  type FilterableFilm,
  filtersActive,
  toggleSetItem,
} from "~/utils/filters";

const f = (overrides: Partial<FilterableFilm> = {}): FilterableFilm => ({
  resolution: "1080p",
  hdr: null,
  codec: "HEVC",
  year: 2015,
  ...overrides,
});

describe("filtersActive", () => {
  test("returns 0 for empty filters", () => {
    expect(filtersActive(EMPTY_FILTERS)).toBe(0);
  });

  test("counts items across dimensions", () => {
    expect(
      filtersActive({
        resolutions: new Set(["4K"]),
        hdrs: new Set(),
        codecs: new Set(["HEVC", "AV1"]),
        decades: new Set([2010]),
      })
    ).toBe(4);
  });
});

describe("applyFilters", () => {
  test("returns input unchanged when no filters are active", () => {
    const list = [f({ year: 1995 }), f({ year: 2025 })];
    expect(applyFilters(list, EMPTY_FILTERS)).toEqual(list);
  });

  test("AND-logic across dimensions excludes non-matches", () => {
    const list = [
      f({ resolution: "4K", codec: "HEVC", year: 2015 }),
      f({ resolution: "1080p", codec: "HEVC", year: 2015 }),
      f({ resolution: "4K", codec: "AV1", year: 2015 }),
    ];
    const result = applyFilters(list, {
      ...EMPTY_FILTERS,
      resolutions: new Set(["4K"]),
      codecs: new Set(["HEVC"]),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.resolution).toBe("4K");
    expect(result[0]?.codec).toBe("HEVC");
  });

  test("decade bucketing groups years correctly", () => {
    const list = [f({ year: 1995 }), f({ year: 2003 }), f({ year: 2025 })];
    const result = applyFilters(list, {
      ...EMPTY_FILTERS,
      decades: new Set([1990, 2020]),
    });
    expect(result.map((x) => x.year)).toEqual([1995, 2025]);
  });

  test("films with null year are excluded by decade filter", () => {
    const list = [f({ year: null }), f({ year: 2015 })];
    const result = applyFilters(list, {
      ...EMPTY_FILTERS,
      decades: new Set([2010]),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.year).toBe(2015);
  });

  test("HDR null is treated as SDR sentinel '—'", () => {
    const list = [f({ hdr: null }), f({ hdr: "HDR10" })];
    const sdrOnly = applyFilters(list, {
      ...EMPTY_FILTERS,
      hdrs: new Set(["—"]),
    });
    expect(sdrOnly).toHaveLength(1);
    expect(sdrOnly[0]?.hdr).toBeNull();
  });
});

describe("toggleSetItem", () => {
  test("adds when absent", () => {
    const next = toggleSetItem(new Set([1, 2]), 3);
    expect([...next].sort()).toEqual([1, 2, 3]);
  });

  test("removes when present", () => {
    const next = toggleSetItem(new Set([1, 2, 3]), 2);
    expect([...next].sort()).toEqual([1, 3]);
  });

  test("returns a new Set (does not mutate input)", () => {
    const original = new Set([1]);
    const next = toggleSetItem(original, 2);
    expect(original).not.toBe(next);
    expect([...original]).toEqual([1]);
  });
});
