import http from "http";
import https from "https";

const CACHE_TTL_MS = Number(process.env.CATEGORY_FILTER_CONFIG_CACHE_MS || 30000);
const categoryConfigCache = new Map();

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

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: "GET",
        rejectUnauthorized: false,
        headers: { Accept: "application/json" },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`Category config request failed (${res.statusCode})`));
          }
          try {
            resolve(data ? JSON.parse(data) : null);
          } catch {
            reject(new Error("Invalid JSON while fetching category config"));
          }
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error("Category config request timeout"));
    });
    req.end();
  });
}

function normalizeOptions(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((option, index) => {
      const value = normalizeToken(option?.value || option?.label || "");
      if (!value) return null;
      return {
        value,
        label: asString(option?.label || option?.value || value) || value,
        sortOrder: asNumber(option?.sortOrder, index),
        enabled: option?.enabled === undefined ? true : !!option.enabled,
      };
    })
    .filter((option) => !!option && option.enabled !== false)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label);
    });
}

function normalizeProductFieldDefinitions(input) {
  if (!Array.isArray(input)) return [];
  const byKey = new Map();
  for (let index = 0; index < input.length; index += 1) {
    const raw = input[index] || {};
    const key = normalizeToken(raw.key);
    if (!key) continue;
    const type = ["enum", "text", "number", "boolean"].includes(String(raw.type || "").toLowerCase())
      ? String(raw.type).toLowerCase()
      : "text";
    byKey.set(key, {
      key,
      label: asString(raw.label || key) || key,
      type,
      required: !!raw.required,
      multiValue: (type === "text" || type === "enum") ? !!raw.multiValue : false,
      options: type === "enum" ? normalizeOptions(raw.options) : [],
      sortOrder: asNumber(raw.sortOrder, index),
    });
  }
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label);
  });
}

function normalizeVariantFieldDefinitions(input) {
  return normalizeProductFieldDefinitions(input);
}

function normalizeResolvedConfig(config = {}) {
  return {
    version: asNumber(config.version, 1) || 1,
    productFieldDefinitions: normalizeProductFieldDefinitions(config.productFieldDefinitions),
    variantFieldDefinitions: normalizeVariantFieldDefinitions(config.variantFieldDefinitions),
    variantOptions: {
      size: {
        enabled: !!config?.variantOptions?.size?.enabled,
        options: normalizeOptions(config?.variantOptions?.size?.options),
      },
      color: {
        enabled: !!config?.variantOptions?.color?.enabled,
        options: normalizeOptions(config?.variantOptions?.color?.options),
      },
    },
  };
}

export async function getCategoryDefinitionConfig(categoryId) {
  const key = asString(categoryId);
  if (!key) {
    return {
      categoryId: "",
      resolvedConfig: normalizeResolvedConfig({}),
      source: "default",
    };
  }

  const cached = categoryConfigCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const base = process.env.CATALOG_SVC_URL || "https://localhost:4444";
  const endpoint = `${String(base).replace(/\/$/, "")}/api/categories/${encodeURIComponent(key)}/filter-config`;

  try {
    const payload = await requestJson(endpoint);
    const normalized = {
      categoryId: key,
      resolvedConfig: normalizeResolvedConfig(payload?.resolvedConfig || {}),
      source: "catalog",
    };
    categoryConfigCache.set(key, { value: normalized, expiresAt: Date.now() + CACHE_TTL_MS });
    return normalized;
  } catch {
    const fallback = {
      categoryId: key,
      resolvedConfig: normalizeResolvedConfig({}),
      source: "default",
    };
    categoryConfigCache.set(key, { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
    return fallback;
  }
}

function normalizeDetailValue(field, rawValue) {
  if (field.type === "boolean") return !!rawValue;
  if (field.type === "number") return rawValue === "" || rawValue === null || rawValue === undefined ? null : Number(rawValue);
  if (field.type === "enum") {
    if (field.multiValue) {
      return Array.isArray(rawValue) ? rawValue.map((item) => normalizeToken(item)).filter(Boolean) : [];
    }
    return normalizeToken(rawValue);
  }
  if (field.multiValue) {
    return Array.isArray(rawValue)
      ? rawValue.map((item) => asString(item)).filter(Boolean)
      : [];
  }
  return asString(rawValue);
}

export function normalizeProductDetails(details = {}, fieldDefinitions = []) {
  const raw = details && typeof details === "object" ? details : {};
  const out = {};

  for (const field of fieldDefinitions || []) {
    const value = normalizeDetailValue(field, raw[field.key]);
    if (field.type === "number") {
      if (value === null || Number.isNaN(value)) continue;
      out[field.key] = value;
      continue;
    }
    if (field.type === "boolean") {
      out[field.key] = value;
      continue;
    }
    if (field.multiValue) {
      if (Array.isArray(value) && value.length) out[field.key] = value;
      continue;
    }
    if (String(value || "").trim()) out[field.key] = value;
  }

  return out;
}

export function normalizeVariantDetails(details = {}, fieldDefinitions = []) {
  return normalizeProductDetails(details, fieldDefinitions);
}

export function validateProductDetails(details = {}, fieldDefinitions = []) {
  const normalized = normalizeProductDetails(details, fieldDefinitions);
  const errors = [];

  for (const field of fieldDefinitions || []) {
    const value = normalized[field.key];
    if (field.required) {
      if (field.type === "boolean") {
        if (value === undefined) errors.push(`details.${field.key} is required`);
      } else if (field.multiValue) {
        if (!Array.isArray(value) || value.length === 0) errors.push(`details.${field.key} is required`);
      } else if (value === undefined || value === null || value === "") {
        errors.push(`details.${field.key} is required`);
      }
    }

    if (field.type === "enum") {
      const allowed = new Set((field.options || []).map((option) => option.value));
      const values = field.multiValue ? (Array.isArray(value) ? value : []) : [value];
      for (const item of values) {
        if (!item) continue;
        if (!allowed.has(item)) {
          errors.push(`details.${field.key} has invalid value '${item}'`);
        }
      }
    }

    if (field.type === "number" && value !== undefined && value !== null && !Number.isFinite(Number(value))) {
      errors.push(`details.${field.key} must be a number`);
    }
  }

  return {
    normalized,
    errors: Array.from(new Set(errors)),
  };
}

export function validateVariantDetails(details = {}, fieldDefinitions = []) {
  const result = validateProductDetails(details, fieldDefinitions);
  return {
    normalized: result.normalized,
    errors: result.errors.map((error) => error.replace(/^details\./, "variant.details.")),
  };
}
