#!/usr/bin/env node

const rows = [
  { owner: "auth-svc", hop: "direct", endpoint: "https://localhost:4443/health" },
  { owner: "catalog-svc", hop: "direct", endpoint: "https://localhost:4444/health" },
  { owner: "product-svc", hop: "direct", endpoint: "https://localhost:4445/health" },
  { owner: "navigation-svc", hop: "direct", endpoint: "https://localhost:4446/health" },
  { owner: "gateway-svc", hop: "direct", endpoint: "https://localhost:4000/health" },
  { owner: "gateway->auth", hop: "proxy", endpoint: "https://localhost:4000/api/me" },
  { owner: "gateway->catalog", hop: "proxy", endpoint: "https://localhost:4000/api/categories" },
  { owner: "gateway->product", hop: "proxy", endpoint: "https://localhost:4000/api/admin/products" },
  { owner: "gateway->navigation", hop: "proxy", endpoint: "https://localhost:4000/api/admin/navigation/items" },
  { owner: "admin->gateway auth", hop: "proxy", endpoint: "https://localhost:3000/auth/refresh" },
  { owner: "admin->gateway api", hop: "proxy", endpoint: "https://localhost:3000/api/me" },
];

function shortErr(error) {
  if (error && typeof error === "object") {
    const code = "code" in error ? String(error.code) : "";
    const msg = "message" in error ? String(error.message) : String(error);
    const cause =
      "cause" in error && error.cause && typeof error.cause === "object"
        ? error.cause
        : null;
    const causeCode = cause && "code" in cause ? String(cause.code) : "";
    const causeMsg = cause && "message" in cause ? String(cause.message) : "";
    const root = code ? `${code} ${msg}` : msg;
    if (causeCode || causeMsg) {
      return `${root} | cause: ${causeCode} ${causeMsg}`.trim();
    }
    return root;
  }
  return String(error);
}

async function probe(row) {
  try {
    const res = await fetch(row.endpoint, { method: "GET", redirect: "manual" });
    return {
      owner: row.owner,
      hop: row.hop,
      endpoint: row.endpoint,
      status: "PASS",
      detail: `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      owner: row.owner,
      hop: row.hop,
      endpoint: row.endpoint,
      status: "FAIL",
      detail: shortErr(error),
    };
  }
}

async function main() {
  const results = [];
  for (const row of rows) {
    results.push(await probe(row));
  }

  console.log("HTTPS hop matrix");
  console.table(results);
}

main().catch((error) => {
  console.error("Failed to run HTTPS hop checks:", shortErr(error));
  process.exit(1);
});
