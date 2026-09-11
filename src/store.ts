import type {
  Annotation,
  DraftAnnotation,
  ProjectManifest,
  VideoBrief,
  VideoAsset,
} from "./types";
import { annotationFromDraft, parseManifest, validateDraft } from "./manifest";
import { makeId, roundTime } from "./utils";
import { createVideoBrief } from "./video-brief";
import { validateVideoBrief } from "./video-brief";
export const STORAGE_KEY = "framebrief.project.v2";
export function createProject(name = "Mon projet vidéo"): ProjectManifest {
  const now = new Date().toISOString();
  return {
    version: "2.1",
    id: makeId("project"),
    name,
    createdAt: now,
    updatedAt: now,
    videos: [],
    annotations: [],
    brief: createVideoBrief(),
  };
}
export class ProjectStore extends EventTarget {
  project: ProjectManifest;
  private past: ProjectManifest[] = [];
  private future: ProjectManifest[] = [];
  storageError?: string;
  constructor(initial?: ProjectManifest) {
    super();
    this.project = initial ?? createProject();
  }
  static restore(): ProjectStore {
    try {
      const raw =
        localStorage.getItem(STORAGE_KEY) ??
        localStorage.getItem("framebrief.project.v1");
      return new ProjectStore(raw ? parseManifest(JSON.parse(raw)) : undefined);
    } catch {
      const s = new ProjectStore();
      s.storageError =
        "La sauvegarde illisible a été conservée. Importez une copie du projet.";
      return s;
    }
  }
  private checkpoint(): void {
    this.past.push(structuredClone(this.project));
    if (this.past.length > 80) this.past.shift();
    this.future = [];
  }
  replace(project: ProjectManifest): void {
    const parsed = parseManifest(project);
    this.checkpoint();
    this.project = parsed;
    this.commit();
  }
  rename(name: string): void {
    this.checkpoint();
    this.project.name = name.trim() || "Sans titre";
    this.commit();
  }
  updateBrief(brief: VideoBrief): VideoBrief {
    validateVideoBrief(brief);
    this.checkpoint();
    this.project.brief = structuredClone(brief);
    this.commit();
    return this.project.brief;
  }
  addVideo(video: VideoAsset): void {
    this.checkpoint();
    this.project.videos.push(video);
    this.commit();
  }
  removeVideo(id: string): void {
    this.checkpoint();
    this.project.videos = this.project.videos.filter((v) => v.id !== id);
    this.project.annotations = this.project.annotations.filter(
      (a) => a.videoId !== id && a.destination?.videoId !== id,
    );
    this.commit();
  }
  saveAnnotation(draft: DraftAnnotation): Annotation {
    validateDraft(draft, this.project.videos);
    const existing = this.project.annotations.find((a) => a.id === draft.id);
    if (draft.id && !existing)
      throw new Error("L’annotation à modifier n’existe pas.");
    const rounded = {
      ...draft,
      startTime: roundTime(draft.startTime),
      ...(draft.endTime !== undefined
        ? { endTime: roundTime(draft.endTime) }
        : {}),
    };
    let d = draft;
    try {
      validateDraft(rounded, this.project.videos);
      d = rounded;
    } catch {
      /* Preserve precise boundary selections. */
    }
    const a = annotationFromDraft(
      d,
      existing?.id ?? makeId("annotation"),
      existing?.createdAt ?? new Date().toISOString(),
      this.project.videos,
    );
    this.checkpoint();
    this.project.annotations = existing
      ? this.project.annotations.map((item) => (item.id === a.id ? a : item))
      : [...this.project.annotations, a];
    this.commit();
    return a;
  }
  deleteAnnotation(id: string): void {
    this.checkpoint();
    this.project.annotations = this.project.annotations.filter(
      (a) => a.id !== id,
    );
    this.commit();
  }
  undo(): void {
    const prev = this.past.pop();
    if (prev) {
      this.future.push(structuredClone(this.project));
      this.project = prev;
      this.commit();
    }
  }
  redo(): void {
    const next = this.future.pop();
    if (next) {
      this.past.push(structuredClone(this.project));
      this.project = next;
      this.commit();
    }
  }
  private commit(): void {
    this.project.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project));
      this.storageError = undefined;
    } catch {
      this.storageError = "Sauvegarde indisponible. Exportez avec la palette.";
    }
    this.dispatchEvent(new Event("change"));
  }
}
