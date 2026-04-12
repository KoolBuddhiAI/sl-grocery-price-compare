import { getSeededKeellsMeatProducts } from "./adapters/keells.seed.ts";

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    ...init
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/products") {
      return json({
        data: getSeededKeellsMeatProducts(),
        meta: {
          store: "keells",
          category: "meat",
          mode: "seeded",
          note: "Static sample records only. Live Keells fetching is intentionally disabled in this environment because access is region blocked."
        }
      });
    }

    return json(
      {
        error: "Not found"
      },
      { status: 404 }
    );
  }
};
