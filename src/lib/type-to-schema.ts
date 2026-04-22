// FILE PATH: src/lib/type-to-schema.ts
/**
 * TypeScript Type → JSON Schema conversion.
 *
 * Walks a ts-morph Type and produces an OpenAPI-compatible JSON Schema.
 * Conservative by design: if we can't determine the type confidently, we
 * return null rather than guessing.
 */

import type { Type, Symbol as TsSymbol } from "ts-morph";
import type { OpenAPISchema } from "../types.js";

const MAX_DEPTH = 8;

export function typeToSchema(type: Type): OpenAPISchema | null {
  return convert(type, 0, new Set());
}

function convert(
  type: Type,
  depth: number,
  seen: Set<string>,
): OpenAPISchema | null {
  if (depth > MAX_DEPTH) return { type: "object" };

  if (type.isAny() || type.isUnknown()) return null;

  if (type.isString()) return { type: "string" };
  if (type.isNumber()) return { type: "number" };
  if (type.isBoolean()) return { type: "boolean" };
  if (type.isNull()) return { type: "null" };
  if (type.isUndefined()) return null;

  if (type.isStringLiteral()) {
    return { type: "string", enum: [type.getLiteralValue() as string] };
  }
  if (type.isNumberLiteral()) {
    return { type: "number", enum: [type.getLiteralValue() as number] };
  }
  if (type.isBooleanLiteral()) {
    const text = type.getText();
    return { type: "boolean", enum: [text === "true"] };
  }

  if (type.isUnion()) {
    const branches = type.getUnionTypes();
    const hasNull = branches.some(b => b.isNull() || b.isUndefined());
    const nonNull = branches.filter(b => !b.isNull() && !b.isUndefined());

    const allStringLiterals = nonNull.every(b => b.isStringLiteral());
    const allNumberLiterals = nonNull.every(b => b.isNumberLiteral());
    if (allStringLiterals && nonNull.length > 0) {
      return {
        type: "string",
        enum: nonNull.map(b => b.getLiteralValue() as string),
        ...(hasNull ? { nullable: true } : {}),
      };
    }
    if (allNumberLiterals && nonNull.length > 0) {
      return {
        type: "number",
        enum: nonNull.map(b => b.getLiteralValue() as number),
        ...(hasNull ? { nullable: true } : {}),
      };
    }

    const first = nonNull[0];
    if (!first) return hasNull ? { type: "null" } : null;
    const converted = convert(first, depth + 1, seen);
    if (!converted) return null;
    return hasNull ? { ...converted, nullable: true } : converted;
  }

  if (type.isArray()) {
    const element = type.getArrayElementType();
    if (!element) return { type: "array" };
    const itemSchema = convert(element, depth + 1, seen);
    return { type: "array", items: itemSchema ?? {} };
  }

  if (type.isTuple()) {
    const elements = type.getTupleElements();
    const first = elements[0];
    if (!first) return { type: "array" };
    const itemSchema = convert(first, depth + 1, seen);
    return { type: "array", items: itemSchema ?? {} };
  }

  if (type.isObject() && !type.isArray() && !type.isTuple()) {
    return convertObject(type, depth, seen);
  }

  return null;
}

function convertObject(
  type: Type,
  depth: number,
  seen: Set<string>,
): OpenAPISchema | null {
  const signature = type.getText();
  if (seen.has(signature)) return { type: "object" };
  seen.add(signature);

  const properties: Record<string, OpenAPISchema> = {};
  const required: string[] = [];

  for (const prop of type.getProperties()) {
    const name = prop.getName();
    if (!name || name.startsWith("__")) continue;

    const propType = getPropertyType(prop, type);
    if (!propType) continue;

    const converted = convert(propType, depth + 1, seen);
    if (!converted) continue;

    properties[name] = converted;
    if (!isOptional(prop)) required.push(name);
  }

  seen.delete(signature);

  if (Object.keys(properties).length === 0) return { type: "object" };

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function getPropertyType(prop: TsSymbol, parentType: Type): Type | undefined {
  const declarations = prop.getDeclarations();
  const decl = declarations[0];
  if (!decl) {
    try {
      return parentType.getPropertyOrThrow(prop.getName()).getValueDeclaration()?.getType();
    } catch {
      return undefined;
    }
  }
  try {
    return prop.getTypeAtLocation(decl);
  } catch {
    return undefined;
  }
}

function isOptional(prop: TsSymbol): boolean {
  const flags = prop.getFlags();
  const OPTIONAL = 16_777_216;
  return (flags & OPTIONAL) !== 0;
}
