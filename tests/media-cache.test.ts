import "fake-indexeddb/auto";
import { File as NodeFile } from "node:buffer";
import { beforeAll, expect, it, vi } from "vitest";
import { restoreMedia, saveMedia } from "../src/media-cache";
import type { VideoAsset } from "../src/types";
beforeAll(() => {
  vi.stubGlobal("File", NodeFile);
  URL.createObjectURL = vi.fn(() => "blob:restored-media");
});
it("restores file bytes and previews from a fresh database connection", async () => {
  const file = new NodeFile(["video bytes"], "keep.webm", {
    type: "video/webm",
    lastModified: 123,
  });
  const asset: VideoAsset = {
    id: "persistent",
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: 123,
    addedAt: new Date().toISOString(),
    duration: 3,
    width: 640,
    height: 360,
    kind: "video",
  };
  await saveMedia(asset.id, {
    file: file as unknown as File,
    url: "blob:temporary",
    thumbnails: ["data:image/jpeg;base64,frame"],
    waveform: [0.1, 0.4],
  });
  const restored = await restoreMedia(asset);
  expect(restored?.url).toBe("blob:restored-media");
  expect(await restored?.file.text()).toBe("video bytes");
  expect(restored?.file.name).toBe("keep.webm");
  expect(restored?.thumbnails).toEqual(["data:image/jpeg;base64,frame"]);
  expect(restored?.waveform).toEqual([0.1, 0.4]);
  expect(await restoreMedia({ ...asset, id: "not-cached" })).toBeUndefined();
  expect(await restoreMedia({ ...asset, size: 999 })).toBeUndefined();
});
