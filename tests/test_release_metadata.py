"""Release metadata must stay consistent across the installable packages."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).parents[1]


def _read_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def test_backend_and_frontend_versions_match() -> None:
    """Prevent a release from shipping mismatched backend and card versions."""
    manifest = _read_json(ROOT / "custom_components/cyclic_countdown/manifest.json")
    package = _read_json(ROOT / "frontend/package.json")

    assert manifest["version"] == package["version"]


def test_release_version_uses_supported_semver() -> None:
    """Keep cache-busting and HACS release versions predictable."""
    manifest = _read_json(ROOT / "custom_components/cyclic_countdown/manifest.json")

    assert re.fullmatch(
        r"\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?",
        str(manifest["version"]),
    )


def test_release_tag_matches_manifest_version() -> None:
    """Reject a GitHub release tag that points at a differently versioned build."""
    if os.environ.get("GITHUB_REF_TYPE") != "tag":
        return
    manifest = _read_json(ROOT / "custom_components/cyclic_countdown/manifest.json")

    assert os.environ.get("GITHUB_REF_NAME") == f"v{manifest['version']}"
