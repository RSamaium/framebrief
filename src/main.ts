import "./styles.css";
import "./desktop.css";
import { FramebriefApp } from "./app";
import { ProjectStore } from "./store";
import { readWorkspace, syncWorkspace } from "./workspace-client";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Élément #app introuvable.");

async function start() {
  try {
    const workspace = await readWorkspace();
    const store = workspace
      ? new ProjectStore(workspace.project)
      : ProjectStore.restore();
    if (workspace) store.storageKey = null;
    const app = new FramebriefApp(root!, store);
    if (workspace) {
      await app.loadWorkspace(workspace);
      syncWorkspace(
        store,
        workspace,
        (state) => app.loadWorkspace(state),
        () => app.canReloadWorkspace(),
        (message) => app.reportWorkspace(message),
      );
    }
  } catch (error) {
    root!.textContent =
      error instanceof Error
        ? error.message
        : "Chargement impossible. Rechargez la page.";
  }
}
void start();
