from __future__ import annotations

from pathlib import Path
from typing import Any


def _find_load_components_node(plan: dict[str, Any]) -> dict[str, Any] | None:
    for node in plan.get("nodes", []):
        if node.get("op") == "load_components":
            return node
    return None


def build_diffusers_pipeline(plan: dict[str, Any], models_dir: Path) -> dict[str, Any]:
    load_node = _find_load_components_node(plan)
    if not load_node:
        return {"built": False, "reason": "No Load Components node in workflow."}

    try:
        from diffusers import StableDiffusionPipeline
    except Exception as exc:  # pragma: no cover
        return {"built": False, "reason": f"Diffusers unavailable: {exc}"}

    source_mode = load_node.get("source_mode")
    model_name = load_node.get("model_name") or ""
    model_path = load_node.get("model_path") or ""
    load_vae_externally = bool(load_node.get("load_vae_externally", False))
    vae_name = load_node.get("vae_name") or ""
    vae_path = load_node.get("vae_path") or ""

    if source_mode == "checkpoint":
        if model_name:
            source = models_dir / "checkpoints" / model_name
        elif model_path:
            source = Path(model_path)
        else:
            return {"built": False, "reason": "Checkpoint source missing modelName/modelPath."}

        if not source.exists():
            return {"built": False, "reason": f"Checkpoint not found: {source}"}

        StableDiffusionPipeline.from_single_file(str(source))
        return {
            "built": True,
            "source_mode": source_mode,
            "source": str(source),
            "pipeline_class": "StableDiffusionPipeline",
            "load_vae_externally": load_vae_externally,
            "vae_source": str((models_dir / "vae" / vae_name) if vae_name else vae_path) if load_vae_externally else "from_checkpoint",
        }

    if source_mode == "diffusers_directory":
        source = Path(model_path)
        if not source.exists():
            return {"built": False, "reason": f"Diffusers directory not found: {source}"}

        StableDiffusionPipeline.from_pretrained(str(source))
        return {
            "built": True,
            "source_mode": source_mode,
            "source": str(source),
            "pipeline_class": "StableDiffusionPipeline",
            "load_vae_externally": load_vae_externally,
            "vae_source": str((models_dir / "vae" / vae_name) if vae_name else vae_path) if load_vae_externally else "from_checkpoint",
        }

    return {"built": False, "reason": f"Unsupported source mode: {source_mode}"}
