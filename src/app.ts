import { parseManifest, serializeManifest, validateDraft } from "./manifest";
import { inspectMedia, matchAsset } from "./media";
import { createProject, ProjectStore } from "./store";
import type {
  DraftAnnotation,
  Drawing,
  Point,
  RuntimeMedia,
  VideoAsset,
} from "./types";
import { clamp, formatTime } from "./utils";
import { drawingSvg, paintDrawing } from "./drawings";
import { installWebMcp } from "./webmcp";
import { renderVideoMd } from "./video-brief";
import { restoreMedia, saveMedia } from "./media-cache";
import { promptGroups } from "./prompt-aids";
import { language, tr } from "./i18n";
import type { WorkspaceState } from "./workspace-client";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
type Mode = "select" | "rectangle" | "arrow" | "freehand";
export class FramebriefApp {
  readonly store: ProjectStore;
  private media = new Map<string, RuntimeMedia>();
  private active?: string;
  private time = 0;
  private scale = 70;
  private viewStart = 0;
  private playbackRate = 1;
  private draft?: DraftAnnotation;
  private mode: Mode = "select";
  private draftPast: DraftAnnotation[] = [];
  private draftFuture: DraftAnnotation[] = [];
  private anchor = { x: 600, y: 550 };
  private importing = false;
  private saving = false;
  private timelineMode: "select" | "pan" = "select";
  private restoring = new Set<string>();
  private player: HTMLVideoElement;
  private svg: SVGSVGElement;
  private tracks: HTMLElement;
  private pop: HTMLElement;
  private palette: HTMLDialogElement;
  private selectedDrawing?: number;
  private manualLayout = false;
  private workspaceVersions: Record<string, string> = {};
  private workspaceMode = false;
  private loadingWorkspace = false;
  canReloadWorkspace(): boolean {
    return (
      !this.loadingWorkspace && !this.draft && !this.saving && !this.importing
    );
  }
  reportWorkspace(message: string): void {
    this.toast(message);
  }
  async loadWorkspace(state: WorkspaceState): Promise<void> {
    this.loadingWorkspace = true;
    try {
      this.workspaceMode = true;
      const active = this.active;
      this.player.pause();
      this.cancel();
      for (const [id, runtime] of this.media) {
        if (
          !state.project.videos.some((v) => v.id === id) ||
          this.workspaceVersions[id] !== state.mediaVersions[id]
        ) {
          URL.revokeObjectURL(runtime.url);
          this.media.delete(id);
        }
      }
      this.store.loadCheckpoint(state.project);
      this.workspaceVersions = state.mediaVersions;
      this.activate(
        state.project.videos.some((v) => v.id === active)
          ? active
          : state.project.videos[0]?.id,
      );
      for (const asset of state.project.videos) {
        if (
          !asset.source ||
          this.media.has(asset.id) ||
          state.mediaVersions[asset.id] === "missing"
        )
          continue;
        try {
          const res = await fetch(
            `/api/workspace/media?id=${encodeURIComponent(asset.id)}&revision=${encodeURIComponent(state.mediaVersions[asset.id] ?? "")}`,
            { cache: "no-store" },
          );
          if (!res.ok) throw new Error(`Rendu introuvable : ${asset.name}`);
          const file = new File([await res.blob()], asset.name, {
            type: asset.type,
          });
          const inspected = await inspectMedia(file);
          if (!this.store.project.videos.some((v) => v.id === asset.id)) {
            URL.revokeObjectURL(inspected.runtime.url);
            continue;
          }
          this.media.set(asset.id, inspected.runtime);
          if (this.active === asset.id) this.activate(asset.id);
          else this.renderTracks();
        } catch (error) {
          this.toast(error instanceof Error ? error.message : `Le navigateur ne peut pas lire ${asset.name}.`);
        }
      }
    } finally {
      this.loadingWorkspace = false;
      this.activate(this.active);
    }
  }
  constructor(
    private root: HTMLElement,
    store = ProjectStore.restore(),
  ) {
    this.store = store;
    const drawingLabels = [
      tr("Select (V)", "Sélection (V)"),
      tr("Rectangle (R)", "Rectangle (R)"),
      tr("Arrow (A)", "Flèche (A)"),
      tr("Draw (D)", "Crayon (D)"),
    ];
    root.innerHTML = `<main class="studio">
      <button class="command-toggle" title="${tr("Commands", "Commandes")} · Ctrl/Cmd+K" aria-label="${tr("Commands", "Commandes")}">⌘</button>
      <section class="scene"><div class="empty"><span class="drop-glyph">↓</span><p>${tr("Drop a video or audio file", "Déposez une vidéo ou un son")}</p><button data-cmd="import">${tr("or choose files", "ou choisir des fichiers")}</button></div>
        <div class="image-stage" hidden><video playsinline preload="auto"></video><svg viewBox="0 0 1000 1000" preserveAspectRatio="none" class="drawing-layer"></svg></div>
        <div class="audio-stage" hidden><span>♫</span><p></p><svg viewBox="0 0 720 100" preserveAspectRatio="none"></svg></div>
        <div class="offline-note" hidden>${tr("File needs reconnecting", "Fichier à réassocier")} <button data-cmd="import">${tr("Choose file", "Choisir le fichier")}</button></div>
        <div class="draw-tools" hidden>${(["select", "rectangle", "arrow", "freehand"] as Mode[]).map((m, i) => `<button data-mode="${m}" aria-label="${drawingLabels[i]}">${["↖", "▢", "↗", "〰"][i]}</button>`).join("")}<i></i><button data-cmd="undo" title="${tr("Undo", "Annuler")}">↶</button><button data-cmd="redo" title="${tr("Redo", "Rétablir")}">↷</button></div>
      </section>
      <div class="splitter" role="separator" aria-label="${tr("Resize preview", "Redimensionner l’aperçu")}" tabindex="0"></div>
      <section class="timeline-area"><div class="timeline-top"><span class="active-name"></span><div class="transport"><button data-cmd="play" title="${tr("Play · Space", "Lecture · Espace")}" aria-label="${tr("Play", "Lecture")}">▶</button><span class="timecode"></span></div><div class="timeline-actions"><button data-cmd="zoom-out" title="${tr("Zoom out", "Dézoomer")}">−</button><button data-cmd="zoom-in" title="${tr("Zoom in", "Zoomer")}">+</button><button data-cmd="help" title="${tr("Keyboard shortcuts", "Raccourcis")}">?</button></div></div><div class="tracks"></div><div class="center-line"></div></section>
      <section class="popover" hidden aria-label="Annotation"></section><dialog class="palette"></dialog>
      <input class="files" type="file" accept="video/*,audio/*" multiple hidden><input class="json" type="file" accept=".json" hidden>
      <div class="drop-overlay" hidden>${tr("Drop to add to the project", "Déposez pour ajouter au projet")}</div><div class="toast" role="status" hidden></div><div class="drag-ghost" hidden></div>
    </main>`;
    this.player = root.querySelector("video")!;
    this.svg = root.querySelector(".drawing-layer")!;
    this.tracks = root.querySelector(".tracks")!;
    this.pop = root.querySelector(".popover")!;
    this.palette = root.querySelector("dialog")!;
    const finish = document.createElement("button");
    finish.dataset.cmd = "finish-drawing";
    finish.className = "finish-drawing";
    finish.textContent = tr("Finish drawings →", "Terminer les dessins →");
    finish.hidden = true;
    root.querySelector(".draw-tools")!.append(finish);
    let lastTrackStep = 0;
    this.tracks.addEventListener("wheel", (event) => {
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || this.store.project.videos.length < 2) return;
      event.preventDefault();
      if (this.draft || Math.abs(event.deltaY) < 4 || Date.now() - lastTrackStep < 420) return;
      const videos = this.store.project.videos;
      const index = videos.findIndex(v => v.id === this.active);
      const next = videos[clamp(index + Math.sign(event.deltaY), 0, videos.length - 1)];
      if (next.id === this.active) return;
      lastTrackStep = Date.now();
      this.activate(next.id);
    }, { passive: false });
    const footer = document.createElement("footer");
    footer.className = "playback-bar";
    footer.append(root.querySelector(".transport")!);
    footer
      .querySelector(".transport")!
      .insertAdjacentHTML(
        "afterbegin",
      `<button data-cmd="rewind" aria-label="${tr("Back 5 seconds", "Reculer de 5 secondes")}" title="${tr("Back 5 seconds", "Reculer de 5 secondes")}">↶</button>`,
      );
    footer
      .querySelector(".transport")!
      .insertAdjacentHTML(
        "beforeend",
      `<button data-cmd="forward" aria-label="${tr("Forward 5 seconds", "Avancer de 5 secondes")}" title="${tr("Forward 5 seconds", "Avancer de 5 secondes")}">↷</button>`,
      );
    footer.insertAdjacentHTML(
      "beforeend",
      `<input class="playback-progress" type="range" min="0" max="1" step="0.01" value="0" aria-label="${tr("Playback position", "Position de lecture")}"><span class="total-time"></span>`,
    );
    footer.querySelector<HTMLInputElement>(".playback-progress")!.oninput = (
      e,
    ) => {
      this.player.pause();
      this.seek(Number((e.target as HTMLInputElement).value));
    };
    footer.insertAdjacentHTML(
      "beforeend",
      `<label class="speed-control"><select aria-label="${tr("Playback speed", "Vitesse de lecture")}" title="${tr("Playback speed", "Vitesse de lecture")}">${[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => `<option value="${rate}" ${rate === 1 ? "selected" : ""}>${rate}×</option>`).join("")}</select></label>`,
    );
    root.querySelector(".studio")!.append(footer);
    footer.querySelector("select")!.onchange = (e) => {
      this.playbackRate = Number((e.target as HTMLSelectElement).value);
      this.player.playbackRate = this.playbackRate;
    };
    const cursor = root.querySelector<HTMLElement>(".center-line")!;
    cursor.innerHTML =
      `<button class="playhead-handle" aria-label="${tr("Move playhead", "Déplacer le curseur de lecture")}" title="${tr("Drag to move the playhead", "Glisser pour déplacer le curseur")}"></button>`;
    cursor.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !this.asset()) return;
      e.preventDefault();
      this.player.pause();
      cursor.setPointerCapture(e.pointerId);
      const lane = this.tracks.querySelector(".lane")!.getBoundingClientRect();
      const start = this.viewStart;
      const move = (ev: PointerEvent) =>
        this.seek(start + (ev.clientX - lane.left - 16) / this.scale);
      const stop = () => {
        cursor.removeEventListener("pointermove", move);
        cursor.removeEventListener("pointerup", stop);
        cursor.removeEventListener("pointercancel", stop);
      };
      cursor.addEventListener("pointermove", move);
      cursor.addEventListener("pointerup", stop);
      cursor.addEventListener("pointercancel", stop);
    });
    root.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-cmd]");
      if (b) this.command(b.dataset.cmd!);
      const mode = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-mode]",
      );
      if (mode) this.setMode(mode.dataset.mode as Mode);
    });
    root
      .querySelector(".command-toggle")!
      .addEventListener("click", () => this.commands());
    root.querySelector<HTMLInputElement>(".files")!.onchange = (e) =>
      void this.importFiles(
        Array.from((e.target as HTMLInputElement).files ?? []),
      );
    root.querySelector<HTMLInputElement>(".json")!.onchange = async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f)
        try {
          const p = parseManifest(JSON.parse(await f.text()));
          this.cancel();
          this.player.pause();
          this.store.replace(p);
          this.activate(p.videos[0]?.id);
        } catch (err) {
          this.error(err);
        }
    };
    this.player.addEventListener("timeupdate", () => {
      if (!this.player.paused) {
        this.time = this.player.currentTime;
        this.paintTime();
        this.paintDrawings();
      }
    });
    for (const event of ["play", "pause", "ended"])
      this.player.addEventListener(event, () => this.paintTime());
    this.player.addEventListener("loadedmetadata", () => {
      this.player.playbackRate = this.playbackRate;
      this.player.currentTime = Math.min(this.time, this.player.duration);
      this.fitStage();
    });
    new ResizeObserver(() => {
      this.fitStage();
      this.paintTime();
      this.positionPopover();
    }).observe(root.querySelector(".scene")!);
    this.bindDrop();
    this.bindDrawing();
    this.bindSplitter();
    document.addEventListener("keydown", (e) => this.keyboard(e));
    this.store.addEventListener("change", () => {
      this.renderTracks();
      this.paintDrawings();
      if (this.store.storageError) this.toast(this.store.storageError);
      void this.restoreSavedMedia();
    });
    this.renderTracks();
    this.activate(store.project.videos[0]?.id);
    try {
      installWebMcp({
        getProject: () => parseManifest(this.store.project),
        saveAnnotation: (d) => this.saveWithImages(d),
        updateBrief: (brief) => this.store.updateBrief(brief),
        setMediaSource: (id, source) => this.store.setMediaSource(id, source),
        captureFrame: (input) => this.captureFrame(input),
      });
    } catch (error) {
      console.warn("WebMCP indisponible", error);
    }
    if (store.storageError) this.toast(store.storageError);
    void this.restoreSavedMedia();
  }
  private async restoreSavedMedia(): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    await Promise.all(
      this.store.project.videos.map(async (asset) => {
        if (asset.source) return;
        if (this.media.has(asset.id) || this.restoring.has(asset.id)) return;
        this.restoring.add(asset.id);
        try {
          const runtime = await restoreMedia(asset);
          if (!runtime) return;
          if (
            !this.store.project.videos.some((v) => v.id === asset.id) ||
            this.media.has(asset.id)
          ) {
            URL.revokeObjectURL(runtime.url);
            return;
          }
          this.media.set(asset.id, runtime);
          if (this.active === asset.id) this.activate(asset.id);
          else this.renderTracks();
        } catch {
          this.toast(
            "Le stockage des médias est indisponible. Vous pouvez toujours les ouvrir manuellement.",
          );
        } finally {
          this.restoring.delete(asset.id);
        }
      }),
    );
  }
  private asset(): VideoAsset | undefined {
    return this.store.project.videos.find((v) => v.id === this.active);
  }
  private activate(id?: string): void {
    const changed = this.active !== id;
    if (this.active !== id) this.player.pause();
    this.active = id;
    const v = this.asset(),
      runtime = id && this.media.get(id);
    this.time = clamp(this.time, 0, v?.duration ?? 0);
    if (runtime && this.player.getAttribute("src") !== runtime.url)
      this.player.src = runtime.url;
    if (!runtime) {
      this.player.removeAttribute("src");
      this.player.load();
    }
    this.root.querySelector<HTMLElement>(".empty")!.hidden = !!v;
    this.root.querySelector<HTMLElement>(".image-stage")!.hidden =
      !v || v.kind === "audio" || !runtime;
    this.root.querySelector<HTMLElement>(".audio-stage")!.hidden =
      !v || v.kind !== "audio" || !runtime;
    const loading = !!v?.source && this.loadingWorkspace && !runtime;
    const offlineNote = this.root.querySelector<HTMLElement>(".offline-note")!;
    offlineNote.hidden = !v || !!runtime;
    offlineNote.firstChild!.textContent = loading
      ? tr("Loading video… ", "Chargement de la vidéo… ")
      : tr("File needs reconnecting ", "Fichier à réassocier ");
    offlineNote.querySelector("button")!.hidden = loading;
    this.root.querySelector<HTMLElement>(".draw-tools")!.hidden =
      !v || v.kind === "audio" || !runtime;
    this.root.querySelector(".active-name")!.textContent = v?.name ?? "";
    this.root.querySelector(".audio-stage p")!.textContent = v?.name ?? "";
    this.root.querySelector(".audio-stage svg")!.innerHTML = runtime
      ? this.waveform(runtime.waveform ?? [], 720)
      : "";
    this.renderTracks();
    if (changed && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      this.tracks.querySelector<HTMLElement>(".track.active")?.animate?.(
        [{ opacity: 0, transform: "translateY(8px) scale(.985)" }, { opacity: 1, transform: "translateY(0) scale(1)" }],
        { duration: 240, easing: "cubic-bezier(.16,1,.3,1)" },
      );
    }
    this.fitStage();
    this.seek(this.time);
    this.setMode("select");
  }
  private fitStage(): void {
    const v = this.asset();
    if (!v || v.kind === "audio") return;
    const scene = this.root.querySelector<HTMLElement>(".scene")!,
      stage = this.root.querySelector<HTMLElement>(".image-stage")!;
    const ratio = v.width / Math.max(v.height, 1),
      width = Math.min(
        scene.clientWidth - 100,
        (scene.clientHeight - 100) * ratio,
      );
    stage.style.width = `${Math.max(0, width)}px`;
    stage.style.height = `${Math.max(0, width / ratio)}px`;
  }
  private waveform(peaks: number[], width: number): string {
    return peaks
      .map(
        (p, i) =>
          `<line x1="${(i / peaks.length) * width}" x2="${(i / peaks.length) * width}" y1="${50 - p * 44}" y2="${50 + p * 44}"/>`,
      )
      .join("");
  }
  private renderTracks(): void {
    if (!this.manualLayout)
      this.root.style.setProperty(
        "--scene-height",
        `max(180px, calc(100dvh - 380px))`,
      );
    const scroll = this.tracks.scrollTop;
    this.tracks.innerHTML = this.store.project.videos
      .map((v, i) => {
        const runtime = this.media.get(v.id),
          width = v.duration * this.scale;
        const images = runtime?.thumbnails ?? [];
        return `<article class="track ${v.id === this.active ? "active" : ""}" data-video="${esc(v.id)}"><button class="track-label" title="${esc(v.name)}"><span>${String(i + 1).padStart(2, "0")}</span>${esc(v.name)}<small>${formatTime(v.duration)}${runtime ? "" : ` · ${v.source && this.loadingWorkspace ? tr("loading…", "chargement…") : tr("reconnect", "à réassocier")}`}</small></button><div class="lane"><div class="rail" style="width:${width}px"><div class="nav-band" title="${tr("Drag to navigate", "Glisser pour naviguer")}">${Array.from({ length: Math.min(100, Math.floor(v.duration / 5) + 1) }, (_, i) => `<span style="left:${i * 5 * this.scale}px">${formatTime(i * 5)}</span>`).join("")}</div><div class="frames" data-frames>${v.kind === "audio" ? `<svg class="waveform" viewBox="0 0 ${width} 100" preserveAspectRatio="none">${this.waveform(runtime?.waveform ?? [], width)}</svg>` : images.length ? images.map((src) => `<img src="${src}" draggable="false" alt=""/>`).join("") : '<div class="missing-frames"></div>'}</div><div class="markers"></div></div></div></article>`;
      })
      .join("");
    this.tracks.scrollTop = scroll;
    this.root.querySelectorAll(".track-step").forEach(el => el.remove());
    const activeIndex = this.store.project.videos.findIndex(v => v.id === this.active);
    for (const step of [-1, 1]) {
      const target = this.store.project.videos[activeIndex + step];
      if (!target || activeIndex < 0) continue;
      const button = document.createElement("button");
      button.className = `track-step ${step < 0 ? "previous" : "next"}`;
      button.innerHTML = `<svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true"><path d="${step < 0 ? "M3 8 8 3 13 8" : "M3 4 8 9 13 4"}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      button.title = `${step < 0 ? tr("Previous track", "Piste précédente") : tr("Next track", "Piste suivante")} : ${target.name}`;
      button.setAttribute("aria-label", button.title);
      button.onclick = () => { this.cancel(); this.activate(target.id); };
      this.tracks.before(button);
    }
    this.tracks.querySelectorAll<HTMLElement>(".track").forEach((track) => {
      const id = track.dataset.video!,
        v = this.store.project.videos.find((v) => v.id === id)!;
      const remove = document.createElement("button");
      remove.className = "remove-track";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `${tr("Remove track", "Retirer la piste")} ${v.name}`);
      remove.title = tr("Remove this track · can be undone", "Retirer cette piste · annulation possible");
      remove.onclick = () => {
        this.cancel();
        this.store.removeVideo(id);
        if (this.active === id) this.activate(this.store.project.videos[0]?.id);
        this.toast(tr("Track removed · Ctrl/Cmd+Z to undo", "Piste retirée · Ctrl/Cmd+Z pour annuler"));
      };
      track.append(remove);
      const index = document.createElement("div");
      index.className = "annotation-index";
      index.setAttribute("aria-label", `${tr("Annotations for", "Annotations de")} ${v.name}`);
      track.append(index);
      this.addTrackScrollbar(track, v);
      const edges = document.createElement("div");
      edges.className = "edge-actions";
      for (const end of [false, true]) {
        const edit = document.createElement("button");
        edit.className = end ? "edit-end" : "edit-start";
        edit.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/></svg>';
        edit.title = end ? tr("Annotate the end or imagine what follows", "Annoter la fin ou imaginer la suite") : tr("Annotate the beginning or whole video", "Annoter le début ou toute la vidéo");
        edit.setAttribute("aria-label", edit.title);
        edit.onpointerdown = (e) => e.stopPropagation();
        edit.onclick = (e) => {
          this.cancel();
          this.activate(id);
          this.seek(end ? v.duration : 0);
          this.draft = { videoId: id, startTime: end ? v.duration : 0, frameTime: end ? v.duration : 0, prompt: "", drawings: [] };
          this.anchor = { x: e.clientX, y: e.clientY };
          this.showPopover();
          this.paintMarkers();
        };
        edges.append(edit);
      }
      const shell = document.createElement("div");
      shell.className = `lane-shell ${v.kind !== "audio" ? "has-audio" : ""}`;
      const trackLane = track.querySelector(".lane")!;
      trackLane.before(shell);
      shell.append(trackLane, edges);
      track
        .querySelector(".track-label")!
        .addEventListener("click", (event) => {
          const lane = track.querySelector<HTMLElement>(".lane")!;
          const targetTime =
            this.viewStart +
            ((event as MouseEvent).clientX -
              lane.getBoundingClientRect().left -
              16) /
              this.scale;
          this.cancel();
          this.activate(id);
          if ((event as MouseEvent).detail) this.seek(targetTime);
        });
      const lane = track.querySelector<HTMLElement>(".lane")!;
      if (v.kind !== "audio") {
        const audio = document.createElement("div");
        audio.className = "embedded-audio";
        audio.title = tr("Video audio · click or drag to annotate", "Son de la vidéo · cliquer ou glisser pour annoter");
        const peaks = this.media.get(id)?.waveform;
        audio.innerHTML = `<svg class="waveform" viewBox="0 0 ${v.duration * this.scale} 100" preserveAspectRatio="none">${this.waveform(peaks ?? [], v.duration * this.scale)}</svg>${!peaks?.length ? `<span>${tr("Audio unavailable", "Son non disponible")}</span>` : ""}`;
        lane.querySelector(".rail")!.append(audio);
        lane.classList.add("with-audio");
      }
      lane.addEventListener("pointerdown", (e) =>
        this.timelineGesture(e, id, lane),
      );
      lane.addEventListener(
        "wheel",
        (e) => {
          if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            e.preventDefault();
            if (this.active !== id) this.activate(id);
            this.viewStart = clamp(
              this.viewStart + (e.deltaX || e.deltaY) / this.scale,
              0,
              v.duration,
            );
            this.paintTime(false);
          }
        },
        { passive: false },
      );
    });
    this.paintTime();
    this.paintMarkers();
  }
  private timelineGesture(
    e: PointerEvent,
    id: string,
    lane: HTMLElement,
  ): void {
    if (
      e.button !== 0 ||
      (e.target as HTMLElement).closest(".marker,.range-handle")
    )
      return;
    const duration = this.store.project.videos.find(
      (v) => v.id === id,
    )!.duration;
    if (this.active !== id) {
      this.active = id;
      const r = this.media.get(id);
      this.player.pause();
      if (r) this.player.src = r.url;
    }
    const channel = (e.target as Element).closest(".embedded-audio")
      ? ("audio" as const)
      : undefined;
    const pan =
        (!channel && this.timelineMode === "pan") ||
        !!(e.target as HTMLElement).closest(".nav-band"),
      origin = e.clientX,
      base = this.viewStart;
    const at = (x: number) =>
      clamp(
        base + (x - lane.getBoundingClientRect().left - 16) / this.scale,
        0,
        duration,
      );
    const start = at(origin);
    let moved = false;
    this.player.pause();
    if (pan) {
      this.pop.hidden = true;
      this.tracks.classList.add("is-panning");
    }
    lane.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      moved ||= Math.abs(ev.clientX - origin) > 4;
      if (pan) {
        this.viewStart = clamp(
          base - (ev.clientX - origin) / this.scale,
          0,
          Math.max(0, duration - (lane.clientWidth - 32) / this.scale),
        );
        this.paintTime(false);
        return;
      }
      if (moved) {
        const end = at(ev.clientX);
        this.draft = {
          channel,
          videoId: id,
          startTime: Math.min(start, end),
          endTime: Math.max(start, end),
          prompt: "",
          drawings: [],
        };
        this.paintMarkers();
      }
    };
    const up = (ev: PointerEvent) => {
      lane.removeEventListener("pointermove", move);
      lane.removeEventListener("pointerup", up);
      lane.removeEventListener("pointercancel", cancel);
      if (pan) {
        this.tracks.classList.remove("is-panning");
        if (this.draft) this.showPopover();
        return;
      }
      const end = at(ev.clientX);
      this.activate(id);
      this.seek(Math.min(start, end));
      this.draft = {
        channel,
        videoId: id,
        startTime: Math.min(start, end),
        ...(moved && Math.abs(end - start) > 0.02
          ? { endTime: Math.max(start, end) }
          : {}),
        prompt: "",
        drawings: [],
        frameTime: Math.min(start, end),
      };
      this.anchor = { x: ev.clientX, y: ev.clientY };
      this.draftPast = [];
      this.draftFuture = [];
      this.showPopover();
      this.paintMarkers();
    };
    const cancel = () => {
      this.tracks.classList.remove("is-panning");
      lane.removeEventListener("pointermove", move);
      lane.removeEventListener("pointerup", up);
      this.cancel();
    };
    lane.addEventListener("pointermove", move);
    lane.addEventListener("pointerup", up);
    lane.addEventListener("pointercancel", cancel, { once: true });
  }
  private paintTime(follow = true): void {
    const duration = this.asset()?.duration ?? 0;
    const progress =
      this.root.querySelector<HTMLInputElement>(".playback-progress")!;
    progress.max = String(duration || 1);
    progress.value = String(this.time);
    progress.disabled = !duration;
    progress.style.setProperty(
      "--progress",
      `${duration ? (this.time / duration) * 100 : 0}%`,
    );
    this.root.querySelector(".total-time")!.textContent = formatTime(duration);
    const lane = this.tracks.querySelector(".lane")?.getBoundingClientRect();
    const cursor = this.root.querySelector<HTMLElement>(".center-line")!;
    if (lane && lane.width > 40) {
      const visible = (lane.width - 32) / this.scale;
      if (
        follow &&
        (this.time < this.viewStart || this.time > this.viewStart + visible)
      )
        this.viewStart = Math.max(0, this.time - visible * 0.2);
      const x = lane.left + 16 + (this.time - this.viewStart) * this.scale;
      cursor.style.left = `${x}px`;
      cursor.hidden = x < lane.left || x > lane.right;
    } else cursor.hidden = true;
    this.tracks
      .querySelectorAll<HTMLElement>(".rail")
      .forEach((r) => (r.style.left = `${16 - this.viewStart * this.scale}px`));
    this.paintScrollbars();
    this.root.querySelector(".timecode")!.textContent = formatTime(
      this.time,
      true,
    );
    this.root.querySelector('[data-cmd="play"]')!.textContent = this.player
      .paused
      ? "▶"
      : "Ⅱ";
  }
  private addTrackScrollbar(track: HTMLElement, asset: VideoAsset): void {
    const scroll = document.createElement("div");
    scroll.className = "track-scroll";
    scroll.innerHTML =
      `<button class="scroll-thumb" aria-label="${tr("Scroll track", "Faire défiler la piste")}" title="${tr("Drag to browse the video", "Glisser pour parcourir la vidéo")}"><span></span></button>`;
    track.querySelector(".annotation-index")!.before(scroll);
    scroll.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      scroll.setPointerCapture(e.pointerId);
      this.pop.hidden = true;
      const rect = scroll.getBoundingClientRect(),
        width = track.querySelector<HTMLElement>(".lane")!.clientWidth;
      const max = Math.max(0, asset.duration - (width - 32) / this.scale),
        thumb = scroll.querySelector<HTMLElement>(".scroll-thumb")!,
        travel = Math.max(1, rect.width - thumb.offsetWidth);
      if (e.target === scroll)
        this.viewStart = clamp(
          ((e.clientX - rect.left - thumb.offsetWidth / 2) / travel) * max,
          0,
          max,
        );
      const initial = this.viewStart,
        x = e.clientX;
      this.paintTime(false);
      const move = (ev: PointerEvent) => {
        this.viewStart = clamp(
          initial + ((ev.clientX - x) / travel) * max,
          0,
          max,
        );
        this.paintTime(false);
      };
      const end = () => {
        scroll.removeEventListener("pointermove", move);
        scroll.removeEventListener("pointerup", end);
        scroll.removeEventListener("pointercancel", end);
        if (this.draft) this.showPopover();
      };
      scroll.addEventListener("pointermove", move);
      scroll.addEventListener("pointerup", end);
      scroll.addEventListener("pointercancel", end);
    };
    scroll.querySelector("button")!.onkeydown = (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        const max = Math.max(
          0,
          asset.duration -
            (track.querySelector<HTMLElement>(".lane")!.clientWidth - 32) /
              this.scale,
        );
        this.viewStart = clamp(
          this.viewStart + (e.key === "ArrowLeft" ? -1 : 1) * 2,
          0,
          max,
        );
        this.paintTime(false);
      }
    };
  }
  private paintScrollbars(): void {
    this.tracks.querySelectorAll<HTMLElement>(".track").forEach((track) => {
      const asset = this.store.project.videos.find(
        (v) => v.id === track.dataset.video,
      )!;
      const scroll = track.querySelector<HTMLElement>(".track-scroll"),
        thumb = scroll?.querySelector<HTMLButtonElement>(".scroll-thumb");
      if (!scroll || !thumb) return;
      const visible = Math.max(
          0,
          (track.querySelector<HTMLElement>(".lane")!.clientWidth - 32) /
            this.scale,
        ),
        max = Math.max(0, asset.duration - visible);
      const width = Math.min(
        scroll.clientWidth,
        Math.max(38, (visible / asset.duration) * scroll.clientWidth),
      );
      thumb.style.width = `${width}px`;
      thumb.style.left = `${max ? clamp(this.viewStart / max, 0, 1) * (scroll.clientWidth - width) : 0}px`;
      thumb.disabled = max === 0;
      scroll.classList.toggle("no-scroll", max === 0);
    });
  }
  private seek(t: number): void {
    this.time = clamp(t, 0, this.asset()?.duration ?? 0);
    if (this.player.getAttribute("src") && this.player.readyState >= 1)
      this.player.currentTime = this.time;
    this.paintTime();
    this.paintDrawings();
  }
  private paintMarkers(): void {
    this.tracks.querySelectorAll<HTMLElement>(".track").forEach((track) => {
      const id = track.dataset.video!;
      const layer = track.querySelector(".markers")!;
      const index = track.querySelector<HTMLElement>(".annotation-index")!;
      const annotations = this.store.project.annotations
        .filter((a) => a.videoId === id || a.destination?.videoId === id)
        .sort(
          (a, b) =>
            (a.videoId === id ? a.startTime : a.destination!.time) -
            (b.videoId === id ? b.startTime : b.destination!.time),
        );
      index.innerHTML = annotations
        .map((a) => {
          const target = a.videoId !== id,
            time = target ? a.destination!.time : a.startTime;
          const label =
            a.prompt ||
            a.intention ||
            (a.drawings?.length
              ? `Dessin · ${a.drawings.length} tracé(s)`
              : "Annotation");
          return `<button class="annotation-chip ${this.draft?.id === a.id ? "selected" : ""}" data-id="${esc(a.id)}" title="${esc(label)}"><strong>${target ? "↙ " : ""}${formatTime(time, true)}${!target && a.endTime !== undefined ? ` – ${formatTime(a.endTime, true)}` : ""}</strong><span>${esc(label)}</span></button>`;
        })
        .join("");
      layer.innerHTML = this.store.project.annotations
        .flatMap((a) => {
          const source = a.videoId === id,
            target = a.destination?.videoId === id;
          const selected = this.draft?.id === a.id;
          return [
            source
              ? `<button class="marker ${selected ? "selected" : ""}" data-id="${esc(a.id)}" style="left:${a.startTime * this.scale}px;width:${Math.max(8, ((a.endTime ?? a.startTime) - a.startTime) * this.scale)}px" title="${esc(a.prompt || a.intention || "Dessin")}"><span>${a.destination ? "↗" : "•"}</span></button>`
              : "",
            target
              ? `<button class="marker destination ${selected ? "selected" : ""}" data-id="${esc(a.id)}" style="left:${a.destination!.time * this.scale}px" title="Passage lié : ${esc(a.prompt)}">↙</button>`
              : "",
          ];
        })
        .join("");
      if (this.draft?.videoId === id) {
        const d = this.draft;
        layer.innerHTML += `<div class="selection" style="left:${d.startTime * this.scale}px;width:${Math.max(3, ((d.endTime ?? d.startTime) - d.startTime) * this.scale)}px">${d.endTime !== undefined ? '<button class="range-handle" title="Déposer ce passage ailleurs">⠿</button>' : ""}</div>`;
      }
      if (this.draft?.destination?.videoId === id)
        layer.innerHTML += `<div class="target-marker" style="left:${this.draft.destination.time * this.scale}px">↙</div>`;
      track.querySelectorAll<HTMLElement>("[data-id]").forEach(
        (b) =>
          (b.onclick = (e) => {
            e.stopPropagation();
            const a = this.store.project.annotations.find(
              (a) => a.id === b.dataset.id,
            )!;
            this.activate(a.videoId);
            this.draft = structuredClone(a);
            this.seek(a.frameTime ?? a.startTime);
            this.anchor = { x: e.clientX, y: e.clientY };
            this.draftPast = [];
            this.draftFuture = [];
            this.showPopover();
            this.paintMarkers();
          }),
      );
      layer
        .querySelector<HTMLElement>(".range-handle")
        ?.addEventListener("pointerdown", (e) => this.movePassage(e));
    });
  }
  private movePassage(e: PointerEvent): void {
    e.stopPropagation();
    e.preventDefault();
    if (!this.draft?.endTime) return;
    const ghost = this.root.querySelector<HTMLElement>(".drag-ghost")!,
      source = structuredClone(this.draft);
    ghost.hidden = false;
    this.pop.hidden = true;
    let destination: DraftAnnotation["destination"];
    const move = (ev: PointerEvent) => {
      ghost.style.left = `${ev.clientX + 16}px`;
      ghost.style.top = `${ev.clientY - 40}px`;
      const track = document
          .elementFromPoint(ev.clientX, ev.clientY)
          ?.closest<HTMLElement>(".track"),
        v = this.store.project.videos.find(
          (v) => v.id === track?.dataset.video,
        );
      destination = undefined;
      if (track && v && v.kind !== "audio") {
        const lane = track.querySelector(".lane")!.getBoundingClientRect();
        destination = {
          videoId: v.id,
          time: clamp(
            this.viewStart + (ev.clientX - lane.left - 16) / this.scale,
            0,
            v.duration,
          ),
        };
      }
      const runtime = this.media.get(source.videoId);
      const asset = this.store.project.videos.find(
        (v) => v.id === source.videoId,
      )!;
      const thumbnails = runtime?.thumbnails ?? [];
      const thumbnail =
        thumbnails[
          Math.min(
            thumbnails.length - 1,
            Math.floor((source.startTime / asset.duration) * thumbnails.length),
          )
        ];
      ghost.innerHTML = `${thumbnail ? `<img src="${thumbnail}" alt="Passage source">` : "<b>♫</b>"}<span>${formatTime(source.startTime, true)} → ${formatTime(source.endTime!, true)}${destination ? ` · déposer à ${formatTime(destination.time, true)}` : " · choisissez une piste vidéo"}</span>`;
    };
    const up = (ev: PointerEvent) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", abort);
      ghost.hidden = true;
      if (destination && this.draft) {
        this.rememberDraft();
        this.draft.destination = destination;
        this.anchor = { x: ev.clientX, y: ev.clientY };
        this.paintMarkers();
      }
      this.showPopover();
    };
    const abort = () => {
      destination = undefined;
      up(e);
    };
    document.addEventListener("pointercancel", abort, { once: true });
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up, { once: true });
    move(e);
  }
  private showPopover(): void {
    if (!this.draft) return;
    this.root.querySelectorAll(".destination-picker").forEach(el => el.remove());
    const d = this.draft;
    const duration = this.store.project.videos.find(v => v.id === d.videoId)!.duration;
    const context = d.startTime === 0 ? "start" : d.startTime === duration ? "end" : "middle";
    const groups = promptGroups(language, context);
    this.pop.hidden = false;
    this.pop.innerHTML = `<div class="popover-head"><span>${formatTime(d.startTime, true)}${d.endTime !== undefined ? ` — ${formatTime(d.endTime, true)}` : ""}${d.drawings?.length ? ` · ${d.drawings.length} ${tr("drawing(s)", "tracé(s)")}` : ""}</span><button data-cmd="cancel" aria-label="${tr("Close", "Fermer")}">×</button></div>
      <div class="prompt-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${tr("Your instruction", "Votre intention")}" data-placeholder="${tr("Your idea… @ to mention a track", "Votre idée… @ pour mentionner une piste")}">${esc(d.prompt)}</div>
      <div class="prompt-groups">${groups.map((group, g) => `<section class="prompt-group"><h3><span>${group.icon}</span>${group.label}</h3><div class="suggestions">${group.items.map((item, i) => `<button data-aid="${g}:${i}">${item.label}</button>`).join("")}</div></section>`).join("")}</div>
      ${d.referenceImages?.[0] ? `<div class="reference-preview"><img src="${d.referenceImages[0].dataUrl}" alt="${tr("Reference frame attached to this instruction", "Capture jointe à cette instruction")}"><span>${tr("Frame attached", "Capture jointe")}</span></div>` : ""}
      <div class="popover-bottom"><button data-cmd="volume" title="${tr("Set volume", "Indiquer un volume")}">♫</button>${d.volume !== undefined ? `<label>${tr("Volume", "Volume")} <input aria-label="${tr("Desired volume", "Volume souhaité")}" type="range" min="0" max="100" value="${d.volume * 100}"><output>${Math.round(d.volume * 100)} %</output></label>` : ""}<span></span>${d.id ? `<button data-cmd="delete" title="${tr("Delete annotation", "Supprimer l’annotation")}">⌫</button>` : ""}<button class="save" data-cmd="save">${d.id ? tr("Save", "Enregistrer") : tr("Annotate", "Annoter")} ↗</button></div>`;
    this.pop.querySelector<HTMLElement>(".prompt-editor")!.oninput = (e) => {
      if (this.draft)
        this.draft.prompt = (e.target as HTMLElement).innerText ?? (e.target as HTMLElement).textContent ?? "";
    };
    this.pop.querySelectorAll<HTMLButtonElement>("[data-aid]").forEach(
      (b) =>
        (b.onclick = () => {
          if (this.draft) {
            const [g, i] = b.dataset.aid!.split(":").map(Number);
            const item = groups[g].items[i];
            if (item.scope === "media") { this.draft.scope = "media"; this.draft.startTime = 0; this.draft.endTime = duration; }
            this.draft.action = item.action;
            if (item.action === "insert") {
              this.draft.insertion = {
                position: item.insertionPosition ?? "at",
                time: item.insertionPosition === "after" ? duration : item.insertionPosition === "before" ? 0 : this.draft.startTime,
                useAdjacentFrames: item.insertionPosition === "at",
              };
            } else delete this.draft.insertion;
            this.draft.prompt += (this.draft.prompt ? "\n" : "") + item.prompt;
            if ("assistance" in item && item.assistance)
              this.draft.assistance = item.assistance;
            b.classList.add("used");
            this.showPopover();
            this.paintMarkers();
          }
        }),
    );
    const range = this.pop.querySelector<HTMLInputElement>("input");
    if (range)
      range.oninput = () => {
        this.draft!.volume = Number(range.value) / 100;
        this.pop.querySelector("output")!.textContent = `${range.value} %`;
      };
    this.addDestinationPicker();
    this.pop.querySelector<HTMLButtonElement>(".scope-toggle")?.addEventListener("click", () => {
      if (d.scope === "media") { delete d.scope; delete d.endTime; }
      else { d.scope = "media"; d.endTime = this.store.project.videos.find(v => v.id === d.videoId)!.duration; }
      this.showPopover();
      this.paintMarkers();
    });
    this.positionPopover();
    this.paintDrawings();
  }
  private addDestinationPicker(): void {
    const d = this.draft!;
    const editor = this.pop.querySelector<HTMLElement>(".prompt-editor")!;
    const targets = this.store.project.videos.filter(v => v.id !== d.videoId && v.kind !== "audio");
    if (!targets.length) return;
    const panel = document.createElement("div");
    panel.className = "destination-picker";
    panel.hidden = true;
    editor.after(panel);
    const linked = () => d.endTime === undefined ? d.mediaReference : d.destination;
    const setLinked = (videoId: string, time: number) => {
      if (d.endTime === undefined) {
        d.mediaReference = { videoId, time };
        delete d.destination;
      } else {
        d.destination = { videoId, time };
        delete d.mediaReference;
      }
    };
    let selected = targets.find(v => v.id === linked()?.videoId);
    let mentionRange: Range | undefined;
    const sync = () => {
      d.prompt = editor.innerText ?? editor.textContent ?? "";
      if (!editor.querySelector(".prompt-tag")) {
        delete d.destination;
        delete d.mediaReference;
      }
    };
    const token = () => selected ? `@${selected.name}${linked() ? ` · ${linked()!.time.toFixed(3)} s` : ""}` : "";
    const createTag = () => {
      const tag = document.createElement("span");
      tag.className = "prompt-tag";
      tag.contentEditable = "false";
      tag.tabIndex = 0;
      tag.setAttribute("role", "button");
      tag.textContent = token();
      tag.title = d.endTime === undefined
        ? tr("Choose a reference moment in this video", "Choisir le moment de référence dans cette vidéo")
        : tr("Choose a position in this track", "Choisir l’endroit dans cette piste");
      tag.onclick = openTime;
      tag.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); openTime(); } };
      return tag;
    };
    const openTime = () => {
      if (!selected) return;
      this.root.append(panel);
      panel.classList.add("time-tooltip");
      panel.hidden = false;
      panel.innerHTML = `<div class="visual-time"><div class="popover-head"><span></span></div><video muted playsinline preload="auto"></video><label>${tr("Place here", "Placer à cet endroit")}<input aria-label="${tr("Destination time in seconds", "Temps de destination en secondes")}" type="range" min="0" step="0.01"><output></output></label></div>`;
      panel.querySelector(".popover-head span")!.textContent = selected.name;
      const input = panel.querySelector("input")!, preview = panel.querySelector("video")!;
      input.max = String(selected.duration);
      input.value = String(linked()?.time ?? 0);
      const runtime = this.media.get(selected.id);
      preview.hidden = !runtime;
      const update = () => {
        panel.querySelector("output")!.textContent = formatTime(Number(input.value), true);
        if (runtime && preview.readyState >= 1) preview.currentTime = Math.min(Number(input.value), Math.max(0, selected!.duration - 0.04));
      };
      if (runtime) { preview.src = runtime.url; preview.onloadedmetadata = update; }
      else { const note = document.createElement("p"); note.textContent = tr("Reconnect this video to preview it.", "Réassociez cette vidéo pour voir l’aperçu."); preview.after(note); }
      update();
      input.oninput = () => {
        update();
        const time = Number(input.value);
        if (!Number.isFinite(time) || time < 0 || time > selected!.duration) return;
        this.rememberDraft();
        setLinked(selected!.id, time);
        editor.querySelector(".prompt-tag")!.textContent = token();
        sync(); this.paintMarkers();
      };
      const rect = this.pop.getBoundingClientRect();
      panel.style.left = `${clamp(rect.right + 12 + 430 <= innerWidth ? rect.right + 12 : rect.left - 442, 12, Math.max(12, innerWidth - 442))}px`;
      panel.style.top = `${clamp(rect.top, 12, Math.max(12, innerHeight - panel.offsetHeight - 12))}px`;
    };
    editor.addEventListener("pointerdown", e => { if (!(e.target as Element).closest(".prompt-tag")) panel.hidden = true; });
    editor.addEventListener("focus", () => { panel.hidden = true; });
    if (selected && linked()) {
      const oldToken = `@${selected.name}`;
      const start = d.prompt.indexOf(oldToken);
      // Keep the rest of the user's prose intact when restoring a saved mention.
      const match = start < 0 ? undefined : d.prompt.slice(start).match(/^@.*?(?: · [\d.]+ s| #[^\n]*?\([\d.]+ s\))(?=\s|$)/);
      editor.textContent = start < 0 ? d.prompt : d.prompt.slice(0, start);
      editor.append(createTag());
      editor.append(document.createTextNode(start < 0 ? " " : d.prompt.slice(start + (match?.[0].length ?? oldToken.length))));
    }
    editor.addEventListener("input", () => {
      sync();
      const selection = window.getSelection();
      if (!selection?.rangeCount || !selection.anchorNode || !editor.contains(selection.anchorNode)) return;
      const range = selection.getRangeAt(0);
      if (range.startContainer.nodeType !== Node.TEXT_NODE) { panel.hidden = true; return; }
      const before = range.startContainer.textContent!.slice(0, range.startOffset);
      const match = before.match(/(?:^|\s)@([^@\n]*)$/);
      if (!match) { panel.hidden = true; return; }
      mentionRange = range.cloneRange();
      mentionRange.setStart(range.startContainer, before.lastIndexOf("@"));
      panel.replaceChildren();
      panel.classList.remove("time-tooltip");
      panel.style.left = ""; panel.style.top = "";
      editor.after(panel);
      panel.hidden = false;
      for (const target of targets.filter(v => v.name.toLowerCase().includes(match[1].toLowerCase()))) {
        const button = document.createElement("button");
        button.dataset.target = target.id;
        button.textContent = target.name;
        button.onclick = () => {
          selected = target;
          // A point links a reference frame; a range links an insertion destination.
          editor.querySelector(".prompt-tag")?.replaceWith(document.createTextNode(editor.querySelector(".prompt-tag")!.textContent ?? ""));
          setLinked(target.id, 0);
          if (mentionRange) {
            mentionRange.deleteContents();
            const tag = createTag();
            mentionRange.insertNode(tag);
            const space = document.createTextNode(" ");
            tag.after(space);
            const caret = document.createRange(); caret.setStart(space, 1); caret.collapse(true);
            editor.focus(); selection.removeAllRanges(); selection.addRange(caret);
          }
          sync(); panel.hidden = true;
        };
        panel.append(button);
      }
      this.positionPopover();
    });
    editor.addEventListener("keydown", e => {
      if (panel.hidden || panel.querySelector(".visual-time")) return;
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); panel.querySelector<HTMLButtonElement>("[data-target]")?.click(); }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); panel.hidden = true; }
      if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); panel.querySelector<HTMLButtonElement>("[data-target]")?.focus(); }
    });
  }
  private positionPopover(): void {
    if (this.pop.hidden) return;
    this.pop.style.left = `${clamp(this.anchor.x - 160, 12, Math.max(12, innerWidth - this.pop.offsetWidth - 12))}px`;
    this.pop.style.top = `${clamp(this.anchor.y - this.pop.offsetHeight - 24, 12, Math.max(12, innerHeight - this.pop.offsetHeight - 12))}px`;
  }
  private rememberDraft(): void {
    if (this.draft) {
      this.draftPast.push(structuredClone(this.draft));
      this.draftFuture = [];
    }
  }
  private cancel(): void {
    this.root.querySelectorAll(".destination-picker").forEach(el => el.remove());
    this.draft = undefined;
    this.selectedDrawing = undefined;
    this.draftPast = [];
    this.draftFuture = [];
    this.pop.hidden = true;
    this.paintMarkers();
    this.paintDrawings();
  }
  private setMode(mode: Mode): void {
    this.mode = mode;
    this.root.querySelector<HTMLButtonElement>(".finish-drawing")!.hidden =
      mode === "select";
    if (mode !== "select") this.pop.hidden = true;
    this.root
      .querySelectorAll<HTMLElement>("[data-mode]")
      .forEach((b) => b.classList.toggle("chosen", b.dataset.mode === mode));
    this.svg.style.cursor = mode === "select" ? "default" : "crosshair";
  }
  private paintDrawings(extra?: Drawing): void {
    const d = this.draft?.videoId === this.active ? this.draft : undefined;
    const shapes =
      d?.drawings ??
      this.store.project.annotations
        .filter(
          (a) =>
            a.videoId === this.active &&
            this.time >= a.startTime - 0.05 &&
            this.time <= (a.endTime ?? a.startTime) + 0.05,
        )
        .flatMap((a) => a.drawings ?? []);
    this.svg.innerHTML = [...shapes, ...(extra ? [extra] : [])]
      .map(
        (s, i) =>
          `<g data-shape="${i}" class="${i === this.selectedDrawing ? "shape-selected" : ""}">${drawingSvg(s)}</g>`,
      )
      .join("");
  }
  private bindDrawing(): void {
    this.svg.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !this.asset() || this.asset()?.kind === "audio")
        return;
      if (this.mode === "select") {
        const el = (e.target as Element).closest<SVGElement>("[data-shape]");
        this.selectedDrawing = el ? Number(el.dataset.shape) : undefined;
        if (this.selectedDrawing !== undefined && !this.draft) {
          let index = this.selectedDrawing;
          for (const a of this.store.project.annotations.filter(
            (a) =>
              a.videoId === this.active &&
              this.time >= a.startTime - 0.05 &&
              this.time <= (a.endTime ?? a.startTime) + 0.05,
          )) {
            if (index < (a.drawings?.length ?? 0)) {
              this.draft = structuredClone(a);
              this.selectedDrawing = index;
              this.anchor = { x: e.clientX, y: e.clientY };
              break;
            }
            index -= a.drawings?.length ?? 0;
          }
        }
        this.paintDrawings();
        if (this.selectedDrawing !== undefined && this.draft?.drawings) {
          this.rememberDraft();
          const index = this.selectedDrawing,
            original = structuredClone(this.draft.drawings[index]);
          const rect = this.svg.getBoundingClientRect();
          const points =
            original.type === "rectangle"
              ? [
                  { x: original.x, y: original.y },
                  {
                    x: original.x + original.width,
                    y: original.y + original.height,
                  },
                ]
              : original.type === "arrow"
                ? [original.from, original.to]
                : original.points;
          const minX = Math.min(...points.map((p) => p.x)),
            maxX = Math.max(...points.map((p) => p.x)),
            minY = Math.min(...points.map((p) => p.y)),
            maxY = Math.max(...points.map((p) => p.y));
          this.svg.setPointerCapture(e.pointerId);
          const move = (ev: PointerEvent) => {
            const dx = clamp(
                (ev.clientX - e.clientX) / rect.width,
                -minX,
                1 - maxX,
              ),
              dy = clamp(
                (ev.clientY - e.clientY) / rect.height,
                -minY,
                1 - maxY,
              ),
              translate = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
            this.draft!.drawings![index] =
              original.type === "rectangle"
                ? { ...original, x: original.x + dx, y: original.y + dy }
                : original.type === "arrow"
                  ? {
                      ...original,
                      from: translate(original.from),
                      to: translate(original.to),
                    }
                  : { ...original, points: original.points.map(translate) };
            this.paintDrawings();
          };
          const up = () => {
            this.svg.removeEventListener("pointermove", move);
            this.svg.removeEventListener("pointerup", up);
            this.showPopover();
          };
          this.svg.addEventListener("pointermove", move);
          this.svg.addEventListener("pointerup", up, { once: true });
        }
        return;
      }
      this.player.pause();
      if (!this.draft || this.draft.videoId !== this.active)
        this.draft = {
          videoId: this.active!,
          startTime: this.time,
          frameTime: this.time,
          prompt: "",
          drawings: [],
        };
      this.rememberDraft();
      const rect = this.svg.getBoundingClientRect();
      const point = (ev: PointerEvent): Point => ({
        x: clamp((ev.clientX - rect.left) / rect.width, 0, 1),
        y: clamp((ev.clientY - rect.top) / rect.height, 0, 1),
      });
      const start = point(e);
      let shape: Drawing | undefined;
      const points = [start];
      this.svg.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const p = point(ev);
        if (this.mode === "rectangle")
          shape = {
            type: "rectangle",
            x: Math.min(start.x, p.x),
            y: Math.min(start.y, p.y),
            width: Math.abs(p.x - start.x),
            height: Math.abs(p.y - start.y),
          };
        else if (this.mode === "arrow")
          shape = { type: "arrow", from: start, to: p };
        else {
          if (points.length < 10000) points.push(p);
          shape = { type: "freehand", points };
        }
        this.paintDrawings(shape);
      };
      const up = (ev: PointerEvent) => {
        this.svg.removeEventListener("pointermove", move);
        this.svg.removeEventListener("pointerup", up);
        if (
          shape &&
          (shape.type !== "rectangle" ||
            (shape.width > 0.002 && shape.height > 0.002))
        ) {
          this.draft!.drawings ??= [];
          this.draft!.drawings.push(shape);
        }
        this.anchor = { x: ev.clientX, y: ev.clientY };
        this.paintMarkers();
        this.paintDrawings();
      };
      this.svg.addEventListener("pointermove", move);
      this.svg.addEventListener("pointerup", up, { once: true });
    });
  }
  private bindSplitter(): void {
    const split = this.root.querySelector<HTMLElement>(".splitter")!;
    const resize = (y: number) => {
      this.manualLayout = true;
      this.root.style.setProperty(
        "--scene-height",
        `${clamp(y, 180, innerHeight - 180)}px`,
      );
    };
    split.onpointerdown = (e) => {
      split.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => resize(ev.clientY);
      split.addEventListener("pointermove", move);
      split.addEventListener(
        "pointerup",
        () => split.removeEventListener("pointermove", move),
        { once: true },
      );
    };
    split.onkeydown = (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        resize(
          split.getBoundingClientRect().top + (e.key === "ArrowUp" ? -20 : 20),
        );
      }
    };
  }
  private bindDrop(): void {
    const overlay = this.root.querySelector<HTMLElement>(".drop-overlay")!;
    let depth = 0;
    document.addEventListener("dragenter", (e) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        depth++;
        overlay.hidden = false;
      }
    });
    document.addEventListener("dragleave", () => {
      if (--depth <= 0) overlay.hidden = true;
    });
    document.addEventListener("dragover", (e) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    });
    document.addEventListener("drop", (e) => {
      e.preventDefault();
      depth = 0;
      overlay.hidden = true;
      void this.importFiles(Array.from(e.dataTransfer?.files ?? []));
    });
  }
  private async importFiles(files: File[]): Promise<void> {
    if (this.importing) {
      this.toast("Analyse en cours…");
      return;
    }
    this.importing = true;
    for (const file of files)
      try {
        this.toast(`Ouverture de ${file.name}…`);
        const { asset, runtime } = await inspectMedia(file);
        if (this.workspaceMode) {
          const response = await fetch(
            `/api/workspace/import?name=${encodeURIComponent(file.name)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/octet-stream" },
              body: file,
            },
          );
          if (!response.ok) {
            URL.revokeObjectURL(runtime.url);
            throw new Error(
              "Impossible de conserver le média dans le workspace.",
            );
          }
          const { path } = await response.json();
          asset.source = { engine: "native", path, renderPath: path };
        }
        const match = matchAsset(
          file,
          this.store.project.videos.filter((v) => !this.media.has(v.id)),
        );
        if (match) {
          if (
            Math.abs(match.duration - asset.duration) > 0.2 ||
            match.kind !== asset.kind
          ) {
            URL.revokeObjectURL(runtime.url);
            throw new Error("Le fichier ne correspond pas au média attendu.");
          }
          this.media.set(match.id, runtime);
        } else {
          this.media.set(asset.id, runtime);
          this.store.addVideo(asset);
        }
        try {
          await saveMedia(match?.id ?? asset.id, runtime);
        } catch {
          this.toast(
            "Ce fichier est ouvert, mais le navigateur n’a pas pu le conserver. Il faudra le choisir à nouveau après actualisation.",
          );
        }
        this.activate(match?.id ?? asset.id);
      } catch (e) {
        this.error(e);
      }
    this.importing = false;
    this.root.querySelector<HTMLInputElement>(".files")!.value = "";
  }
  private keyboard(e: KeyboardEvent): void {
    if (e.isComposing) return;
    const editable =
      e.target instanceof Element &&
      !!e.target.closest('input,textarea,[contenteditable="true"]');
    const mod = e.ctrlKey || e.metaKey;
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      this.draft &&
      (mod ||
        (e.target instanceof Element && !!e.target.closest(".prompt-editor")))
    ) {
      e.preventDefault();
      this.command("save");
      return;
    }
    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      this.commands();
      return;
    }
    if (e.key === "Escape") {
      this.palette.close();
      this.cancel();
      this.setMode("select");
      return;
    }
    if (editable || this.palette.open) return;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      this.command(e.shiftKey ? "redo" : "undo");
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      this.command("play");
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      this.seek(
        this.time + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 1 : 0.1),
      );
    }
    const modes: Record<string, Mode> = {
      v: "select",
      r: "rectangle",
      a: "arrow",
      d: "freehand",
    };
    if (modes[e.key.toLowerCase()]) this.setMode(modes[e.key.toLowerCase()]);
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.command("delete");
    }
    if (e.key === "?") this.commands(true);
  }
  private command(cmd: string): void {
    try {
      if (cmd === "rewind") this.seek(this.time - 5);
      if (cmd === "forward") this.seek(this.time + 5);
      if (cmd === "import")
        this.root.querySelector<HTMLInputElement>(".files")!.click();
      if (cmd === "import-json")
        this.root.querySelector<HTMLInputElement>(".json")!.click();
      if (cmd === "export") {
        const url = URL.createObjectURL(
          new Blob([serializeManifest(this.store.project)], {
            type: "application/json",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "annotations.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      if (cmd === "export-video-md") {
        const url = URL.createObjectURL(
          new Blob(
            [renderVideoMd(this.store.project.name, this.store.project.brief)],
            {
              type: "text/markdown;charset=utf-8",
            },
          ),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "VIDEO.md";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      if (cmd === "rename") {
        const name =
          this.palette.querySelector<HTMLInputElement>(".project-name")?.value;
        if (name) this.store.rename(name);
      }
      if (cmd === "new") {
        if (this.workspaceMode) {
          this.toast(
            "Ouvrez un autre workspace avec Framebrief pour commencer un autre projet.",
          );
          return;
        }
        this.cancel();
        this.store.replace(createProject());
        this.activate(undefined);
      }
      if (cmd === "remove" && this.active) {
        this.cancel();
        this.store.removeVideo(this.active);
        this.activate(this.store.project.videos[0]?.id);
      }
      if (cmd === "play" && this.active && this.media.has(this.active)) {
        if (this.player.paused) {
          if (this.time >= this.asset()!.duration) this.seek(0);
          void this.player.play().catch((e) => this.error(e));
        } else this.player.pause();
      }
      if (cmd === "zoom-in" || cmd === "zoom-out") {
        this.scale = clamp(
          this.scale * (cmd === "zoom-in" ? 1.3 : 1 / 1.3),
          10,
          800,
        );
        this.renderTracks();
      }
      if (cmd === "finish-drawing" && this.draft) {
        this.setMode("select");
        this.showPopover();
      }
      if (cmd === "cancel") this.cancel();
      if (cmd === "save" && this.draft) {
        if (this.saving) return;
        this.saving = true;
        const draft = this.draft;
        const button = this.pop.querySelector<HTMLButtonElement>(".save");
        if (button) {
          button.disabled = true;
          button.textContent = "Capture…";
        }
        void this.saveWithImages(structuredClone(draft))
          .then(() => {
            if (this.draft === draft) this.cancel();
          })
          .catch((e) => this.error(e))
          .finally(() => {
            this.saving = false;
            if (button) {
              button.disabled = false;
              button.textContent = "Enregistrer ↗";
            }
          });
      }
      if (cmd === "unlink" && this.draft) {
        this.rememberDraft();
        delete this.draft.destination;
        delete this.draft.mediaReference;
        this.showPopover();
        this.paintMarkers();
      }
      if (cmd === "volume" && this.draft) {
        this.rememberDraft();
        this.draft.volume = this.draft.volume === undefined ? 0.5 : undefined;
        this.showPopover();
      }
      if (cmd === "delete" && this.draft) {
        if (this.selectedDrawing !== undefined) {
          this.rememberDraft();
          this.draft.drawings?.splice(this.selectedDrawing, 1);
          this.selectedDrawing = undefined;
          this.paintDrawings();
        } else {
          if (this.draft.id) this.store.deleteAnnotation(this.draft.id);
          this.cancel();
        }
      }
      if (cmd === "undo" || cmd === "redo") {
        const from = cmd === "undo" ? this.draftPast : this.draftFuture,
          to = cmd === "undo" ? this.draftFuture : this.draftPast;
        if (this.draft && from.length) {
          to.push(structuredClone(this.draft));
          this.draft = from.pop();
          this.showPopover();
          this.paintMarkers();
        } else {
          this.cancel();
          if (cmd === "undo") this.store.undo();
          else this.store.redo();
          this.activate(
            this.store.project.videos.some((v) => v.id === this.active)
              ? this.active
              : this.store.project.videos[0]?.id,
          );
        }
      }
      if (cmd === "help") this.commands(true);
    } catch (e) {
      this.error(e);
    }
  }
  private commands(help = false): void {
    this.palette.innerHTML = `<header><span>${help ? tr("Keyboard shortcuts", "Raccourcis") : tr("Commands", "Commandes")}</span><button data-close aria-label="${tr("Close", "Fermer")}">×</button></header>${
      help
        ? tr("<dl><dt>Space</dt><dd>Play / pause</dd><dt>← / → · Shift</dt><dd>0.1 s / 1 s</dd><dt>V · R · A · D</dt><dd>Select · rectangle · arrow · draw</dd><dt>Ctrl/Cmd + Z · Shift</dt><dd>Undo / redo</dd><dt>Ctrl/Cmd + Enter</dt><dd>Save annotation</dd><dt>Delete · Escape</dt><dd>Delete · cancel</dd><dt>Ctrl/Cmd + K</dt><dd>Commands</dd></dl>", "<dl><dt>Espace</dt><dd>Lecture / pause</dd><dt>← / → · Maj</dt><dd>0,1 s / 1 s</dd><dt>V · R · A · D</dt><dd>Sélection · rectangle · flèche · crayon</dd><dt>Ctrl/Cmd + Z · Maj</dt><dd>Annuler / rétablir</dd><dt>Ctrl/Cmd + Entrée</dt><dd>Enregistrer l’annotation</dd><dt>Suppr · Échap</dt><dd>Supprimer · annuler</dd><dt>Ctrl/Cmd + K</dt><dd>Commandes</dd></dl>")
        : `<input class="project-name" aria-label="${tr("Project name", "Nom du projet")}" value="${esc(this.store.project.name)}">${[
            ["rename", tr("Rename project", "Renommer le projet")],
            ["import", tr("Add or reconnect media", "Ajouter ou réassocier des médias")],
            ["export", tr("Export JSON annotations", "Exporter les annotations JSON")],
            [
              "export-video-md",
              `${tr("Export", "Exporter")} VIDEO.md · ${this.store.project.brief.status === "ready" ? tr("brief ready", "brief prêt") : tr("brief incomplete", "brief à compléter")}`,
            ],
            ["import-json", tr("Import JSON project", "Importer un projet JSON")],
            ["undo", tr("Undo", "Annuler")],
            ["redo", tr("Redo", "Rétablir")],
            ["remove", tr("Remove active media", "Retirer le média actif")],
            ["new", tr("New project", "Nouveau projet")],
            ["help", tr("Keyboard shortcuts", "Raccourcis clavier")],
          ]
            .map(
              ([cmd, label]) =>
                `<button data-palette="${cmd}">${label}<span>↗</span></button>`,
            )
            .join("")}`
    }`;
    this.palette
      .querySelector("[data-close]")!
      .addEventListener("click", () => this.palette.close());
    this.palette.querySelectorAll<HTMLElement>("[data-palette]").forEach(
      (b) =>
        (b.onclick = () => {
          const cmd = b.dataset.palette!;
          this.command(cmd);
          if (cmd !== "help") this.palette.close();
        }),
    );
    if (!this.palette.open) this.palette.showModal();
  }
  private async saveWithImages(draft: DraftAnnotation) {
    validateDraft(draft, this.store.project.videos);
    const asset = this.store.project.videos.find(
      (v) => v.id === draft.videoId,
    )!;
    if (asset.kind !== "audio") {
      if (this.media.has(asset.id)) {
        if (draft.insertion?.useAdjacentFrames) {
          const times = [
            Math.max(0, draft.insertion.time - 0.1),
            Math.min(asset.duration, draft.insertion.time + 0.1),
          ];
          draft.referenceImages = [];
          for (const [index, time] of times.entries()) {
            const adjacent = await this.captureFrame(
              { videoId: asset.id, time, compact: true },
              [],
            );
            draft.referenceImages.push({
              purpose: index === 0 ? "annotation" : "continuation",
              time: adjacent.time,
              width: adjacent.width,
              height: adjacent.height,
              dataUrl: `data:${adjacent.mimeType};base64,${adjacent.data}`,
            });
          }
        } else {
        const frame = await this.captureFrame(
          {
            videoId: asset.id,
            time: draft.frameTime ?? draft.startTime,
            compact: true,
          },
          draft.drawings ?? [],
        );
        draft.referenceImages = [
          {
            purpose: "annotation",
            time: frame.time,
            width: frame.width,
            height: frame.height,
            dataUrl: `data:${frame.mimeType};base64,${frame.data}`,
          },
        ];
        }
        if (draft.assistance === "continue-video") {
          const last = await this.captureFrame(
            {
              videoId: asset.id,
              time: Math.max(
                draft.startTime,
                (draft.endTime ?? asset.duration) - 0.001,
              ),
              compact: true,
            },
            [],
          );
          draft.referenceImages!.push({
            purpose: "continuation",
            time: last.time,
            width: last.width,
            height: last.height,
            dataUrl: `data:${last.mimeType};base64,${last.data}`,
          });
        }
      } else {
        const existing = this.store.project.annotations.find(
          (a) => a.id === draft.id,
        );
        const visual = (a: DraftAnnotation) =>
          JSON.stringify([
            a.videoId,
            a.startTime,
            a.endTime,
            a.frameTime,
            a.drawings,
            a.assistance,
          ]);
        if (!existing || visual(existing) !== visual(draft))
          throw new Error(
            "Ouvrez le média pour joindre la capture à cette annotation.",
          );
        draft.referenceImages = existing.referenceImages;
      }
    }
    return this.store.saveAnnotation(draft);
  }
  private async captureFrame(
    input: Record<string, unknown>,
    drawings?: Drawing[],
  ): Promise<{
    data: string;
    mimeType: string;
    time: number;
    videoId: string;
    width: number;
    height: number;
  }> {
    const id = String(input.videoId),
      v = this.store.project.videos.find((v) => v.id === id),
      runtime = this.media.get(id),
      time = Number(input.time);
    if (
      !v ||
      v.kind === "audio" ||
      !runtime ||
      !Number.isFinite(time) ||
      time < 0 ||
      time > v.duration
    )
      throw new Error("Vidéo indisponible ou temps invalide.");
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    const wait = (event: string) =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error("Capture indisponible."));
        }, 15000);
        const done = () => {
          cleanup();
          resolve();
        };
        const fail = () => {
          cleanup();
          reject(new Error("Décodage impossible."));
        };
        const cleanup = () => {
          clearTimeout(timer);
          video.removeEventListener(event, done);
          video.removeEventListener("error", fail);
        };
        video.addEventListener(event, done, { once: true });
        video.addEventListener("error", fail, { once: true });
      });
    try {
      const ready = wait("loadeddata");
      video.src = runtime.url;
      await ready;
      if (time > 0) {
        const sought = wait("seeked");
        video.currentTime = Math.min(time, Math.max(0, v.duration - 0.001));
        await sought;
      }
      const canvas = document.createElement("canvas");
      const ratio = Math.min(
        1,
        (input.compact ? 960 : 1280) / Math.max(v.width, v.height),
      );
      canvas.width = Math.max(1, Math.round(v.width * ratio));
      canvas.height = Math.round((canvas.width * v.height) / v.width);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (drawings)
        for (const d of drawings)
          paintDrawing(ctx, d, canvas.width, canvas.height);
      else if (input.includeDrawings) {
        const annotations = this.store.project.annotations.filter(
          (a) =>
            a.videoId === id &&
            time >= a.startTime - 0.05 &&
            time <= (a.endTime ?? a.startTime) + 0.05 &&
            (!input.annotationId || input.annotationId === a.id),
        );
        for (const a of annotations)
          for (const d of a.drawings ?? [])
            paintDrawing(ctx, d, canvas.width, canvas.height);
      }
      return {
        data: canvas
          .toDataURL(input.compact ? "image/jpeg" : "image/png", 0.85)
          .split(",")[1],
        mimeType: input.compact ? "image/jpeg" : "image/png",
        time: video.currentTime,
        videoId: id,
        width: canvas.width,
        height: canvas.height,
      };
    } finally {
      video.removeAttribute("src");
      video.load();
    }
  }
  private toast(message: string): void {
    const el = this.root.querySelector<HTMLElement>(".toast")!;
    el.textContent = message;
    el.hidden = false;
    setTimeout(() => {
      if (el.textContent === message) el.hidden = true;
    }, 4500);
  }
  private error(e: unknown): void {
    this.toast(e instanceof Error ? e.message : String(e));
  }
}
