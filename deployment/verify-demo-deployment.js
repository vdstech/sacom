const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function expectFile(relativePath) {
  expect(fs.existsSync(path.join(root, relativePath)), `Missing ${relativePath}`);
}

const envFiles = [
  "auth-svc/.env.demo.example",
  "catalog-svc/.env.demo.example",
  "product-svc/.env.demo.example",
  "gateway-svc/.env.demo.example",
  "admin-portal/.env.demo.example",
  "siri-frontend-simple-proxy-v2/.env.demo.example",
];

expectFile("ecosystem.config.js");
expectFile("deployment/Caddyfile.example");
expectFile("deployment/README.md");
envFiles.forEach(expectFile);

const ecosystem = read("ecosystem.config.js");
const expectedApps = [
  ["sacom-auth", "auth-svc", "4443"],
  ["sacom-catalog", "catalog-svc", "4444"],
  ["sacom-product", "product-svc", "4445"],
  ["sacom-gateway", "gateway-svc", "4000"],
  ["sacom-admin", "admin-portal", "3000"],
  ["sacom-storefront", "siri-frontend-simple-proxy-v2", "3001"],
];

for (const [name, cwd, port] of expectedApps) {
  expect(ecosystem.includes(`name: \"${name}\"`), `PM2 ecosystem is missing ${name}`);
  expect(ecosystem.includes(`cwd: \"./${cwd}\"`), `PM2 ecosystem has no cwd for ${cwd}`);
  expect(ecosystem.includes(port), `PM2 ecosystem has no port ${port} for ${name}`);
}
expect(!ecosystem.includes("navigation-svc"), "navigation-svc must not be in the PM2 ecosystem");
expect((ecosystem.match(/127\.0\.0\.1/g) || []).length >= 6, "PM2 ecosystem must bind every process to 127.0.0.1");

const caddyfile = read("deployment/Caddyfile.example");
for (const [host, port] of [["store.example.com", "3001"], ["admin.example.com", "3000"], ["api.example.com", "4000"]]) {
  const route = new RegExp(`${host.replace(/\./g, "\\.")}\\s*\\{[\\s\\S]*?reverse_proxy 127\\.0\\.0\\.1:${port}`);
  expect(route.test(caddyfile), `Caddyfile is missing ${host} -> 127.0.0.1:${port}`);
}

const requiredEnv = {
  "auth-svc/.env.demo.example": ["HOST=127.0.0.1", "PORT=4443", "ENABLE_TLS=false", "MONGO_URI=", "ACCESS_TOKEN_SECRET=", "CORS_ORIGINS=https://store.example.com,https://admin.example.com"],
  "catalog-svc/.env.demo.example": ["HOST=127.0.0.1", "PORT=4444", "ENABLE_TLS=false", "MONGO_URI=", "ACCESS_TOKEN_SECRET=", "CORS_ORIGINS=https://store.example.com,https://admin.example.com"],
  "product-svc/.env.demo.example": ["HOST=127.0.0.1", "PORT=4445", "ENABLE_TLS=false", "MONGO_URI=", "ACCESS_TOKEN_SECRET=", "OPENAI_API_KEY=", "CORS_ORIGINS=https://store.example.com,https://admin.example.com"],
  "gateway-svc/.env.demo.example": ["HOST=127.0.0.1", "PORT=4000", "AUTH_SVC_URL=http://127.0.0.1:4443", "CATALOG_SVC_URL=http://127.0.0.1:4444", "PRODUCT_SVC_URL=http://127.0.0.1:4445", "CORS_ORIGINS=https://store.example.com,https://admin.example.com"],
  "admin-portal/.env.demo.example": ["GATEWAY_INTERNAL_URL=http://127.0.0.1:4000"],
  "siri-frontend-simple-proxy-v2/.env.demo.example": ["GATEWAY_INTERNAL_URL=http://127.0.0.1:4000"],
};

for (const [file, values] of Object.entries(requiredEnv)) {
  const content = read(file);
  for (const value of values) expect(content.includes(value), `${file} is missing ${value}`);
  expect(!content.includes("CORS_ORIGINS=*"), `${file} must not use wildcard CORS`);
  expect(!/(?:OPENAI_API_KEY|ACCESS_TOKEN_SECRET|BOOTSTRAP_ADMIN_SECRET)=sk-/m.test(content), `${file} contains an obvious API key`);
  expect(!/OPENAI_API_KEY=(?!\s*$)(?!replace_with_)/m.test(content), `${file} must not contain a real OpenAI key`);
}

for (const packageFile of [
  "admin-portal/package.json",
  "auth-svc/package.json",
  "catalog-svc/package.json",
  "gateway-svc/package.json",
  "product-svc/package.json",
  "siri-frontend-simple-proxy-v2/package.json",
]) {
  const scripts = JSON.parse(read(packageFile)).scripts || {};
  const productionStart = scripts.start || "";
  expect(!/NODE_TLS_REJECT_UNAUTHORIZED=0|NODE_EXTRA_CA_CERTS|localhost\.crt|localhost\.key/.test(productionStart), `${packageFile} start script contains local TLS bypass settings`);
}

for (const serverFile of [
  "auth-svc/src/server.js",
  "catalog-svc/src/server.js",
  "product-svc/src/server.js",
  "gateway-svc/src/server.js",
]) {
  const source = read(serverFile);
  expect(source.includes("process.env.HOST || '127.0.0.1'") || source.includes('process.env.HOST || "127.0.0.1"'), `${serverFile} does not default to loopback binding`);
}

if (failures.length) {
  console.error("Demo deployment verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Demo deployment verification passed.");
