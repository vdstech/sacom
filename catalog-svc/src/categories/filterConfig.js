const MAX_PRODUCT_FIELDS = 64;
const MAX_OPTIONS_PER_FIELD = 200;
const FIELD_TYPES = new Set(["enum", "text", "number", "boolean"]);

function asString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeToken(value) {
  return asString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeFieldKey(value) {
  return asString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeOption(input, index) {
  const raw = input && typeof input === "object" ? input : {};
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

function normalizeOptions(input) {
  const raw = Array.isArray(input) ? input : [];
  const out = [];
  const seen = new Set();

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

function normalizeProductFieldDefinition(input, index) {
  const raw = input && typeof input === "object" ? input : {};
  const key = normalizeFieldKey(raw.key);
  if (!key) return null;

  const rawType = asString(raw.type || "text").toLowerCase();
  const type = FIELD_TYPES.has(rawType) ? rawType : "text";
  const multiValue = (type === "text" || type === "enum") ? !!raw.multiValue : false;

  return {
    key,
    label: asString(raw.label || key) || key,
    type,
    required: !!raw.required,
    multiValue,
    options: type === "enum" ? normalizeOptions(raw.options || raw.values) : [],
    sortOrder: asNumber(raw.sortOrder, index),
  };
}

function normalizeFieldDefinitions(input) {
  if (!Array.isArray(input)) return [];
  const byKey = new Map();
  for (let i = 0; i < input.length; i += 1) {
    const field = normalizeProductFieldDefinition(input[i], i);
    if (!field) continue;
    byKey.set(field.key, field);
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label);
  });
}

function normalizeVariantOptionGroup(input = {}, { allowEmptyOptions = false } = {}) {
  const raw = input && typeof input === "object" ? input : {};
  const options = normalizeOptions(raw.options || raw.values);
  return {
    enabled: !!raw.enabled,
    options: allowEmptyOptions ? options : options,
  };
}

function baseConfig(version = 1) {
  return {
    version,
    productFieldDefinitions: [],
    variantFieldDefinitions: [],
    variantOptions: {
      size: { enabled: false, options: [] },
      color: { enabled: false, options: [] },
    },
  };
}

export function normalizeFilterConfig(input = {}) {
  const raw = input && typeof input === "object" ? input : {};
  const normalized = baseConfig(
    Number.isFinite(Number(raw.version)) ? Math.max(1, Number(raw.version)) : 1
  );

  normalized.productFieldDefinitions = normalizeFieldDefinitions(raw.productFieldDefinitions);
  normalized.variantFieldDefinitions = normalizeFieldDefinitions(raw.variantFieldDefinitions);

  const variantOptions = raw.variantOptions && typeof raw.variantOptions === "object" ? raw.variantOptions : {};
  normalized.variantOptions = {
    size: normalizeVariantOptionGroup(variantOptions.size || {}),
    color: normalizeVariantOptionGroup(variantOptions.color || {}, { allowEmptyOptions: true }),
  };

  return normalized;
}

export function mergeFilterConfigs(configChain = []) {
  const merged = baseConfig(Math.max(1, configChain.length));
  const productFieldsByKey = new Map();
  const variantFieldsByKey = new Map();

  for (const config of configChain) {
    const raw = config && typeof config === "object" ? config : {};
    const normalized = normalizeFilterConfig(raw);

    for (const field of normalized.productFieldDefinitions) {
      productFieldsByKey.set(field.key, field);
    }
    for (const field of normalized.variantFieldDefinitions) {
      variantFieldsByKey.set(field.key, field);
    }

    if (raw.variantOptions && typeof raw.variantOptions === "object") {
      if (Object.prototype.hasOwnProperty.call(raw.variantOptions, "size")) {
        merged.variantOptions.size = normalized.variantOptions.size;
      }
      if (Object.prototype.hasOwnProperty.call(raw.variantOptions, "color")) {
        merged.variantOptions.color = normalized.variantOptions.color;
      }
    }
  }

  merged.productFieldDefinitions = Array.from(productFieldsByKey.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label);
  });
  merged.variantFieldDefinitions = Array.from(variantFieldsByKey.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label);
  });

  return merged;
}

export function validateFilterConfig(input) {
  const normalized = normalizeFilterConfig(input || {});
  const errors = [];
  const rawFields = Array.isArray(input?.productFieldDefinitions) ? input.productFieldDefinitions : [];
  const rawVariantFields = Array.isArray(input?.variantFieldDefinitions) ? input.variantFieldDefinitions : [];

  if (rawFields.length > MAX_PRODUCT_FIELDS) {
    errors.push(`productFieldDefinitions exceeds max limit of ${MAX_PRODUCT_FIELDS}`);
  }
  if (rawVariantFields.length > MAX_PRODUCT_FIELDS) {
    errors.push(`variantFieldDefinitions exceeds max limit of ${MAX_PRODUCT_FIELDS}`);
  }

  const validateFieldSet = (fields, path, label) => {
    const seenKeys = new Set();
    for (const field of fields) {
      if (!field.key) {
        errors.push(`${path}[].key is required`);
        continue;
      }
      if (seenKeys.has(field.key)) {
        errors.push(`Duplicate ${label} field key: ${field.key}`);
        continue;
      }
      seenKeys.add(field.key);

      if (field.type === "enum" && !field.options.length) {
        errors.push(`${path}[${field.key}] must include at least one option`);
      }
    }
  };

  validateFieldSet(normalized.productFieldDefinitions, "productFieldDefinitions", "product");
  validateFieldSet(normalized.variantFieldDefinitions, "variantFieldDefinitions", "variant");

  if (normalized.variantOptions.size.enabled && !normalized.variantOptions.size.options.length) {
    errors.push("variantOptions.size must define at least one size option when enabled");
  }

  return { normalized, errors };
}

export {
  FIELD_TYPES,
  MAX_OPTIONS_PER_FIELD,
  MAX_PRODUCT_FIELDS,
  normalizeFieldKey,
  normalizeOptions,
  normalizeProductFieldDefinition,
  normalizeToken,
};
