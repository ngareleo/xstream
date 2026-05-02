import { describe, expect, it } from "vitest";

import { upgradePosterUrl } from "~/utils/formatters.js";

describe("upgradePosterUrl", () => {
  it("rewrites the legacy _SX300 modifier to the requested width", () => {
    expect(upgradePosterUrl("https://m.media-amazon.com/images/M/abc._V1_SX300.jpg", 1600)).toBe(
      "https://m.media-amazon.com/images/M/abc._V1_SX1600.jpg"
    );
  });

  it("collapses a multi-modifier _V1_ run (QL/UY/CR) into a single _SX", () => {
    expect(
      upgradePosterUrl(
        "https://m.media-amazon.com/images/M/abc._V1_QL75_UY562_CR35,0,380,562_.jpg",
        1600
      )
    ).toBe("https://m.media-amazon.com/images/M/abc._V1_SX1600.jpg");
  });

  it("inserts _SX into a bare _V1_ URL", () => {
    expect(upgradePosterUrl("https://m.media-amazon.com/images/M/foo._V1_.jpg", 800)).toBe(
      "https://m.media-amazon.com/images/M/foo._V1_SX800.jpg"
    );
  });

  it("passes non-Amazon URLs through unchanged", () => {
    expect(upgradePosterUrl("https://example.com/poster.jpg", 1600)).toBe(
      "https://example.com/poster.jpg"
    );
  });

  it("uses 800px as the default width", () => {
    expect(upgradePosterUrl("https://m.media-amazon.com/images/M/abc._V1_SX300.jpg")).toBe(
      "https://m.media-amazon.com/images/M/abc._V1_SX800.jpg"
    );
  });
});
