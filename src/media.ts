import type { RuntimeMedia, VideoAsset } from "./types";
import { makeId } from "./utils";

function waitFor(element: HTMLMediaElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Le média ne répond pas."));
    }, 15000);
    const done = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error("Le navigateur ne peut pas décoder cette vidéo."));
    };
    const cleanup = () => {
      clearTimeout(timer);
      element.removeEventListener(event, done);
      element.removeEventListener("error", failed);
    };
    element.addEventListener(event, done, { once: true });
    element.addEventListener("error", failed, { once: true });
  });
}

export async function inspectVideo(
  file: File,
): Promise<{ asset: VideoAsset; runtime: RuntimeMedia }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.src = url;
  try {
    await waitFor(video, "loadedmetadata");
    if (!Number.isFinite(video.duration) || video.duration <= 0)
      throw new Error("Durée vidéo indisponible.");
    const asset: VideoAsset = {
      id: makeId("video"),
      kind: "video",
      name: file.name,
      type: file.type || "video/*",
      size: file.size,
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      lastModified: file.lastModified,
      addedAt: new Date().toISOString(),
    };
    const thumbnails = await generateThumbnails(video, 16);
    const waveform = await decodeWaveform(file).catch(() => []);
    return { asset, runtime: { file, url, thumbnails, waveform } };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

export async function linkVideo(file: File): Promise<RuntimeMedia> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.src = url;
  try {
    await waitFor(video, "loadedmetadata");
    const thumbnails = await generateThumbnails(video, 16);
    return { file, url, thumbnails };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function generateThumbnails(
  video: HTMLVideoElement,
  count: number,
): Promise<string[]> {
  const canvas = document.createElement("canvas");
  const ratio = video.videoWidth / Math.max(1, video.videoHeight);
  canvas.height = 116;
  canvas.width = Math.round(canvas.height * Math.min(2, Math.max(1.2, ratio)));
  const context = canvas.getContext("2d");
  if (!context) return [];
  const thumbnails: string[] = [];
  const total = Math.max(1, Math.min(count, Math.ceil(video.duration / 1.5)));
  for (let index = 0; index < total; index += 1) {
    const targetTime = Math.min(
      video.duration - 0.01,
      (video.duration * (index + 0.5)) / total,
    );
    const seeked = waitFor(video, "seeked");
    video.currentTime = Math.max(0.000001, targetTime);
    await seeked;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    thumbnails.push(canvas.toDataURL("image/jpeg", 0.7));
  }
  return thumbnails;
}

export function matchAsset(
  file: File,
  assets: VideoAsset[],
): VideoAsset | undefined {
  return assets.find(
    (asset) => asset.name === file.name && asset.size === file.size,
  );
}

export async function decodeWaveform(file: Blob): Promise<number[]> {
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    return Array.from({ length: 480 }, (_, i) => {
      let peak = 0;
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const data = buffer.getChannelData(c);
        for (
          let j = Math.floor((i * data.length) / 480);
          j < Math.floor(((i + 1) * data.length) / 480);
          j++
        )
          peak = Math.max(peak, Math.abs(data[j]));
      }
      return peak;
    });
  } finally {
    await ctx.close();
  }
}

export async function inspectMedia(
  file: File,
): Promise<{ asset: VideoAsset; runtime: RuntimeMedia }> {
  if (
    !file.type.startsWith("audio/") &&
    !/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name)
  )
    return inspectVideo(file);
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    const data = buffer.getChannelData(0);
    const waveform = Array.from({ length: 240 }, (_, i) => {
      let peak = 0;
      const end = Math.floor(((i + 1) * data.length) / 240);
      for (let j = Math.floor((i * data.length) / 240); j < end; j++)
        peak = Math.max(peak, Math.abs(data[j]));
      return peak;
    });
    return {
      asset: {
        id: makeId("audio"),
        kind: "audio",
        name: file.name,
        type: file.type || "audio/*",
        size: file.size,
        duration: buffer.duration,
        width: 0,
        height: 0,
        lastModified: file.lastModified,
        addedAt: new Date().toISOString(),
      },
      runtime: {
        file,
        url: URL.createObjectURL(file),
        thumbnails: [],
        waveform,
      },
    };
  } finally {
    await ctx.close();
  }
}
