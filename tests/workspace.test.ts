// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import {
  mkdtemp,
  writeFile,
  readFile,
  mkdir,
  symlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspacePlugin, workspacePath } from "../src/workspace-server";
import { createProject } from "../src/store";

const servers: ViteDevServer[] = [],
  dirs: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "framebrief-workspace-"));
  dirs.push(dir);
  const server = await createServer({
    configFile: false,
    root: dir,
    plugins: [workspacePlugin(dir)],
    server: { host: "127.0.0.1", port: 0 },
  });
  servers.push(server);
  await server.listen();
  const addr = server.httpServer!.address() as { port: number };
  return { dir, url: `http://127.0.0.1:${addr.port}/api/workspace` };
}
it("saves a workspace checkpoint, preserves VIDEO.md and rejects stale writes", async () => {
  const { dir, url } = await setup();
  await writeFile(join(dir, "VIDEO.md"), "# Human brief");
  const initial = await (await fetch(url)).json();
  expect(initial.project.videos).toEqual([]);
  initial.project.name = "Production";
  const save = () =>
    fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        revision: initial.revision,
        project: initial.project,
      }),
    });
  expect((await save()).status).toBe(200);
  expect((await save()).status).toBe(409);
  expect(
    JSON.parse(await readFile(join(dir, "video.review.json"), "utf8")).name,
  ).toBe("Production");
  expect(await readFile(join(dir, "VIDEO.md"), "utf8")).toBe("# Human brief");
  expect(
    (
      await fetch(url, {
        method: "PUT",
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
  ).toBe(403);
});
it("isolates projects and detects changed rendered files with stable media ids", async () => {
  const a = await setup(),
    b = await setup();
  await mkdir(join(a.dir, "renders"));
  await writeFile(join(a.dir, "renders/result.mp4"), "revision one");
  const project = createProject("A");
  project.videos = [
    {
      id: "v",
      name: "result.mp4",
      kind: "video",
      type: "video/mp4",
      duration: 4,
      width: 640,
      height: 360,
      size: 12,
      lastModified: 1,
      addedAt: project.createdAt,
      source: {
        engine: "hyperframes",
        path: "index.html",
        renderPath: "renders/result.mp4",
      },
    },
  ];
  await writeFile(join(a.dir, "video.review.json"), JSON.stringify(project));
  const old = await (await fetch(a.url)).json();
  await writeFile(join(a.dir, "renders/result.mp4"), "revision two longer");
  const current = await (await fetch(a.url)).json();
  expect(current.project.videos[0].id).toBe("v");
  expect(current.mediaVersions.v).not.toBe(old.mediaVersions.v);
  expect(await (await fetch(a.url + "/media?id=v")).text()).toBe(
    "revision two longer",
  );
  expect((await (await fetch(b.url)).json()).project.videos).toHaveLength(0);
  await symlink(b.dir, join(a.dir, "escape"));
  await expect(workspacePath(a.dir, "escape")).rejects.toThrow(
    "hors du workspace",
  );
});
