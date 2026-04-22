import { proxyToGatewayBase } from "../../../shared/next-gateway-proxy";

const gatewayBase = process.env.GATEWAY_INTERNAL_URL || "https://localhost:4000";

/** Admin Next routes proxy through gateway so browser traffic stays same-origin. */
export async function proxyToGateway(request: Request, path: string): Promise<Response> {
  return proxyToGatewayBase(request, path, gatewayBase);
}
