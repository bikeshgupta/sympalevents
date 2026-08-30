import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

const localApiRoutes = new Map([
  ["/api/me", "/api/me.ts"],
  ["/api/page-access", "/api/page-access.ts"],
  ["/api/event-access", "/api/event-access.ts"],
  ["/api/access-requests", "/api/access-requests.ts"],
  ["/api/events", "/api/events.ts"],
  ["/api/event-members", "/api/event-members.ts"],
  ["/api/health", "/api/health.ts"],
]);

async function readJsonBody(req: any) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : undefined;
}

function localApiPlugin(): Plugin {
  return {
    name: "local-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const modulePath = localApiRoutes.get(url.pathname);

        if (!modulePath) {
          next();
          return;
        }

        try {
          const mod = await server.ssrLoadModule(modulePath);
          let statusCode = 200;
          const apiReq = Object.assign(req, {
            body: await readJsonBody(req),
            query: Object.fromEntries(url.searchParams),
          });
          const apiRes = Object.assign(res, {
            status(code: number) {
              statusCode = code;
              res.statusCode = code;
              return this;
            },
            json(payload: unknown) {
              if (res.writableEnded) return this;
              res.statusCode = statusCode;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(payload));
              return this;
            },
          });

          await mod.default(apiReq, apiRes);

          if (!res.writableEnded) res.end();
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [localApiPlugin(), react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
