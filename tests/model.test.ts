import { beforeEach, describe, expect, it } from "vitest";
import { parseManifest, serializeManifest } from "../src/manifest";
import { createProject, ProjectStore } from "../src/store";
import type { ProjectManifest, VideoAsset } from "../src/types";
import { formatTime, isValidRegion, normalizeRegion } from "../src/utils";
import { renderVideoMd } from "../src/video-brief";

const video: VideoAsset = {
  kind: "video",
  id: "video_1",
  name: "plan.webm",
  type: "video/webm",
  size: 1000,
  duration: 24,
  width: 1920,
  height: 1080,
  lastModified: 1,
  addedAt: "2026-01-01T00:00:00.000Z",
};

describe("time and region utilities", () => {
  it("formats timeline values", () => {
    expect(formatTime(78.49)).toBe("01:18");
    expect(formatTime(18.49, true)).toBe("00:18,4");
  });

  it("normalizes regions inside the frame", () => {
    expect(normalizeRegion({ x: -0.2, y: 0.9, width: 2, height: 0.5 })).toEqual(
      { x: 0, y: 0.9, width: 1, height: 0.1 },
    );
    expect(isValidRegion({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 })).toBe(
      true,
    );
    expect(isValidRegion({ x: 0.8, y: 0.2, width: 0.3, height: 0.4 })).toBe(
      false,
    );
  });
});

describe("manifest contract", () => {
  it("preserves whole-media scope, editable provenance and exact insertion target", () => {
    const v = {
      ...video,
      source: {
        engine: "hyperframes" as const,
        path: "composition/index.html",
        renderPath: "renders/current.mp4",
      },
    };
    const store = new ProjectStore({
      ...createProject(),
      videos: [v, { ...video, id: "destination" }],
    });
    const a = store.saveAnnotation({
      videoId: v.id,
      scope: "media",
      startTime: 0,
      endTime: v.duration,
      prompt: "Enlever le fond vert puis insérer ici",
      destination: { videoId: "destination", time: 2.375 },
    });
    const restored = parseManifest(
      JSON.parse(serializeManifest(store.project)),
    );
    expect(restored.annotations[0]).toEqual(a);
    expect(a.context).toContain("composition/index.html (hyperframes)");
    expect(a.context).toContain("média entier");
    expect(() => store.saveAnnotation({ ...a, startTime: 1 })).toThrow(
      "tout le média",
    );
  });
  it("migrates existing projects to a deterministic VIDEO.md brief", () => {
    const legacy = {
      ...createProject(),
      version: "2.0" as const,
      videos: [video],
    };
    delete (legacy as unknown as Partial<ProjectManifest>).brief;
    const project = parseManifest(legacy);
    expect(project.version).toBe("2.1");
    expect(project.brief.compositionEngine).toBe("hyperframes");
    const markdown = renderVideoMd(project.name, project.brief);
    expect(markdown).toContain("## Pipeline autorisé");
    expect(markdown).toContain("Moteur de composition : hyperframes");
  });
  it("persists only authorized providers and never secret values", () => {
    const store = new ProjectStore(createProject());
    const brief = structuredClone(store.project.brief);
    brief.status = "ready";
    brief.generalPrompt = "Film produit";
    brief.aiProviders = [
      { name: "fal.ai", model: "video", authorized: true, keyConfigured: true },
    ];
    store.updateBrief(brief);
    expect(renderVideoMd(store.project.name, store.project.brief)).toContain(
      "fal.ai (video) — autorisé, clé configurée",
    );
    expect(() =>
      store.updateBrief({
        ...brief,
        aiProviders: [{ name: "x", authorized: "yes" as never }],
      }),
    ).toThrow(/Brief vidéo invalide/);
  });
  it("preserves reference captures and rejects invalid image coordinates", () => {
    const store = new ProjectStore({ ...createProject(), videos: [video] });
    const a = store.saveAnnotation({
      videoId: video.id,
      startTime: 2,
      prompt: "ici",
      referenceImages: [
        {
          purpose: "annotation",
          time: 2,
          width: 960,
          height: 540,
          dataUrl: "data:image/jpeg;base64,YQ==",
        },
      ],
    });
    expect(
      parseManifest(JSON.parse(serializeManifest(store.project))).annotations[0]
        .referenceImages,
    ).toEqual(a.referenceImages);
    expect(a.context).toContain("annotation à 2.000 s");
    expect(() =>
      store.saveAnnotation({
        ...a,
        referenceImages: [{ ...a.referenceImages![0], time: 99 }],
      }),
    ).toThrow();
  });
  it("migrates v1 rectangles with stable ids and exact frame references", () => {
    const project = {
      ...createProject(),
      version: "1.0",
      videos: [video],
      annotations: [
        {
          id: "old",
          videoId: video.id,
          startTime: 2,
          prompt: "ici",
          region: { x: 0.2, y: 0.3, width: 0.4, height: 0.2 },
          createdAt: video.addedAt,
          updatedAt: video.addedAt,
        },
      ],
    };
    const migrated = parseManifest(project);
    expect(migrated.version).toBe("2.1");
    expect(migrated.annotations[0]).toMatchObject({
      id: "old",
      frameTime: 2,
      drawings: [
        { type: "rectangle", x: 0.2, y: 0.3, width: 0.4, height: 0.2 },
      ],
    });
    expect(migrated.annotations[0].region).toBeUndefined();
    expect(project.annotations[0].region).toBeDefined();
  });

  it("round-trips a linked audio range with volume and rejects out-of-bounds destinations", () => {
    const store = new ProjectStore({
      ...createProject(),
      videos: [
        video,
        { ...video, id: "audio", kind: "audio", width: 0, height: 0 },
      ],
    });
    const a = store.saveAnnotation({
      videoId: "audio",
      startTime: 1,
      endTime: 3,
      volume: 0.3,
      destination: { videoId: video.id, time: 12 },
      prompt: "fond sonore",
    });
    expect(
      parseManifest(JSON.parse(serializeManifest(store.project)))
        .annotations[0],
    ).toEqual(a);
    expect(a.context).toContain("12.000");
    expect(() =>
      store.saveAnnotation({
        ...a,
        destination: { videoId: video.id, time: 99 },
      }),
    ).toThrow();
    expect(() =>
      store.saveAnnotation({
        ...a,
        drawings: [{ type: "arrow", from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }],
      }),
    ).toThrow();
  });
  it("round-trips a valid project", () => {
    const project: ProjectManifest = {
      ...createProject("Film"),
      videos: [video],
      annotations: [],
    };
    expect(parseManifest(JSON.parse(serializeManifest(project)))).toEqual(
      project,
    );
  });

  it("rejects dangling annotations", () => {
    const project = {
      ...createProject(),
      videos: [],
      annotations: [
        {
          id: "a",
          videoId: "missing",
          startTime: 1,
          prompt: "",
          createdAt: "",
          updatedAt: "",
        },
      ],
    };
    expect(() => parseManifest(project)).toThrow(/Vidéo inconnue/);
  });
});

describe("project store", () => {
  beforeEach(() => localStorage.clear());
  it("undoes and redoes changes, including clearing optional fields", () => {
    const store = new ProjectStore({ ...createProject(), videos: [video] });
    const a = store.saveAnnotation({
      videoId: video.id,
      startTime: 2,
      endTime: 3,
      prompt: "test",
      drawings: [
        {
          type: "freehand",
          points: [
            { x: 0.1, y: 0.2 },
            { x: 0.3, y: 0.4 },
          ],
        },
      ],
    });
    store.saveAnnotation({
      id: a.id,
      videoId: video.id,
      startTime: 2,
      prompt: "modifié",
    });
    expect(store.project.annotations[0].endTime).toBeUndefined();
    store.undo();
    expect(store.project.annotations[0].drawings).toHaveLength(1);
    store.redo();
    expect(store.project.annotations[0].prompt).toBe("modifié");
    store.undo();
    store.undo();
    expect(store.project.annotations).toHaveLength(0);
  });

  it("creates and updates a precise range annotation", () => {
    const project = createProject();
    project.videos.push(video);
    const store = new ProjectStore(project);
    const created = store.saveAnnotation({
      videoId: video.id,
      startTime: 1.23456,
      endTime: 2.34567,
      intention: "Zoom",
      prompt: " Visage ",
    });
    expect(created.startTime).toBe(1.235);
    expect(created.prompt).toBe("Visage");
    const updated = store.saveAnnotation({ ...created, prompt: "Regard" });
    expect(updated.id).toBe(created.id);
    expect(store.project.annotations).toHaveLength(1);
    expect(ProjectStore.restore().project.annotations[0].prompt).toBe("Regard");
  });

  it("rejects invalid agent-facing writes", () => {
    const project = createProject();
    project.videos.push(video);
    const store = new ProjectStore(project);
    expect(() =>
      store.saveAnnotation({
        videoId: "missing",
        startTime: 1,
        prompt: "Test",
      }),
    ).toThrow(/n’existe pas/);
    expect(() =>
      store.saveAnnotation({
        videoId: video.id,
        startTime: 23,
        endTime: 25,
        prompt: "Test",
      }),
    ).toThrow(/temps de fin/);
    expect(() =>
      store.saveAnnotation({
        id: "missing",
        videoId: video.id,
        startTime: 1,
        prompt: "Test",
      }),
    ).toThrow(/annotation à modifier/);
  });
});
