#!/usr/bin/env python3
"""Archive a Framebrief checkpoint and atomically consume selected annotations."""

import argparse
import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--annotation", action="append", required=True)
    args = parser.parse_args()

    workspace = Path(args.workspace).resolve(strict=True)
    checkpoint = workspace / "video.review.json"
    raw = checkpoint.read_bytes()
    project = json.loads(raw)
    requested = set(args.annotation)
    existing = {item.get("id") for item in project.get("annotations", [])}
    missing = requested - existing
    if missing:
        raise SystemExit(f"Annotations absentes du checkpoint actif: {', '.join(sorted(missing))}")

    archive_dir = workspace / ".framebrief" / "reviews"
    archive_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    digest = hashlib.sha256(raw).hexdigest()[:10]
    archive = archive_dir / f"review-{stamp}-{digest}.json"
    archive.write_bytes(raw)

    project["annotations"] = [
        item for item in project.get("annotations", []) if item.get("id") not in requested
    ]
    project["updatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    encoded = (json.dumps(project, ensure_ascii=False, indent=2) + "\n").encode()
    fd, temp_name = tempfile.mkstemp(prefix="video.review.", suffix=".tmp", dir=workspace)
    try:
        with os.fdopen(fd, "wb") as temp:
            temp.write(encoded)
            temp.flush()
            os.fsync(temp.fileno())
        if checkpoint.read_bytes() != raw:
            raise SystemExit("Le checkpoint a changé pendant le traitement; aucune annotation consommée.")
        os.replace(temp_name, checkpoint)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)

    print(json.dumps({
        "archive": str(archive),
        "consumed": sorted(requested),
        "remaining": len(project["annotations"]),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
