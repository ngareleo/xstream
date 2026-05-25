import { describe, expect, it } from "vitest";

import { env, parseHeadersEnv, readEnvString } from "~/config/env.js";

describe("parseHeadersEnv", () => {
  it("returns an empty object for undefined input", () => {
    expect(parseHeadersEnv(undefined)).toEqual({});
  });

  it("returns an empty object for an empty string", () => {
    expect(parseHeadersEnv("")).toEqual({});
  });

  it("parses a single key=value pair", () => {
    expect(parseHeadersEnv("Authorization=Bearer abc.def")).toEqual({
      Authorization: "Bearer abc.def",
    });
  });

  it("parses multiple comma-separated pairs", () => {
    expect(parseHeadersEnv("Authorization=Bearer xyz,X-Axiom-Dataset=xstream")).toEqual({
      Authorization: "Bearer xyz",
      "X-Axiom-Dataset": "xstream",
    });
  });

  it("trims whitespace around keys and values", () => {
    expect(parseHeadersEnv(" Foo = bar , Baz = qux ")).toEqual({
      Foo: "bar",
      Baz: "qux",
    });
  });

  it("preserves '=' characters inside values", () => {
    // Headers like `X-Token=abc=def=ghi` are split on the FIRST `=`.
    expect(parseHeadersEnv("X-Token=abc=def=ghi")).toEqual({
      "X-Token": "abc=def=ghi",
    });
  });

  it("skips pairs with no '='", () => {
    expect(parseHeadersEnv("a=1,malformed,b=2")).toEqual({ a: "1", b: "2" });
  });

  it("skips pairs with an empty key (leading '=')", () => {
    expect(parseHeadersEnv("=novalue,a=1")).toEqual({ a: "1" });
  });

  it("returns last-write-wins on duplicate keys", () => {
    expect(parseHeadersEnv("a=1,a=2")).toEqual({ a: "2" });
  });
});

describe("readEnvString", () => {
  it("returns undefined for undefined", () => {
    expect(readEnvString(undefined)).toBeUndefined();
  });

  it("normalises empty string to undefined", () => {
    expect(readEnvString("")).toBeUndefined();
  });

  it("passes non-empty strings through unchanged", () => {
    expect(readEnvString("https://example.com")).toBe("https://example.com");
  });

  it("does NOT trim — that's the caller's job if they care", () => {
    expect(readEnvString("  spaced  ")).toBe("  spaced  ");
  });
});

describe("env (exported shape)", () => {
  // These assertions are env-state-independent. The exact runtime values
  // depend on whatever `.env` the developer has locally; what we pin
  // here is the *shape* — every key exists with the right type.
  it("supabaseUrl is string-or-undefined", () => {
    const v = env.supabaseUrl;
    expect(v === undefined || typeof v === "string").toBe(true);
  });

  it("supabaseAnonKey is string-or-undefined", () => {
    const v = env.supabaseAnonKey;
    expect(v === undefined || typeof v === "string").toBe(true);
  });

  it("otelEndpoint is always a non-empty string (default fallback applies)", () => {
    expect(typeof env.otelEndpoint).toBe("string");
    expect(env.otelEndpoint.length).toBeGreaterThan(0);
  });

  it("otelHeaders is a string-valued record", () => {
    expect(env.otelHeaders).toBeTypeOf("object");
    for (const value of Object.values(env.otelHeaders)) {
      expect(typeof value).toBe("string");
    }
  });

  it("otelAxiomEndpoint is a string (empty if unset)", () => {
    expect(typeof env.otelAxiomEndpoint).toBe("string");
  });

  it("otelAxiomHeaders is a string-valued record", () => {
    expect(env.otelAxiomHeaders).toBeTypeOf("object");
    for (const value of Object.values(env.otelAxiomHeaders)) {
      expect(typeof value).toBe("string");
    }
  });
});
