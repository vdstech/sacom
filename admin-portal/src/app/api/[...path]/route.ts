import { proxyToGateway } from "@/lib/server-proxy";

export const runtime = "nodejs";

type Context = { params: { path?: string[] } };

function targetPath(params: Context["params"]) {
  const suffix = (params.path || []).join("/");
  return suffix ? `/api/${suffix}` : "/api";
}

export async function GET(request: Request, context: Context) {
  return proxyToGateway(request, targetPath(context.params));
}

export async function POST(request: Request, context: Context) {
  return proxyToGateway(request, targetPath(context.params));
}

export async function PUT(request: Request, context: Context) {
  return proxyToGateway(request, targetPath(context.params));
}

export async function PATCH(request: Request, context: Context) {
  return proxyToGateway(request, targetPath(context.params));
}

export async function DELETE(request: Request, context: Context) {
  return proxyToGateway(request, targetPath(context.params));
}

export async function OPTIONS(request: Request, context: Context) {
  return proxyToGateway(request, targetPath(context.params));
}
