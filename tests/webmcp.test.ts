import { describe, expect, it, vi } from "vitest";
import { createProject } from "../src/store";
import type { DraftAnnotation } from "../src/types";
import { registerWebMcpTools, type ModelContextLike } from "../src/webmcp";

describe("WebMCP adapter", () => {
  it("exposes frame images and rejects update calls without an existing id", async () => {
    const tools = new Map<
      string,
      Parameters<ModelContextLike["registerTool"]>[0]
    >();
    registerWebMcpTools(
      { registerTool: (tool) => tools.set(tool.name, tool) },
      {
        getProject: createProject,
        saveAnnotation: vi.fn(),
        captureFrame: async () => ({
          data: "png",
          mimeType: "image/png",
          time: 1,
          videoId: "v",
        }),
      },
    );
    const result = await tools
      .get("capture_video_frame")!
      .execute({ videoId: "v", time: 1 });
    expect(result.content[0]).toMatchObject({ type: "image", data: "png" });
    await expect(
      tools
        .get("update_video_annotation")!
        .execute({ videoId: "v", startTime: 1, prompt: "test" }),
    ).rejects.toThrow();
  });
  it("degrades gracefully without browser support", () => {
    expect(
      registerWebMcpTools(undefined, {
        getProject: createProject,
        saveAnnotation: vi.fn(),
      }),
    ).toBe(false);
  });

  it("registers public tools and executes writes", async () => {
    const tools = new Map<
      string,
      Parameters<ModelContextLike["registerTool"]>[0]
    >();
    const context: ModelContextLike = {
      registerTool: (tool) => tools.set(tool.name, tool),
    };
    const saveAnnotation = vi.fn((draft: DraftAnnotation) => ({
      ...draft,
      id: "annotation_1",
    }));
    expect(
      registerWebMcpTools(context, {
        getProject: createProject,
        saveAnnotation,
      }),
    ).toBe(true);
    expect([...tools.keys()]).toEqual([
      "get_video_annotation_project",
      "get_video_project_brief",
      "list_video_annotations",
      "create_video_annotation",
      "update_video_annotation",
      "get_annotation_images",
    ]);
    const result = await tools
      .get("create_video_annotation")!
      .execute({ videoId: "video_1", startTime: 3, prompt: "Zoom" });
    expect(saveAnnotation).toHaveBeenCalledOnce();
    expect(result.structuredContent).toMatchObject({ id: "annotation_1" });
  });

  it("returns and validates a synchronized production brief", async () => {
    const tools = new Map<
      string,
      Parameters<ModelContextLike["registerTool"]>[0]
    >();
    const project = createProject();
    const updateBrief = vi.fn((brief) => brief);
    registerWebMcpTools(
      { registerTool: (tool) => tools.set(tool.name, tool) },
      { getProject: () => project, saveAnnotation: vi.fn(), updateBrief },
    );
    const initial = await tools.get("get_video_project_brief")!.execute({});
    expect(initial.structuredContent).toMatchObject({
      brief: { compositionEngine: "hyperframes" },
    });
    await tools
      .get("update_video_project_brief")!
      .execute(project.brief as unknown as Record<string, unknown>);
    expect(updateBrief).toHaveBeenCalledWith(project.brief);
  });
});
