export const MAX_PRODUCT_FIELDS = 64;
export const MAX_OPTIONS_PER_FIELD = 200;

export type FieldType = "enum" | "text" | "number" | "boolean";

export type FieldOption = {
  value: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
};

export type ProductFieldDefinition = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  multiValue: boolean;
  options: FieldOption[];
  sortOrder: number;
};

export type VariantOptionGroup = {
  enabled: boolean;
  options: FieldOption[];
};

export type CategoryDefinitionConfig = {
  version: number;
  productFieldDefinitions: ProductFieldDefinition[];
  variantFieldDefinitions: ProductFieldDefinition[];
  variantOptions: {
    size: VariantOptionGroup;
    color: VariantOptionGroup;
  };
};

function asString(value: unknown, fallback = "") {
  return String(value ?? fallback).trim();
}

function asNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeToken(value: unknown) {
  return asString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeFieldKey(value: unknown) {
  return asString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeOption(input: unknown, index: number): FieldOption | null {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const rawValue = asString(raw.value || raw.label || input);
  const value = normalizeToken(rawValue);
  if (!value) return null;

  return {
    value,
    label: asString(raw.label || rawValue || value) || value,
    sortOrder: asNumber(raw.sortOrder, index),
    enabled: raw.enabled === undefined ? true : !!raw.enabled,
  };
}

export function normalizeOptions(input: unknown): FieldOption[] {
  const raw = Array.isArray(input) ? input : [];
  const out: FieldOption[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < raw.length; i += 1) {
    const option = normalizeOption(raw[i], i);
    if (!option || !option.enabled) continue;
    if (seen.has(option.value)) continue;
    seen.add(option.value);
    out.push(option);
    if (out.length >= MAX_OPTIONS_PER_FIELD) break;
  }

  out.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label);
  });

  return out;
}

function normalizeFieldType(value: unknown): FieldType {
  const raw = asString(value || "text").toLowerCase() as FieldType;
  return raw === "enum" || raw === "text" || raw === "number" || raw === "boolean" ? raw : "text";
}

function normalizeProductFieldDefinition(input: unknown, index: number): ProductFieldDefinition | null {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const key = normalizeFieldKey(raw.key);
  if (!key) return null;

  const type = normalizeFieldType(raw.type);
  return {
    key,
    label: asString(raw.label || key) || key,
    type,
    required: !!raw.required,
    multiValue: (type === "text" || type === "enum") ? !!raw.multiValue : false,
    options: type === "enum" ? normalizeOptions(raw.options || raw.values) : [],
    sortOrder: asNumber(raw.sortOrder, index),
  };
}

function normalizeVariantOptionGroup(input: unknown): VariantOptionGroup {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    enabled: !!raw.enabled,
    options: normalizeOptions(raw.options || raw.values),
  };
}

export function defaultFilterConfig(): CategoryDefinitionConfig {
  return {
    version: 1,
    productFieldDefinitions: [],
    variantFieldDefinitions: [],
    variantOptions: {
      size: { enabled: false, options: [] },
      color: { enabled: false, options: [] },
    },
  };
}

export function normalizeFilterConfig(input: unknown): CategoryDefinitionConfig {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const normalizeFieldCollection = (inputFields: unknown) => {
    const byKey = new Map<string, ProductFieldDefinition>();
    const fieldRaw = Array.isArray(inputFields) ? inputFields : [];
    for (let i = 0; i < fieldRaw.length; i += 1) {
      const field = normalizeProductFieldDefinition(fieldRaw[i], i);
      if (!field) continue;
      byKey.set(field.key, field);
    }
    return Array.from(byKey.values()).sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label);
    });
  };

  return {
    version: Number.isFinite(Number(raw.version)) ? Math.max(1, Number(raw.version)) : 1,
    productFieldDefinitions: normalizeFieldCollection(raw.productFieldDefinitions),
    variantFieldDefinitions: normalizeFieldCollection(raw.variantFieldDefinitions),
    variantOptions: {
      size: normalizeVariantOptionGroup((raw.variantOptions as Record<string, unknown> | undefined)?.size),
      color: normalizeVariantOptionGroup((raw.variantOptions as Record<string, unknown> | undefined)?.color),
    },
  };
}

export function buildFilterConfigValidationErrors(config: CategoryDefinitionConfig): string[] {
  const errors: string[] = [];
  const validateFieldDefinitions = (fields: ProductFieldDefinition[], label: string) => {
    const keys = new Set<string>();
    if (fields.length > MAX_PRODUCT_FIELDS) {
      errors.push(`${label} field limit exceeded. Maximum allowed is ${MAX_PRODUCT_FIELDS}.`);
    }

    for (const field of fields) {
      if (!field.key) {
        errors.push(`${label} field key is required`);
        continue;
      }
      if (keys.has(field.key)) {
        errors.push(`Duplicate ${label.toLowerCase()} field key: ${field.key}`);
        continue;
      }
      keys.add(field.key);

      if (field.type === "enum" && field.options.length === 0) {
        errors.push(`${label} field ${field.key} must have at least one option`);
      }
      if (field.options.length > MAX_OPTIONS_PER_FIELD) {
        errors.push(`${label} field ${field.key} exceeds ${MAX_OPTIONS_PER_FIELD} options`);
      }
    }
  };

  validateFieldDefinitions(config.productFieldDefinitions, "Product");
  validateFieldDefinitions(config.variantFieldDefinitions, "Variant");

  if (config.variantOptions.size.enabled && config.variantOptions.size.options.length === 0) {
    errors.push("Size options must have at least one value when size is enabled");
  }

  return Array.from(new Set(errors));
}

export function buildFilterConfigValidationWarnings(_config: CategoryDefinitionConfig): string[] {
  return [];
}
