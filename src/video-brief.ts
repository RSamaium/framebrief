import type { AiProvider, VideoBrief } from "./types";

const engines = [
  "hyperframes",
  "ffmpeg",
  "remotion",
  "manim",
  "other",
] as const;
const backgrounds = ["none", "greenscreen", "ffmpeg-chromakey"] as const;
const containers = ["mp4", "webm", "mov"] as const;

const clean = (value: unknown, max = 2000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
const unique = (values: unknown, max = 20) =>
  Array.isArray(values)
    ? [
        ...new Set(values.map((value) => clean(value, 80)).filter(Boolean)),
      ].slice(0, max)
    : [];

export function createVideoBrief(): VideoBrief {
  return {
    status: "draft",
    generalPrompt: "",
    style: "",
    compositionEngine: "hyperframes",
    nativeTools: ["ffmpeg", "ffprobe"],
    backgroundRemoval: "none",
    aiProviders: [],
    output: {
      container: "mp4",
      aspectRatio: "16:9",
      width: 1920,
      height: 1080,
      fps: 30,
      codec: "h264",
      captions: false,
      accessibilityNotes: "",
    },
    sourcesAndRights: "",
    validation:
      "Prévisualiser un court extrait avant les rendus coûteux, contrôler les frames annotées et l’audio, puis vérifier le fichier exporté.",
    outputPaths: [],
  };
}

function parseProvider(value: unknown): AiProvider | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const name = clean(raw.name, 80);
  if (!name || typeof raw.authorized !== "boolean") return undefined;
  const provider: AiProvider = { name, authorized: raw.authorized };
  const model = clean(raw.model, 160);
  if (model) provider.model = model;
  if (typeof raw.keyConfigured === "boolean")
    provider.keyConfigured = raw.keyConfigured;
  return provider;
}

export function normalizeVideoBrief(value: unknown): VideoBrief {
  const defaults = createVideoBrief();
  if (!value || typeof value !== "object") return defaults;
  const raw = value as Record<string, unknown>;
  const output =
    raw.output && typeof raw.output === "object"
      ? (raw.output as Record<string, unknown>)
      : {};
  const providers = Array.isArray(raw.aiProviders)
    ? raw.aiProviders
        .map(parseProvider)
        .filter((provider): provider is AiProvider => !!provider)
        .slice(0, 10)
    : [];
  const voiceProvider = parseProvider(raw.voiceProvider);
  return {
    status: raw.status === "ready" ? "ready" : "draft",
    generalPrompt: clean(raw.generalPrompt),
    style: clean(raw.style),
    compositionEngine: engines.includes(
      raw.compositionEngine as (typeof engines)[number],
    )
      ? (raw.compositionEngine as VideoBrief["compositionEngine"])
      : defaults.compositionEngine,
    nativeTools: unique(raw.nativeTools).length
      ? unique(raw.nativeTools)
      : defaults.nativeTools,
    backgroundRemoval: backgrounds.includes(
      raw.backgroundRemoval as (typeof backgrounds)[number],
    )
      ? (raw.backgroundRemoval as VideoBrief["backgroundRemoval"])
      : defaults.backgroundRemoval,
    aiProviders: providers,
    ...(voiceProvider ? { voiceProvider } : {}),
    output: {
      container: containers.includes(
        output.container as (typeof containers)[number],
      )
        ? (output.container as VideoBrief["output"]["container"])
        : defaults.output.container,
      aspectRatio: clean(output.aspectRatio, 30) || defaults.output.aspectRatio,
      width: finite(output.width, 16, 8192)
        ? Math.round(output.width)
        : defaults.output.width,
      height: finite(output.height, 16, 8192)
        ? Math.round(output.height)
        : defaults.output.height,
      fps: finite(output.fps, 1, 120) ? output.fps : defaults.output.fps,
      codec: clean(output.codec, 60) || defaults.output.codec,
      ...(finite(output.durationSeconds, 0.1, 14400)
        ? { durationSeconds: output.durationSeconds }
        : {}),
      ...(finite(output.loudnessLufs, -70, 0)
        ? { loudnessLufs: output.loudnessLufs }
        : {}),
      captions: output.captions === true,
      ...(clean(output.language, 40)
        ? { language: clean(output.language, 40) }
        : {}),
      accessibilityNotes: clean(output.accessibilityNotes),
    },
    sourcesAndRights: clean(raw.sourcesAndRights),
    validation: clean(raw.validation) || defaults.validation,
    outputPaths: unique(raw.outputPaths, 50),
  };
}

export function validateVideoBrief(
  value: unknown,
): asserts value is VideoBrief {
  if (!value || typeof value !== "object")
    throw new Error("Brief vidéo invalide.");
  const raw = value as Record<string, unknown>;
  if (
    !["draft", "ready"].includes(raw.status as string) ||
    typeof raw.generalPrompt !== "string" ||
    typeof raw.style !== "string" ||
    !engines.includes(raw.compositionEngine as (typeof engines)[number]) ||
    !Array.isArray(raw.nativeTools) ||
    !backgrounds.includes(
      raw.backgroundRemoval as (typeof backgrounds)[number],
    ) ||
    !Array.isArray(raw.aiProviders) ||
    raw.aiProviders.some((provider) => !parseProvider(provider)) ||
    !raw.output ||
    typeof raw.output !== "object" ||
    !containers.includes(
      (raw.output as Record<string, unknown>)
        .container as (typeof containers)[number],
    ) ||
    !Array.isArray(raw.outputPaths) ||
    typeof raw.sourcesAndRights !== "string" ||
    typeof raw.validation !== "string"
  )
    throw new Error("Brief vidéo invalide.");
  if (raw.voiceProvider !== undefined && !parseProvider(raw.voiceProvider))
    throw new Error("Provider vocal invalide.");
}

const value = (text: string) => text || "À préciser avec Codex";
const providerLine = (provider: AiProvider) =>
  `${provider.name}${provider.model ? ` (${provider.model})` : ""} — ${provider.authorized ? "autorisé" : "non autorisé"}${provider.keyConfigured === undefined ? "" : provider.keyConfigured ? ", clé configurée" : ", clé absente"}`;

export function renderVideoMd(projectName: string, brief: VideoBrief): string {
  const providerList = brief.aiProviders.length
    ? brief.aiProviders
        .map(providerLine)
        .map((item) => `- ${item}`)
        .join("\n")
    : "- Aucun provider IA autorisé pour le moment.";
  return `# ${projectName}\n\n## Intention générale\n\n${value(brief.generalPrompt)}\n\n## Direction créative\n\n${value(brief.style)}\n\n## Pipeline autorisé\n\n- Moteur de composition : ${brief.compositionEngine}\n- Outils natifs : ${brief.nativeTools.join(", ")}\n- Détourage : ${brief.backgroundRemoval}\n- Providers IA :\n${providerList}\n- Voix / transcription : ${brief.voiceProvider ? providerLine(brief.voiceProvider) : "aucun service configuré"}\n\n## Sortie et qualité\n\n- Sortie : ${brief.output.container}, ${brief.output.width}×${brief.output.height}, ${brief.output.aspectRatio}, ${brief.output.fps} fps, ${brief.output.codec}\n- Durée cible : ${brief.output.durationSeconds ? `${brief.output.durationSeconds} s` : "à préciser"}\n- Loudness cible : ${brief.output.loudnessLufs !== undefined ? `${brief.output.loudnessLufs} LUFS` : "à préciser"}\n- Captions : ${brief.output.captions ? "oui" : "non"}\n- Langue : ${brief.output.language ?? "à préciser"}\n- Accessibilité : ${value(brief.output.accessibilityNotes)}\n\n## Sources et droits\n\n${value(brief.sourcesAndRights)}\n\n## Validation\n\n${brief.validation}\n\n## Sorties de production\n\n${brief.outputPaths.length ? brief.outputPaths.map((path) => `- ${path}`).join("\n") : "- Aucun rendu validé."}\n`;
}
