import http from "http";
import https from "https";

const gatewayBase = process.env.GATEWAY_INTERNAL_URL || "https://localhost:4000";
const isLocalDev = process.env.NODE_ENV !== "production";

function joinUrl(base: string, path: string, search: string) {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}${search}`;
}

function cloneHeaders(request: Request) {
  const headers = new Headers(request.headers);
  headers.delete("host");
  return headers;
}

export async function proxyToGateway(request: Request, path: string): Promise<Response> {
  const requestUrl = new URL(request.url);
  const upstreamUrl = joinUrl(gatewayBase, path, requestUrl.search);
  const headers = cloneHeaders(request);
  const method = request.method.toUpperCase();

  const body =
    method !== "GET" && method !== "HEAD" ? Buffer.from(await request.arrayBuffer()) : undefined;

  try {
    const upstream = await proxyRequest(upstreamUrl, method, headers, body);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: upstream.headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upstream proxy request failed";
    return Response.json(
      {
        error: "Gateway proxy failure",
        message,
        target: upstreamUrl,
      },
      { status: 502 }
    );
  }
}

function buildResponseHeaders(rawHeaders: http.IncomingHttpHeaders) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
      continue;
    }
    headers.set(key, value);
  }
  return headers;
}

function proxyRequest(urlString: string, method: string, headers: Headers, body?: Buffer) {
  const url = new URL(urlString);
  const isHttps = url.protocol === "https:";
  const transport = isHttps ? https : http;

  const outgoingHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    outgoingHeaders[key] = value;
  });

  const options: https.RequestOptions = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: `${url.pathname}${url.search}`,
    method,
    headers: outgoingHeaders,
  };

  if (isHttps && isLocalDev) {
    options.rejectUnauthorized = false;
  }

  return new Promise<{ status: number; headers: Headers; body: Buffer }>((resolve, reject) => {
    const req = transport.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        resolve({
          status: res.statusCode || 502,
          headers: buildResponseHeaders(res.headers),
          body: Buffer.concat(chunks),
        });
      });
    });

    req.on("error", reject);
    if (body && body.length > 0) req.write(body);
    req.end();
  });
}
