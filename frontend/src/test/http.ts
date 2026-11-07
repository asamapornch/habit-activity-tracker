import { vi } from "vitest";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export type Handler = (init?: RequestInit) => Response | Promise<Response>;

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse(status, { error: { code, message } });
}

/** Routes keyed "METHOD /path"; any other request fails the test. */
export function mockFetch(routes: Record<string, Handler>) {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    for (const [key, handler] of Object.entries(routes)) {
      const [routeMethod, routePath] = key.split(" ");
      if (method === routeMethod && url === `${API_URL}${routePath}`) return handler(init);
    }
    throw new Error(`Unhandled fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

export function sentBody(handler: { mock: { calls: unknown[][] } }, call = 0): unknown {
  const init = handler.mock.calls[call][0] as RequestInit | undefined;
  return JSON.parse(init!.body as string);
}
