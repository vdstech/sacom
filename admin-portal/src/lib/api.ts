import { SERVICE_BASES } from "@/lib/config";

type RequestOptions = {
  token?: string | null;
  method?: string;
  body?: unknown;
  service?: keyof typeof SERVICE_BASES;
  onUnauthorized?: () => Promise<string | null>;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, method = "GET", body, service, onUnauthorized } = options;
  const base = service ? SERVICE_BASES[service] : SERVICE_BASES.auth;

  const execute = async (authToken?: string | null) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      const payload = await safeJson(response);
      const message = payload?.error || payload?.message || `HTTP ${response.status}`;
      const error = new Error(message) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    return (await safeJson(response)) as T;
  };

  try {
    return await execute(token || null);
  } catch (error) {
    const e = error as Error & { status?: number };
    if (e.status === 401 && onUnauthorized) {
      const refreshed = await onUnauthorized();
      if (refreshed) return await execute(refreshed);
    }
    throw error;
  }
}

async function safeJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
