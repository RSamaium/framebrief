import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorkspaceHandler } from "./workspace-server";

const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const argument = (name: string) => { const index = process.argv.indexOf(name); return index === -1 ? undefined : process.argv[index + 1]; };

async function serveStatic(dist: string, request: string | undefined, res: import("node:http").ServerResponse) {
  const url = new URL(request ?? "/", "http://localhost");
  let pathname: string;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.statusCode = 400; res.end("Bad request"); return; }
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = resolve(dist, requested), rel = relative(dist, file);
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) { res.statusCode = 403; res.end("Forbidden"); return; }
  let target = file;
  try { if (!(await stat(file)).isFile()) throw new Error("not file"); }
  catch { if (extname(requested)) { res.statusCode = 404; res.end("Not found"); return; } target = resolve(dist, "index.html"); }
  try {
    res.statusCode = 200;
    res.setHeader("Content-Type", mime[extname(target)] ?? "application/octet-stream");
    res.setHeader("Cache-Control", target.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable");
    res.end(await readFile(target));
  } catch { res.statusCode = 404; res.end("Not found"); }
}

export function startServer(workspace: string, port = 5174) {
  const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
  const api = createWorkspaceHandler(resolve(workspace));
  const server = createServer((req, res) => api(req, res, () => serveStatic(dist, req.url, res)));
  server.listen(port, "127.0.0.1", () => process.stdout.write(`Framebrief ouvert sur http://127.0.0.1:${port}\nWorkspace : ${resolve(workspace)}\n`));
  return server;
}

const workspace = argument("--workspace") ?? process.env.FRAMEBRIEF_WORKSPACE;
const port = Number(argument("--port") ?? "5174");
if (!workspace || !Number.isInteger(port) || port < 1 || port > 65535) { process.stderr.write("Usage: framebrief serve --workspace /chemin/vers/projet [--port 5174]\n"); process.exitCode = 1; }
else { const server = startServer(workspace, port); process.once("SIGINT", () => server.close()); process.once("SIGTERM", () => server.close()); }
