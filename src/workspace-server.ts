import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  readFile,
  writeFile,
  rename,
  realpath,
  stat,
  mkdir,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { resolve, relative, isAbsolute, basename } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { parseManifest } from "./manifest";
import { createProject } from "./store";
import { renderVideoMd } from "./video-brief";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function workspacePath(
  root: string,
  path: string,
): Promise<string> {
  const base = await realpath(root),
    target = await realpath(resolve(base, path));
  const rel = relative(base, target);
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel))
    throw new Error("Chemin hors du workspace.");
  return target;
}

type Next = () => void;

/** Shared by Vite in development and the packaged static server in production. */
export function createWorkspaceHandler(
  directory = process.env.FRAMEBRIEF_WORKSPACE,
) {
  const root = directory && resolve(directory);
  let busy = false;
  return async (req: IncomingMessage, res: ServerResponse, next?: Next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/workspace")) return next?.();
    res.setHeader("Cache-Control", "no-store");
    const send = (status: number, data: unknown) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    };
    if (!root) return send(200, { enabled: false });
    const host = req.headers.host ?? "";
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host))
      return send(403, { error: "Serveur local uniquement." });
    if (req.headers.origin && req.headers.origin !== `http://${host}`)
      return send(403, { error: "Origine refusée." });
    try {
      if (
        url.pathname === "/api/workspace/import" &&
        req.method === "POST"
      ) {
        if (req.headers["content-type"] !== "application/octet-stream")
          return send(415, { error: "Fichier requis." });
        const name = url.searchParams.get("name") ?? "",
          extension = name.split(".").pop()?.toLowerCase();
        if (
          !extension ||
          ![
            "mp4", "webm", "mov", "m4v", "wav", "mp3", "ogg", "m4a",
            "aac", "flac",
          ].includes(extension)
        )
          return send(400, { error: "Format de média inconnu." });
        await mkdir(resolve(root, ".framebrief"), { recursive: true });
        await workspacePath(root, ".framebrief");
        await mkdir(resolve(root, ".framebrief/media"), { recursive: true });
        const dir = await workspacePath(root, ".framebrief/media");
        const filename = `${randomUUID()}.${extension}`;
        let bytes = 0;
        const limit = new Transform({
          transform(chunk, _encoding, callback) {
            bytes += chunk.length;
            callback(
              bytes > 2 * 1024 ** 3
                ? new Error("Média supérieur à 2 Go.")
                : null,
              chunk,
            );
          },
        });
        await pipeline(
          req,
          limit,
          createWriteStream(resolve(dir, filename), { flags: "wx" }),
        );
        return send(200, { path: `.framebrief/media/${filename}` });
      }
      const file = resolve(root, "video.review.json");
      let raw: string;
      try {
        raw = await readFile(file, "utf8");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        raw = JSON.stringify({
          ...createProject(basename(root)),
          id: `workspace_${hash(root).slice(0, 16)}`,
        });
      }
      const project = parseManifest(JSON.parse(raw));
      let exists = true;
      try { await stat(file); } catch { exists = false; }
      const revision = exists ? hash(raw) : "new";
      if (url.pathname === "/api/workspace/media" && req.method === "GET") {
        const asset = project.videos.find((v) => v.id === url.searchParams.get("id"));
        if (!asset?.source) return send(404, { error: "Média sans source locale." });
        const path = await workspacePath(root, asset.source.renderPath);
        const types: Record<string, string> = {
          mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", wav: "audio/wav",
          mp3: "audio/mpeg", m4a: "audio/mp4", m4v: "video/mp4", aac: "audio/aac",
          flac: "audio/flac", ogg: "audio/ogg",
        };
        if (!types[path.split(".").pop()!])
          return send(400, { error: "Le chemin ne désigne pas un média pris en charge." });
        res.setHeader("Content-Type", types[path.split(".").pop()!] ?? "application/octet-stream");
        res.end(await readFile(path));
        return;
      }
      if (req.method === "GET") {
        const mediaVersions: Record<string, string> = {};
        for (const v of project.videos) if (v.source) {
          try {
            const s = await stat(await workspacePath(root, v.source.renderPath));
            mediaVersions[v.id] = `${s.size}-${s.mtimeMs}`;
          } catch { mediaVersions[v.id] = "missing"; }
        }
        return send(200, { enabled: true, workspaceId: hash(root), revision, project, mediaVersions });
      }
      if (req.method !== "PUT" || url.pathname !== "/api/workspace")
        return send(405, { error: "Méthode refusée." });
      if (req.headers["content-type"] !== "application/json")
        return send(415, { error: "JSON requis." });
      if (busy) return send(409, { error: "Sauvegarde en cours." });
      busy = true;
      try {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 64 * 1024 * 1024) throw new Error("Checkpoint trop volumineux.");
          chunks.push(chunk);
        }
        const input = JSON.parse(Buffer.concat(chunks).toString());
        let latest = "new";
        try { latest = hash(await readFile(file, "utf8")); }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
        if (input.revision !== latest)
          return send(409, { error: "Le checkpoint a changé sur disque. Rechargez avant de poursuivre." });
        const incoming = parseManifest(input.project);
        if (incoming.id !== project.id)
          return send(409, { error: "Ce serveur est lié à un autre projet." });
        const serialized = JSON.stringify(incoming, null, 2);
        const temp = resolve(root, "video.review.json.tmp");
        await writeFile(temp, serialized);
        await rename(temp, file);
        await writeFile(resolve(root, "VIDEO.md"), renderVideoMd(incoming.name, incoming.brief), { flag: "wx" })
          .catch((e) => { if (e.code !== "EEXIST") throw e; });
        return send(200, { revision: hash(serialized) });
      } finally { busy = false; }
    } catch (error) {
      return send(400, { error: error instanceof Error ? error.message : "Workspace indisponible." });
    }
  };
}

export function workspacePlugin(
  directory = process.env.FRAMEBRIEF_WORKSPACE,
): Plugin {
  return {
    name: "framebrief-workspace",
    configureServer(server) {
      server.middlewares.use(createWorkspaceHandler(directory));
    },
  };
}
