import http from "http";
import https from "https";

export const runtime = "nodejs";

type Context = { params: { service: string } };

const HEALTH_TARGETS: Record<string, string> = {
  gateway: process.env.GATEWAY_INTERNAL_URL || "https://localhost:4000",
  auth: process.env.AUTH_INTERNAL_URL || "https://localhost:4443",
  catalog: process.env.CATALOG_INTERNAL_URL || "https://localhost:4444",
  product: process.env.PRODUCT_INTERNAL_URL || "https://localhost:4445",
  navigation: process.env.NAVIGATION_INTERNAL_URL || "https://localhost:4446",
};

function requestJson(urlString: string) {
  const url = new URL(urlString);
  const isHttps = url.protocol === "https:";
  const transport = isHttps ? https : http;

  const options: https.RequestOptions = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: `${url.pathname}${url.search}`,
    method: "GET",
    headers: { accept: "application/json" },
    rejectUnauthorized: process.env.NODE_ENV === "production",
  };

  return new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const req = transport.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode || 502,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });

    req.on("error", reject);
    req.end();
  });
}

export async function GET(_request: Request, context: Context) {
  const key = String(context.params.service || "").toLowerCase();
  const base = HEALTH_TARGETS[key];
  if (!base) {
    return Response.json({ error: "Unknown service" }, { status: 404 });
  }

  try {
    const upstream = await requestJson(`${base.replace(/\/$/, "")}/health`);
    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      return Response.json(
        { ok: false, service: key, error: `HTTP ${upstream.statusCode}`, raw: upstream.body.slice(0, 300) },
        { status: 502 }
      );
    }

    try {
      const parsed = JSON.parse(upstream.body);
      return Response.json(parsed);
    } catch {
      return Response.json(
        { ok: false, service: key, error: "Invalid JSON response", raw: upstream.body.slice(0, 300) },
        { status: 502 }
      );
    }
  } catch (error) {
    return Response.json(
      { ok: false, service: key, error: error instanceof Error ? error.message : "Health check failed" },
      { status: 502 }
    );
  }
}

