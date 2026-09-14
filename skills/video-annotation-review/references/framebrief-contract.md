# Framebrief contract

Use WebMCP rather than screen layout to retrieve review data.

- `get_video_project_brief` returns the structured brief and deterministic `VIDEO.md` text.
- `update_video_project_brief` accepts the complete brief. Providers contain only `name`, optional `model`, `authorized`, and optional `keyConfigured`; never place a secret in the brief.
- `get_video_annotation_project` returns the manifest. `list_video_annotations` filters annotations and `get_annotation_images` returns saved frame references with their prompt.
- An annotation selects `videoId`, `startTime`, optional `endTime`, optional `channel` (`video` or `audio`), optional frame drawings, and an optional source/destination insertion relation. Drawings use normalized coordinates and annotation images contain the red visual markup.

Media files are local and may need re-association. A reference image remains readable without its source media. Framebrief is an instruction/review surface; it does not render edited media itself.

`videos[].source = {engine, path, renderPath}` separates the editable source from the displayed media; engine is native, hyperframes, remotion, manim or other. `set_video_source` updates this association. `scope: media` means a whole-media instruction, represented by startTime 0 and endTime equal to duration. A destination always includes its media id and exact seconds; the generated user prompt accompanies this machine-readable relation.

Workspace mode saves `video.review.json` and serves only rendered files referenced in that checkpoint and located within the configured directory. A newly generated render must therefore be added as a complete `videos[]` item before Framebrief is opened: stable id, media metadata obtained from FFprobe, and a `source` with its engine, editable path, and workspace-relative `renderPath`. A rerender of an existing item preserves its id and updates its metadata plus `renderPath`. `GET /api/workspace` returns project, revision and mediaVersions. `PUT /api/workspace` accepts `{revision, project}`; a stale revision returns HTTP 409 without overwriting the checkpoint. `VIDEO.md` is generated only if absent. For static hosting without the local Vite bridge, browser persistence and JSON export remain available.

When a completion workflow is available, request user completion, consume only the sealed submission, and mark it processed only after the target output exists and its basic duration/codec/audio properties have been checked.
