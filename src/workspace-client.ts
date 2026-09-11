import { ProjectStore } from "./store";
import { parseManifest } from "./manifest";
import type { ProjectManifest } from "./types";

export interface WorkspaceState {
  enabled: boolean;
  workspaceId: string;
  revision: string;
  project: ProjectManifest;
  mediaVersions: Record<string, string>;
}
export async function readWorkspace(): Promise<WorkspaceState | undefined> {
  const res = await fetch("/api/workspace", { cache: "no-store" });
  if (res.status === 404) return;
  if (!res.ok) throw new Error("Impossible de charger le workspace.");
  if (!res.headers.get("content-type")?.includes("application/json")) return;
  const data = await res.json();
  if (!data.enabled) return;
  data.project = parseManifest(data.project);
  return data;
}
export function syncWorkspace(
  store: ProjectStore,
  initial: WorkspaceState,
  apply: (state: WorkspaceState) => Promise<void>,
  canReload: () => boolean,
  report: (message: string) => void,
) {
  let revision = initial.revision,
    versions = JSON.stringify(initial.mediaVersions),
    pending = initial.revision === "new",
    applying = false,
    running = false,
    conflict = false;
  const changed = () => {
    if (!applying) {
      pending = true;
      void tick();
    }
  };
  store.addEventListener("change", changed);
  const tick = async () => {
    if (running || conflict) return;
    running = true;
    try {
      if (pending) {
        pending = false;
        const res = await fetch("/api/workspace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision, project: store.project }),
        });
        if (!res.ok) {
          pending = true;
          if (res.status === 409) conflict = true;
          throw new Error((await res.json()).error ?? "Sauvegarde impossible.");
        }
        revision = (await res.json()).revision;
      } else if (canReload()) {
        const state = await readWorkspace();
        if (pending || !canReload()) return;
        if (!state || state.workspaceId !== initial.workspaceId)
          throw new Error("Le workspace a changé. Rechargez la page.");
        if (
          state.revision !== revision ||
          JSON.stringify(state.mediaVersions) !== versions
        ) {
          applying = true;
          try {
            await apply(state);
            revision = state.revision;
            versions = JSON.stringify(state.mediaVersions);
          } finally {
            applying = false;
          }
        }
      }
    } catch (e) {
      report(e instanceof Error ? e.message : "Synchronisation impossible.");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 1500);
  void tick();
  return () => {
    clearInterval(timer);
    store.removeEventListener("change", changed);
  };
}
