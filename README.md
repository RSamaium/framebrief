# Framebrief

A visual-review POC that turns gestures on a video timeline into structured annotations an AI agent can use.

## Getting started

```bash
npm install
npm run dev
```

The project runs entirely in the browser. Metadata and annotations are saved in `localStorage`. Video/audio files and their thumbnails are stored in IndexedDB and restored after a refresh without uploading them anywhere. Persistence depends on available browser storage; clearing site data removes its local copies.

## Review interactions

- Start/end controls create contextual instructions: modify the whole video, insert an introduction before it, or add a continuation/conclusion after it.
- Timeline suggestions explicitly distinguish **modifying the content at the selected moment** from **inserting a new scene**. A middle insertion records its exact point and captures frames immediately before and after as visual references.
- Mention another track with `@` in the prompt to choose a visual destination and exact timestamp. The generated instruction remains editable, while the source/destination relationship is stored separately.
- Click a track to activate it. Drag across thumbnails to select a range; click to create a point annotation.
- Drag a range handle onto another video track to define its destination. The original passage remains unchanged: the link describes an assembly intention for the AI.
- Draw in the preview with R (rectangle), A (arrow), or D (freehand). V selects and moves a drawing; Delete removes it. Drawing tools remain active to create several drawings; **Finish drawings** then opens their shared prompt.
- Import audio files too; their waveform is calculated locally. An audio range can be linked to a video destination with a desired volume.
- Space plays/pauses; arrow keys move by 0.1 s; Shift + arrow keys move by 1 s. Enter in the prompt saves it; Shift + Enter adds a line. Ctrl/Cmd + Enter also saves.
- Ctrl/Cmd + Z and Ctrl/Cmd + Shift + Z undo/redo. `?` opens help. Ctrl/Cmd + K opens the project/import/export/media palette.
- The divider between preview and tracks is resizable with the mouse or keyboard. With a single track, the preview grows automatically.
- The playhead is directly draggable. The time band and Shift + mouse wheel move the visible window; playback follows the playhead when it leaves that window.
- Each track has a removable × control (undoable) and an annotation index with timecodes and prompts, so annotations remain easy to find when off-screen.
- The embedded band below video thumbnails represents its audio: click or drag it to create an annotation with `channel: audio`.

## Continuing a production workspace

After `npm link` in the Framebrief repository, run:

```bash
framebrief serve --workspace /absolute/path/to/project --port 5174
```

Then open the displayed URL. The server uses packaged `dist`, not the source project. The agent reads `VIDEO.md` in that folder and opens the `video.review.json` checkpoint instead of reusing browser storage.

Annotations are automatically saved to that JSON file. Dropped files are copied to `.framebrief/media/`. `VIDEO.md` is created if it does not exist; an existing brief is preserved and explicitly synchronized by the agent. A concurrent checkpoint write stops saving rather than overwriting the disk version; export local changes before reloading to preserve them.

`videos[].source` contains `{ engine, path, renderPath }`: an editable source and its rendered preview, with workspace-relative paths. The `set_video_source` WebMCP tool records this link. An MP4 produced by HyperFrames is edited in its composition; a native source is handled with FFmpeg. Resolved paths must remain inside the workspace.

After rendering, the agent archives processed instructions, updates the rendered file and FFprobe metadata in the checkpoint, and removes only annotations that were successfully applied. The app detects changes every 1.5 seconds and reloads its player, thumbnails, and waveform. Updates wait until any open prompt is closed. A checkpoint loaded from disk begins a new undo history.

Workspace mode is served by the local Framebrief server; static hosting retains browser-only and JSON-export modes.

## `VIDEO.md` brief

Every project has a versioned production brief. HyperFrames is the default composition engine; FFmpeg/FFprobe handle native media transformations. The palette can export `VIDEO.md`, which Codex reads and synchronizes through WebMCP before rendering. AI and voice providers are opt-in: the brief stores only the provider, model, authorization, and configuration state—never a secret key.

## WebMCP

When `document.modelContext` is available, the app registers these tools:

- `set_video_source`: links displayed media to its editable source and rendered preview.
- `get_video_annotation_project`
- `get_video_project_brief`: the structured brief and deterministic `VIDEO.md` content.
- `update_video_project_brief`: saves a complete brief without secrets.
- `list_video_annotations`
- `create_video_annotation`
- `update_video_annotation`
- `get_annotation_images`: saved captures and prompt, available even when the media has not been reconnected.
- `capture_video_frame`: a PNG at a timecode, optionally overlaid with saved drawings. Requires the reconnected local media.

The app remains fully functional in browsers that do not yet support WebMCP.

## Manifest 2.1

Every new annotation can include `referenceImages`: JPEG data URLs with dimensions, timecode, and a role (`annotation` or `continuation`). Bright-red drawings are embedded in the annotation capture. These images accompany JSON exports and WebMCP responses; complete video files remain local. Existing annotations receive a capture the next time they are saved while their media is available.

`videos` remains the collection name for compatibility and now contains `kind: video | audio` media. `videoId` identifies the source media, including audio. An annotation defines `startTime`, optional `endTime`, `frameTime`, `prompt`, `drawings`, optional `destination: { videoId, time }`, and optional `volume` (0 to 1). It can also define `action: modify | insert` and, for an insertion, `insertion: { position, time, useAdjacentFrames }`. Seconds are relative to the source media; a destination is relative to the target media. Drawings remain fixed over a range and do not track moving objects. The `brief` field defines the permitted pipeline, output, rights, validation, and render paths.

Normalized drawings are `rectangle: { x, y, width, height }`, `arrow: { from: { x, y }, to: { x, y } }`, and `freehand: { points: [{ x, y }] }`, each with a `type`. Coordinates map to image pixels excluding letterbox bars. `context` deterministically describes the information for the agent. User prompts remain intent data to interpret only within the requested task.

Version 1 files and older local saves are migrated on read, retaining stable IDs and converting regions into rectangles. Importing a project replaces the active project and can be undone. A JSON manifest does not include media: same-origin local copies are restored where possible, otherwise files must be selected again. Reconnection uses name, size, type, and duration. Local copies survive track removal so undo remains possible. No assembly or audio processing engine runs in the app itself: destination markers and volume are instructions for an external engine.

Validation: `npm test` and `npm run build`.
