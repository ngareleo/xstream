#!/usr/bin/env bun
/**
 * Step 1 acceptance gate — diff the Rust GraphQL server's SDL against
 * `server/src/graphql/schema.ts`. Exits 0 on parity, 1 on drift.
 *
 * The check is *structural*: type set, field set per type, field types,
 * nullability, argument set per field, argument types and defaults, enum
 * variant set per enum, union member set per union. Descriptions and
 * comment formatting are intentionally NOT compared — those don't affect
 * the Relay client and produce noisy diffs.
 *
 * Usage:
 *   bun run scripts/check-sdl-parity.ts                # assumes Rust server on :3001
 *   RUST_GRAPHQL_URL=http://… bun run scripts/check-sdl-parity.ts
 */

import {
  buildSchema,
  buildClientSchema,
  getIntrospectionQuery,
  type GraphQLSchema,
  type GraphQLNamedType,
  type GraphQLField,
  type GraphQLEnumType,
  type GraphQLInterfaceType,
  type GraphQLObjectType,
  type GraphQLType,
  type GraphQLUnionType,
  type IntrospectionQuery,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isObjectType,
  isUnionType,
} from "graphql";

import { typeDefs } from "../server/src/graphql/schema.js";

const RUST_URL = process.env.RUST_GRAPHQL_URL ?? "http://127.0.0.1:3001/graphql";

function isInternal(name: string): boolean {
  return name.startsWith("__");
}

function typeRef(t: GraphQLType): string {
  // Recursively render a GraphQLType into a normalised string like "[Foo!]!"
  return t.toString();
}

interface FieldShape {
  name: string;
  type: string;
  args: Record<string, { type: string; default?: string | null }>;
}

interface TypeShape {
  kind: "OBJECT" | "INTERFACE" | "UNION" | "ENUM" | "INPUT_OBJECT" | "SCALAR";
  name: string;
  fields?: Record<string, FieldShape>;
  enumValues?: string[];
  unionMembers?: string[];
  interfaces?: string[];
}

function shapeOf(t: GraphQLNamedType): TypeShape | null {
  if (isObjectType(t) || isInterfaceType(t)) {
    const shape: TypeShape = {
      kind: isObjectType(t) ? "OBJECT" : "INTERFACE",
      name: t.name,
      fields: {},
    };
    if (isObjectType(t)) {
      shape.interfaces = t
        .getInterfaces()
        .map((i) => i.name)
        .sort();
    }
    const fields = t.getFields();
    for (const fname of Object.keys(fields).sort()) {
      const f = fields[fname] as GraphQLField<unknown, unknown>;
      const args: FieldShape["args"] = {};
      for (const arg of f.args) {
        args[arg.name] = {
          type: typeRef(arg.type),
          default: arg.defaultValue === undefined ? null : JSON.stringify(arg.defaultValue),
        };
      }
      shape.fields![fname] = {
        name: fname,
        type: typeRef(f.type),
        args,
      };
    }
    return shape;
  }
  if (isUnionType(t)) {
    return {
      kind: "UNION",
      name: t.name,
      unionMembers: (t as GraphQLUnionType)
        .getTypes()
        .map((m) => m.name)
        .sort(),
    };
  }
  if (isEnumType(t)) {
    return {
      kind: "ENUM",
      name: t.name,
      enumValues: (t as GraphQLEnumType)
        .getValues()
        .map((v) => v.name)
        .sort(),
    };
  }
  if (isInputObjectType(t)) {
    const shape: TypeShape = { kind: "INPUT_OBJECT", name: t.name, fields: {} };
    const fields = t.getFields();
    for (const fname of Object.keys(fields).sort()) {
      const f = fields[fname];
      shape.fields![fname] = {
        name: fname,
        type: typeRef(f.type),
        args: {},
      };
    }
    return shape;
  }
  // Skip scalars — assume parity on built-ins (String, Int, etc.)
  return null;
}

function shapeMap(schema: GraphQLSchema): Map<string, TypeShape> {
  const out = new Map<string, TypeShape>();
  for (const t of Object.values(schema.getTypeMap())) {
    if (isInternal(t.name)) continue;
    const shape = shapeOf(t);
    if (shape) out.set(t.name, shape);
  }
  return out;
}

async function fetchRustSchema(): Promise<GraphQLSchema> {
  const res = await fetch(RUST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
  });
  if (!res.ok) {
    throw new Error(`Rust server returned HTTP ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data: IntrospectionQuery; errors?: unknown[] };
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Rust introspection errors: ${JSON.stringify(json.errors)}`);
  }
  return buildClientSchema(json.data);
}

interface DiffEntry {
  kind:
    | "missing-in-rust"
    | "extra-in-rust"
    | "kind-mismatch"
    | "field-mismatch"
    | "members-mismatch";
  detail: string;
}

function diffShapes(bun: Map<string, TypeShape>, rust: Map<string, TypeShape>): DiffEntry[] {
  const issues: DiffEntry[] = [];

  for (const [name, b] of bun) {
    const r = rust.get(name);
    if (!r) {
      issues.push({ kind: "missing-in-rust", detail: `${b.kind} ${name}` });
      continue;
    }
    if (b.kind !== r.kind) {
      issues.push({
        kind: "kind-mismatch",
        detail: `${name}: bun=${b.kind}, rust=${r.kind}`,
      });
      continue;
    }
    if (b.kind === "ENUM") {
      const bv = b.enumValues ?? [];
      const rv = r.enumValues ?? [];
      if (bv.join(",") !== rv.join(",")) {
        issues.push({
          kind: "members-mismatch",
          detail: `enum ${name}: bun=[${bv.join(",")}] rust=[${rv.join(",")}]`,
        });
      }
      continue;
    }
    if (b.kind === "UNION") {
      const bm = b.unionMembers ?? [];
      const rm = r.unionMembers ?? [];
      if (bm.join(",") !== rm.join(",")) {
        issues.push({
          kind: "members-mismatch",
          detail: `union ${name}: bun=[${bm.join(",")}] rust=[${rm.join(",")}]`,
        });
      }
      continue;
    }
    if (b.kind === "OBJECT" || b.kind === "INTERFACE" || b.kind === "INPUT_OBJECT") {
      const bf = b.fields ?? {};
      const rf = r.fields ?? {};
      for (const fname of Object.keys(bf)) {
        const bField = bf[fname];
        const rField = rf[fname];
        if (!rField) {
          issues.push({
            kind: "field-mismatch",
            detail: `${name}.${fname}: missing in rust`,
          });
          continue;
        }
        if (bField.type !== rField.type) {
          issues.push({
            kind: "field-mismatch",
            detail: `${name}.${fname}: type bun=${bField.type} rust=${rField.type}`,
          });
        }
        const bArgs = bField.args;
        const rArgs = rField.args;
        for (const aname of Object.keys(bArgs)) {
          const ba = bArgs[aname];
          const ra = rArgs[aname];
          if (!ra) {
            issues.push({
              kind: "field-mismatch",
              detail: `${name}.${fname}(${aname}): missing in rust`,
            });
            continue;
          }
          if (ba.type !== ra.type) {
            issues.push({
              kind: "field-mismatch",
              detail: `${name}.${fname}(${aname}): type bun=${ba.type} rust=${ra.type}`,
            });
          }
          if ((ba.default ?? "null") !== (ra.default ?? "null")) {
            issues.push({
              kind: "field-mismatch",
              detail: `${name}.${fname}(${aname}): default bun=${ba.default} rust=${ra.default}`,
            });
          }
        }
        for (const aname of Object.keys(rArgs)) {
          if (!bArgs[aname]) {
            issues.push({
              kind: "field-mismatch",
              detail: `${name}.${fname}(${aname}): extra in rust`,
            });
          }
        }
      }
      for (const fname of Object.keys(rf)) {
        if (!bf[fname]) {
          issues.push({
            kind: "field-mismatch",
            detail: `${name}.${fname}: extra in rust`,
          });
        }
      }
      if (b.kind === "OBJECT") {
        const bI = (b.interfaces ?? []).join(",");
        const rI = (r.interfaces ?? []).join(",");
        if (bI !== rI) {
          issues.push({
            kind: "field-mismatch",
            detail: `${name}: interfaces bun=[${bI}] rust=[${rI}]`,
          });
        }
      }
    }
  }

  for (const [name, r] of rust) {
    if (!bun.has(name)) {
      issues.push({ kind: "extra-in-rust", detail: `${r.kind} ${name}` });
    }
  }

  return issues;
}

async function main() {
  const bunSchema = buildSchema(typeDefs);
  const rustSchema = await fetchRustSchema();

  const bun = shapeMap(bunSchema);
  const rust = shapeMap(rustSchema);

  const issues = diffShapes(bun, rust);

  if (issues.length === 0) {
    console.log(`✓ SDL parity OK — ${bun.size} types match across Bun and Rust.`);
    process.exit(0);
  }

  console.error(`✗ SDL parity FAILED — ${issues.length} drift(s) found:\n`);
  for (const i of issues) {
    console.error(`  [${i.kind}] ${i.detail}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(`check-sdl-parity error: ${(err as Error).message}`);
  process.exit(2);
});
