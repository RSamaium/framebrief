import {
  INTENTIONS,
  type Annotation,
  type DraftAnnotation,
  type ProjectManifest,
  type VideoAsset,
} from "./types";
import { isValidRegion } from "./utils";
import { normalizeVideoBrief, validateVideoBrief } from "./video-brief";
const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);
const text = (s: unknown): s is string => typeof s === "string" && !!s.trim();
const date = (s: unknown) => text(s) && Number.isFinite(Date.parse(s));
const point = (p: { x: number; y: number }) =>
  p &&
  finite(p.x) &&
  finite(p.y) &&
  p.x >= 0 &&
  p.x <= 1 &&
  p.y >= 0 &&
  p.y <= 1;
export function validateDraft(d: DraftAnnotation, videos: VideoAsset[]): void {
  if (d.scope !== undefined && d.scope !== "media")
    throw new Error("Portée invalide.");
  if (d.channel !== undefined && !["audio", "video"].includes(d.channel))
    throw new Error("Canal invalide.");
  const v = videos.find((v) => v.id === d.videoId);
  if (!v) throw new Error("Vidéo inconnue : le média ciblé n’existe pas.");
  if (d.action !== undefined && !["modify", "insert"].includes(d.action))
    throw new Error("Action invalide.");
  if (d.action === "insert" && !d.insertion)
    throw new Error("Une nouvelle scène doit préciser son point d’insertion.");
  if (d.insertion) {
    if (
      d.action !== "insert" ||
      !["before", "after", "at"].includes(d.insertion.position) ||
      !finite(d.insertion.time) ||
      d.insertion.time < 0 ||
      d.insertion.time > v.duration ||
      typeof d.insertion.useAdjacentFrames !== "boolean"
    )
      throw new Error("Insertion invalide.");
  }
  if (d.scope === "media" && (d.startTime !== 0 || d.endTime !== v.duration))
    throw new Error("Une instruction globale doit couvrir tout le média.");
  if (d.assistance !== undefined && d.assistance !== "continue-video")
    throw new Error("Aide inconnue.");
  if (d.referenceImages !== undefined) {
    if (
      !Array.isArray(d.referenceImages) ||
      d.referenceImages.length > 2 ||
      v.kind === "audio"
    )
      throw new Error("Captures invalides.");
    for (const image of d.referenceImages) {
      if (
        !image ||
        !["annotation", "continuation"].includes(image.purpose) ||
        !finite(image.time) ||
        image.time < 0 ||
        image.time > v.duration ||
        !Number.isInteger(image.width) ||
        image.width <= 0 ||
        image.width > 1920 ||
        !Number.isInteger(image.height) ||
        image.height <= 0 ||
        image.height > 1920 ||
        typeof image.dataUrl !== "string" ||
        image.dataUrl.length > 3000000 ||
        !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(
          image.dataUrl,
        )
      )
        throw new Error("Capture invalide.");
    }
  }
  if (!finite(d.startTime) || d.startTime < 0 || d.startTime > v.duration)
    throw new Error("Temps de début invalide.");
  if (
    d.endTime !== undefined &&
    (!finite(d.endTime) || d.endTime <= d.startTime || d.endTime > v.duration)
  )
    throw new Error("Le temps de fin est invalide.");
  if (typeof d.prompt !== "string") throw new Error("Prompt invalide.");
  if (d.intention !== undefined && !INTENTIONS.includes(d.intention))
    throw new Error("Intention inconnue.");
  if (d.region && !isValidRegion(d.region)) throw new Error("Région invalide.");
  if (
    d.frameTime !== undefined &&
    (!finite(d.frameTime) ||
      d.frameTime < d.startTime ||
      d.frameTime > (d.endTime ?? d.startTime))
  )
    throw new Error("Frame hors de la sélection.");
  if (
    d.volume !== undefined &&
    (!finite(d.volume) || d.volume < 0 || d.volume > 1)
  )
    throw new Error("Volume invalide.");
  if (d.drawings !== undefined) {
    if (
      !Array.isArray(d.drawings) ||
      d.drawings.length > 200 ||
      (d.drawings.length && v.kind === "audio")
    )
      throw new Error("Tracés invalides.");
    for (const shape of d.drawings) {
      if (!shape || !["rectangle", "arrow", "freehand"].includes(shape.type))
        throw new Error("Type de tracé inconnu.");
      if (shape.type === "rectangle" && !isValidRegion(shape))
        throw new Error("Rectangle invalide.");
      if (shape.type === "arrow" && (!point(shape.from) || !point(shape.to)))
        throw new Error("Flèche invalide.");
      if (
        shape.type === "freehand" &&
        (!Array.isArray(shape.points) ||
          shape.points.length < 2 ||
          shape.points.length > 10000 ||
          !shape.points.every(point))
      )
        throw new Error("Dessin invalide.");
    }
  }
  if (!d.prompt.trim() && !d.intention && !d.drawings?.length && !d.destination)
    throw new Error("Ajoutez une indication ou un dessin.");
  if (d.destination) {
    const target = videos.find((v) => v.id === d.destination!.videoId);
    if (
      !target ||
      target.kind === "audio" ||
      !finite(d.destination.time) ||
      d.destination.time < 0 ||
      d.destination.time > target.duration ||
      d.endTime === undefined
    )
      throw new Error("Destination invalide.");
  }
  if (d.mediaReference) {
    const target = videos.find((v) => v.id === d.mediaReference!.videoId);
    if (
      !target ||
      target.kind === "audio" ||
      !finite(d.mediaReference.time) ||
      d.mediaReference.time < 0 ||
      d.mediaReference.time > target.duration
    )
      throw new Error("Référence vidéo invalide.");
  }
}
export function describeAnnotation(
  a: DraftAnnotation,
  videos: VideoAsset[],
): string {
  const name = (id: string) => videos.find((v) => v.id === id)?.name ?? id;
  const source = videos.find((v) => v.id === a.videoId)?.source;
  return (
    `${name(a.videoId)} [${a.videoId}] · ${a.startTime.toFixed(3)} s${a.endTime !== undefined ? ` → ${a.endTime.toFixed(3)} s` : ""}.` +
    (source
      ? ` Source éditable : ${source.path} (${source.engine}); rendu revu : ${source.renderPath}.`
      : " Source éditable non renseignée : la vérifier avant traitement.") +
    (a.drawings?.length
      ? ` ${a.drawings.length} tracé(s), coordonnées normalisées, frame ${(a.frameTime ?? a.startTime).toFixed(3)} s ; positions fixes pendant la plage.`
      : "") +
    (a.destination
      ? ` Insérer ce passage dans ${name(a.destination.videoId)} [${a.destination.videoId}] à ${a.destination.time.toFixed(3)} s.`
      : "") +
    (a.mediaReference
      ? ` Référence vidéo : ${name(a.mediaReference.videoId)} [${a.mediaReference.videoId}] à ${a.mediaReference.time.toFixed(3)} s.`
      : "") +
    (a.volume !== undefined
      ? ` Volume souhaité : ${Math.round(a.volume * 100)} %.`
      : "") +
    (a.channel
      ? ` Cible : ${a.channel === "audio" ? "bande sonore" : "image"}.`
      : "") +
    (a.scope === "media" ? " Portée : média entier." : "") +
    (a.action === "modify" ? " Action : modifier le contenu existant." : "") +
    (a.insertion
      ? ` Action : insérer une nouvelle scène ${a.insertion.position === "before" ? "avant" : a.insertion.position === "after" ? "après" : "à"} ${a.insertion.time.toFixed(3)} s${a.insertion.useAdjacentFrames ? ", avec les frames adjacentes comme références" : ""}.`
      : "") +
    (a.intention ? ` Intention : ${a.intention}.` : "") +
    (a.referenceImages?.length
      ? ` Captures jointes : ${a.referenceImages.map((image) => `${image.purpose} à ${image.time.toFixed(3)} s (${image.width} × ${image.height})`).join(", ")}.`
      : "") +
    (a.prompt ? ` Indication utilisateur : ${a.prompt}` : "")
  );
}
export function parseManifest(value: unknown): ProjectManifest {
  if (!value || typeof value !== "object")
    throw new Error("Manifest invalide.");
  const raw = structuredClone(value) as ProjectManifest;
  const version = (value as { version?: string }).version;
  if (version !== "1.0" && version !== "2.0" && version !== "2.1")
    throw new Error("Version de manifest non prise en charge.");
  if (
    !text(raw.id) ||
    !text(raw.name) ||
    !date(raw.createdAt) ||
    !date(raw.updatedAt) ||
    !Array.isArray(raw.videos) ||
    !Array.isArray(raw.annotations)
  )
    throw new Error("Projet invalide.");
  const ids = new Set<string>();
  for (const v of raw.videos) {
    if (
      v?.source &&
      (!["native", "hyperframes", "remotion", "manim", "other"].includes(
        v.source.engine,
      ) ||
        !text(v.source.path) ||
        !text(v.source.renderPath))
    )
      throw new Error("Source de production invalide.");
    if (
      !v ||
      !text(v.id) ||
      ids.has(v.id) ||
      !text(v.name) ||
      ![v.duration, v.width, v.height, v.size, v.lastModified].every(finite) ||
      v.duration <= 0 ||
      v.width < 0 ||
      v.height < 0 ||
      v.size < 0 ||
      !date(v.addedAt) ||
      typeof v.type !== "string"
    )
      throw new Error("Métadonnées du média invalides.");
    v.kind ??= "video";
    if (!["video", "audio"].includes(v.kind))
      throw new Error("Type de média invalide.");
    ids.add(v.id);
  }
  const annotationIds = new Set<string>();
  for (const a of raw.annotations) {
    if (!a || !text(a.id) || annotationIds.has(a.id))
      throw new Error("Identifiant d’annotation invalide.");
    if (version === "1.0" && a.region) {
      a.drawings = [{ type: "rectangle", ...a.region }];
      a.frameTime = a.startTime;
      delete a.region;
    }
    validateDraft(a, raw.videos);
    if (!date(a.createdAt) || !date(a.updatedAt))
      throw new Error("Dates d’annotation invalides.");
    a.context = describeAnnotation(a, raw.videos);
    annotationIds.add(a.id);
  }
  raw.brief = normalizeVideoBrief((raw as { brief?: unknown }).brief);
  validateVideoBrief(raw.brief);
  raw.version = "2.1";
  return raw;
}
export function serializeManifest(project: ProjectManifest): string {
  return JSON.stringify(parseManifest(project), null, 2);
}
export function annotationFromDraft(
  d: DraftAnnotation,
  id: string,
  createdAt: string,
  videos: VideoAsset[],
): Annotation {
  const a: Annotation = {
    id,
    videoId: d.videoId,
    startTime: d.startTime,
    prompt: d.prompt.trim(),
    createdAt,
    updatedAt: new Date().toISOString(),
  };
  for (const key of [
    "referenceImages",
    "scope",
    "action",
    "insertion",
    "assistance",
    "channel",
    "endTime",
    "intention",
    "drawings",
    "frameTime",
    "destination",
    "mediaReference",
    "volume",
  ] as const)
    if (d[key] !== undefined)
      Object.assign(a, { [key]: structuredClone(d[key]) });
  if (d.region && !d.drawings)
    a.drawings = [{ type: "rectangle", ...d.region }];
  a.context = describeAnnotation(a, videos);
  return a;
}
