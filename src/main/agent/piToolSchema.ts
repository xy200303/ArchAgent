/** Converts OpenAI-style JSON Schema definitions into Pi-compatible TypeBox schemas. */
import { Type, type TSchema } from "typebox";

type JsonSchemaPrimitive = string | number | boolean | null;
type JsonSchemaValue = JsonSchemaPrimitive | JsonSchemaObject | JsonSchemaValue[];
type JsonSchemaTypeName = "object" | "array" | "string" | "integer" | "number" | "boolean" | "null";

interface JsonSchemaObject {
  type?: JsonSchemaTypeName | JsonSchemaTypeName[];
  properties?: Record<string, JsonSchemaValue>;
  required?: string[];
  items?: JsonSchemaValue | JsonSchemaValue[];
  additionalProperties?: boolean | JsonSchemaValue;
  enum?: JsonSchemaPrimitive[];
  anyOf?: JsonSchemaValue[];
  oneOf?: JsonSchemaValue[];
  allOf?: JsonSchemaValue[];
  description?: string;
  title?: string;
  default?: unknown;
  examples?: unknown;
  [key: string]: unknown;
}

export function convertJsonSchemaToTypeBoxSchema(schema: unknown, path = "parameters"): TSchema {
  if (schema === true) return Type.Unknown();
  if (schema === false) return Type.Never();
  const source = readJsonSchemaObject(schema, path);

  if (Array.isArray(source.enum)) {
    return Type.Unsafe(cloneJsonSchemaObject(source));
  }

  if (Array.isArray(source.allOf)) {
    return Type.Intersect(
      source.allOf.map((item, index) => convertJsonSchemaToTypeBoxSchema(item, `${path}.allOf[${index}]`)),
      readTypeBoxOptions(source, ["allOf"])
    );
  }

  if (Array.isArray(source.anyOf)) {
    return Type.Union(
      source.anyOf.map((item, index) => convertJsonSchemaToTypeBoxSchema(item, `${path}.anyOf[${index}]`)),
      readTypeBoxOptions(source, ["anyOf"])
    );
  }

  if (Array.isArray(source.oneOf)) {
    return Type.Union(
      source.oneOf.map((item, index) => convertJsonSchemaToTypeBoxSchema(item, `${path}.oneOf[${index}]`)),
      readTypeBoxOptions(source, ["oneOf"])
    );
  }

  const schemaTypes = readJsonSchemaTypes(source, path);
  if (schemaTypes.length > 1) {
    return Type.Union(
      schemaTypes.map((type) => convertJsonSchemaToTypeBoxSchema({ ...source, type }, `${path}<${type}>`)),
      readTypeBoxOptions(source, ["type"])
    );
  }

  const schemaType = schemaTypes[0] ?? inferJsonSchemaType(source);
  switch (schemaType) {
    case "object":
      return convertJsonObjectSchemaToTypeBox(source, path);
    case "array":
      return convertJsonArraySchemaToTypeBox(source, path);
    case "string":
      return Type.String(readTypeBoxOptions(source, ["type"]));
    case "integer":
      return Type.Integer(readTypeBoxOptions(source, ["type"]));
    case "number":
      return Type.Number(readTypeBoxOptions(source, ["type"]));
    case "boolean":
      return Type.Boolean(readTypeBoxOptions(source, ["type"]));
    case "null":
      return Type.Null(readTypeBoxOptions(source, ["type"]));
    default:
      return Type.Unknown(readTypeBoxOptions(source, ["type"]));
  }
}

function convertJsonObjectSchemaToTypeBox(schema: JsonSchemaObject, path: string): TSchema {
  const required = new Set(readRequiredProperties(schema, path));
  const properties = schema.properties ?? {};
  const propertySchemas: Record<string, TSchema> = {};

  for (const requiredKey of required) {
    if (!(requiredKey in properties)) {
      throw new Error(`Unsupported JSON schema at ${path}: required property "${requiredKey}" is not defined`);
    }
  }

  for (const [key, propertySchema] of Object.entries(properties)) {
    const converted = convertJsonSchemaToTypeBoxSchema(propertySchema, `${path}.properties.${key}`);
    propertySchemas[key] = required.has(key) ? converted : Type.Optional(converted);
  }

  return Type.Object(propertySchemas, readTypeBoxOptions(schema, ["type", "properties", "required"]));
}

function convertJsonArraySchemaToTypeBox(schema: JsonSchemaObject, path: string): TSchema {
  const options = readTypeBoxOptions(schema, ["type", "items"]);
  if (Array.isArray(schema.items)) {
    return Type.Tuple(
      schema.items.map((item, index) => convertJsonSchemaToTypeBoxSchema(item, `${path}.items[${index}]`)),
      options
    );
  }
  return Type.Array(
    schema.items === undefined ? Type.Unknown() : convertJsonSchemaToTypeBoxSchema(schema.items, `${path}.items`),
    options
  );
}

function readJsonSchemaObject(schema: unknown, path: string): JsonSchemaObject {
  if (!isRecord(schema) || Array.isArray(schema)) {
    throw new Error(`Unsupported JSON schema at ${path}: expected an object`);
  }
  return schema as JsonSchemaObject;
}

function readJsonSchemaTypes(schema: JsonSchemaObject, path: string): JsonSchemaTypeName[] {
  if (schema.type === undefined) return [];
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  for (const type of types) {
    if (
      type !== "object" &&
      type !== "array" &&
      type !== "string" &&
      type !== "integer" &&
      type !== "number" &&
      type !== "boolean" &&
      type !== "null"
    ) {
      throw new Error(`Unsupported JSON schema at ${path}: unknown type "${String(type)}"`);
    }
  }
  return types;
}

function readRequiredProperties(schema: JsonSchemaObject, path: string): string[] {
  if (schema.required === undefined) return [];
  if (!Array.isArray(schema.required) || schema.required.some((item) => typeof item !== "string")) {
    throw new Error(`Unsupported JSON schema at ${path}: required must be a string array`);
  }
  return schema.required;
}

function inferJsonSchemaType(schema: JsonSchemaObject): JsonSchemaTypeName | undefined {
  if (schema.properties || schema.additionalProperties !== undefined) return "object";
  if (schema.items) return "array";
  return undefined;
}

function readTypeBoxOptions(schema: JsonSchemaObject, omittedKeys: string[]): Record<string, unknown> {
  const omitted = new Set(omittedKeys);
  const options: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (omitted.has(key) || value === undefined) continue;
    if (key === "additionalProperties" && isRecord(value) && !Array.isArray(value)) {
      options.additionalProperties = convertJsonSchemaToTypeBoxSchema(value, "additionalProperties");
      continue;
    }
    options[key] = cloneJsonSchemaValue(value);
  }
  return options;
}

function cloneJsonSchemaObject(schema: JsonSchemaObject): TSchema {
  return cloneJsonSchemaValue(schema) as TSchema;
}

function cloneJsonSchemaValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => cloneJsonSchemaValue(item));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJsonSchemaValue(item)]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
