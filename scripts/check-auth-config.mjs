#!/usr/bin/env node

import fs from "fs";
import path from "path";

const root = "/Users/kamattap/spaces/sacom";
const serviceEnvFiles = [
  "auth-svc/.env",
  "catalog-svc/.env",
  "product-svc/.env",
  "navigation-svc/.env",
];

function parseEnv(filePath) {
  const out = {};
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

const rows = [];
for (const rel of serviceEnvFiles) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    rows.push({ service: rel, status: "FAIL", detail: "env file missing" });
    continue;
  }
  const parsed = parseEnv(full);
  const value = parsed.ACCESS_TOKEN_SECRET || "";
  rows.push({
    service: rel,
    status: value ? "PASS" : "FAIL",
    detail: value ? "ACCESS_TOKEN_SECRET set" : "ACCESS_TOKEN_SECRET missing",
    secret: value || "(empty)",
  });
}

const nonEmpty = rows.filter((r) => r.secret && r.secret !== "(empty)");
const unique = new Set(nonEmpty.map((r) => r.secret));
const parityOk = unique.size <= 1;

console.table(rows.map(({ service, status, detail }) => ({ service, status, detail })));

if (!parityOk) {
  console.error("FAIL: ACCESS_TOKEN_SECRET mismatch across services.");
  process.exit(1);
}

if (rows.some((r) => r.status === "FAIL")) {
  console.error("FAIL: Missing ACCESS_TOKEN_SECRET in one or more services.");
  process.exit(1);
}

console.log("PASS: ACCESS_TOKEN_SECRET is present and identical across all services.");
