import { proxyToGatewayBase } from "../../../shared/next-gateway-proxy";

const gatewayBase = process.env.GATEWAY_INTERNAL_URL || "https://localhost:4000";

/** Storefront server routes proxy through gateway to keep browser calls same-origin. */
export async function proxyToGateway(request: Request, path: string): Promise<Response> {
  return proxyToGatewayBase(request, path, gatewayBase);
}
