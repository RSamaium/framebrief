export const INTENTIONS = [
  "Transition",
  "Zoom",
  "Texte",
  "Supprimer",
  "Remplacer",
  "Ralentir",
  "Accélérer",
  "Recadrer",
  "Améliorer",
  "Suivre",
  "Modifier",
] as const;

export type Intention = (typeof INTENTIONS)[number];

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VideoAsset {
  kind?: "video" | "audio";
  id: string;
  name: string;
  type: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  lastModified: number;
  addedAt: string;
}

export interface Annotation {
  channel?: "audio" | "video";
  referenceImages?: ReferenceImage[];
  assistance?: "continue-video";
  id: string;
  videoId: string;
  startTime: number;
  endTime?: number;
  region?: Region;
  intention?: Intention;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  drawings?: Drawing[];
  frameTime?: number;
  destination?: { videoId: string; time: number };
  volume?: number;
  context?: string;
}

export interface Point {
  x: number;
  y: number;
}
export type Drawing =
  | { type: "rectangle"; x: number; y: number; width: number; height: number }
  | { type: "arrow"; from: Point; to: Point }
  | { type: "freehand"; points: Point[] };

export interface ProjectManifest {
  version: "2.1";
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  videos: VideoAsset[];
  annotations: Annotation[];
  brief: VideoBrief;
}

export type CompositionEngine =
  "hyperframes" | "ffmpeg" | "remotion" | "manim" | "other";

export interface AiProvider {
  name: string;
  model?: string;
  authorized: boolean;
  keyConfigured?: boolean;
}

export interface VideoBrief {
  status: "draft" | "ready";
  generalPrompt: string;
  style: string;
  compositionEngine: CompositionEngine;
  nativeTools: string[];
  backgroundRemoval: "none" | "greenscreen" | "ffmpeg-chromakey";
  aiProviders: AiProvider[];
  voiceProvider?: AiProvider;
  output: {
    container: "mp4" | "webm" | "mov";
    aspectRatio: string;
    width: number;
    height: number;
    fps: number;
    codec: string;
    durationSeconds?: number;
    loudnessLufs?: number;
    captions: boolean;
    language?: string;
    accessibilityNotes: string;
  };
  sourcesAndRights: string;
  validation: string;
  outputPaths: string[];
}

export interface DraftAnnotation {
  channel?: "audio" | "video";
  referenceImages?: ReferenceImage[];
  assistance?: "continue-video";
  drawings?: Drawing[];
  frameTime?: number;
  destination?: { videoId: string; time: number };
  volume?: number;
  id?: string;
  videoId: string;
  startTime: number;
  endTime?: number;
  region?: Region;
  intention?: Intention;
  prompt: string;
}

export interface RuntimeMedia {
  waveform?: number[];
  file: File;
  url: string;
  thumbnails: string[];
}

export interface ReferenceImage {
  purpose: "annotation" | "continuation";
  time: number;
  width: number;
  height: number;
  dataUrl: string;
}
