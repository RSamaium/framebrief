import type { RuntimeMedia, VideoAsset } from "./types";
import { decodeWaveform } from "./media";

type CachedMedia = {
  id: string;
  file: Blob;
  name: string;
  lastModified: number;
  thumbnails: string[];
  waveform?: number[];
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Stockage local indisponible."));
      return;
    }
    const request = indexedDB.open("framebrief-media", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("files", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(
        new Error("Fermez les anciens onglets pour activer la sauvegarde."),
      );
  });
}

export async function saveMedia(
  id: string,
  runtime: RuntimeMedia,
): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      const record: CachedMedia = {
        id,
        file: runtime.file,
        name: runtime.file.name,
        lastModified: runtime.file.lastModified,
        thumbnails: runtime.thumbnails,
        waveform: runtime.waveform,
      };
      tx.objectStore("files").put(record);
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(tx.error ?? new Error("La vidéo n’a pas pu être sauvegardée."));
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function restoreMedia(
  asset: VideoAsset,
): Promise<RuntimeMedia | undefined> {
  const db = await open();
  try {
    const cached = await new Promise<CachedMedia | undefined>(
      (resolve, reject) => {
        const request = db
          .transaction("files", "readonly")
          .objectStore("files")
          .get(asset.id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    if (
      !cached ||
      cached.file.size !== asset.size ||
      cached.name !== asset.name
    )
      return undefined;
    const file = new File([cached.file], cached.name, {
      type: cached.file.type,
      lastModified: cached.lastModified,
    });
    return {
      file,
      url: URL.createObjectURL(file),
      thumbnails: cached.thumbnails,
      waveform: cached.waveform ?? (await decodeWaveform(file).catch(() => [])),
    };
  } finally {
    db.close();
  }
}
