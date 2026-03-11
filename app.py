from __future__ import annotations

import json
import shutil
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from nodes import build_registry
from pipeline_builder import build_diffusers_pipeline
from runtime import get_runtime_info, scaffold_generation_request

ROOT = Path(__file__).parent
WORKFLOW_DIR = ROOT / "workflows"
MODELS_DIR = ROOT / "models"
INPUT_DIR = ROOT / "input"
OUTPUT_DIR = ROOT / "output"
TEMP_DIR = ROOT / "temp"
CHECKPOINTS_DIR = MODELS_DIR / "checkpoints"
VAE_DIR = MODELS_DIR / "vae"
LORA_DIR = MODELS_DIR / "loras"
CUSTOM_NODES_DIR = ROOT / "custom_nodes"

for directory in [
    WORKFLOW_DIR,
    INPUT_DIR,
    OUTPUT_DIR,
    TEMP_DIR,
    CHECKPOINTS_DIR,
    VAE_DIR,
    LORA_DIR,
    CUSTOM_NODES_DIR,
]:
    directory.mkdir(parents=True, exist_ok=True)

NODE_REGISTRY, LOADED_CUSTOM_NODES = build_registry(CUSTOM_NODES_DIR)


@asynccontextmanager
async def lifespan(_: FastAPI):
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    yield
    if TEMP_DIR.exists():
        shutil.rmtree(TEMP_DIR, ignore_errors=True)


app = FastAPI(title="OmniUI", version="0.4.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


class WorkflowPayload(BaseModel):
    workflow: dict[str, Any]


class RunPayload(BaseModel):
    workflow: dict[str, Any]


def _list_model_files(directory: Path, allowed_suffixes: set[str]) -> list[str]:
    return sorted(
        path.name
        for path in directory.iterdir()
        if path.is_file() and path.suffix.lower() in allowed_suffixes
    )


def _default_output_subdir(preview: bool) -> str:
    return str(TEMP_DIR if preview else OUTPUT_DIR / date.today().isoformat())


@app.get("/")
def index() -> FileResponse:
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/api/runtime")
def runtime_info() -> dict[str, Any]:
    return get_runtime_info()


@app.get("/api/nodes")
def list_nodes() -> dict[str, Any]:
    return {"nodes": NODE_REGISTRY.as_dict(), "loaded_custom_nodes": LOADED_CUSTOM_NODES}


@app.get("/api/models")
def list_models() -> dict[str, list[str]]:
    return {
        "checkpoints": _list_model_files(CHECKPOINTS_DIR, {".safetensors", ".ckpt", ".pt"}),
        "vae": _list_model_files(VAE_DIR, {".safetensors", ".pt"}),
        "loras": _list_model_files(LORA_DIR, {".safetensors", ".pt"}),
    }


@app.get("/api/input")
def list_input_media() -> dict[str, list[str]]:
    return {
        "images": _list_model_files(INPUT_DIR, {".png", ".jpg", ".jpeg", ".webp"}),
        "videos": _list_model_files(INPUT_DIR, {".mp4", ".webm", ".mov", ".mkv"}),
        "audio": _list_model_files(INPUT_DIR, {".wav", ".mp3", ".flac", ".ogg", ".m4a"}),
    }


@app.get("/api/workflows")
def list_workflows() -> dict[str, list[str]]:
    names = sorted(path.stem for path in WORKFLOW_DIR.glob("*.json"))
    return {"workflows": names}


@app.get("/api/workflows/{name}")
def get_workflow(name: str) -> dict[str, Any]:
    file_path = WORKFLOW_DIR / f"{name}.json"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Workflow not found")
    return json.loads(file_path.read_text())


@app.post("/api/workflows/{name}")
def save_workflow(name: str, payload: WorkflowPayload) -> dict[str, str]:
    file_path = WORKFLOW_DIR / f"{name}.json"
    file_path.write_text(json.dumps(payload.workflow, indent=2))
    return {"status": "saved", "name": name}


def compile_to_diffusers_plan(workflow: dict[str, Any]) -> dict[str, Any]:
    nodes = {node["id"]: node for node in workflow.get("nodes", [])}
    edges = workflow.get("edges", [])

    incoming: dict[str, list[dict[str, Any]]] = {node_id: [] for node_id in nodes}
    for edge in edges:
        target = edge.get("to")
        if target in incoming:
            incoming[target].append(edge)

    plan_nodes: list[dict[str, Any]] = []
    for node_id, node in nodes.items():
        node_type = node.get("type")
        params = node.get("params", {})

        if node_type == "Load Components":
            source_mode = params.get("sourceMode")
            if source_mode not in {"checkpoint", "diffusers_directory"}:
                raise ValueError(
                    "Load Components.sourceMode must be 'checkpoint' or 'diffusers_directory'"
                )
            plan_nodes.append(
                {
                    "id": node_id,
                    "op": "load_components",
                    "source_mode": source_mode,
                    "model_name": params.get("modelName", ""),
                    "model_path": params.get("modelPath", ""),
                    "vae_name": params.get("vaeName", ""),
                    "vae_path": params.get("vaePath", ""),
                    "load_vae_externally": bool(params.get("loadVaeExternally", False)),
                    "outputs": ["Model", "TE", "VAE"],
                }
            )
        elif node_type == "Load LoRA":
            plan_nodes.append(
                {
                    "id": node_id,
                    "op": "load_lora",
                    "lora_name": params.get("loraName", ""),
                    "scale": float(params.get("scale", 1.0)),
                    "inputs": incoming.get(node_id, []),
                    "outputs": ["Model"],
                }
            )
        elif node_type in {"Load Image", "Load Video", "Load Audio"}:
            plan_nodes.append(
                {
                    "id": node_id,
                    "op": node_type.lower().replace(" ", "_"),
                    "input_path": str(INPUT_DIR / params.get("fileName", "")),
                    "inputs": incoming.get(node_id, []),
                }
            )
        elif node_type == "Text Encode":
            plan_nodes.append(
                {
                    "id": node_id,
                    "op": "text_encode",
                    "text": params.get("text", ""),
                    "inputs": incoming.get(node_id, []),
                    "outputs": ["Conditioning"],
                }
            )
        elif node_type == "Sampler":
            node_inputs = incoming.get(node_id, [])
            plan_nodes.append(
                {
                    "id": node_id,
                    "op": "sample_latents",
                    "steps": int(params.get("steps", 20)),
                    "guidance": float(params.get("guidance", 7.5)),
                    "width": int(params.get("width", 512)),
                    "height": int(params.get("height", 512)),
                    "inputs": node_inputs,
                    "positive_conditioning_connected": any(
                        edge.get("in") == "Positive Conditioning" for edge in node_inputs
                    ),
                    "negative_conditioning_connected": any(
                        edge.get("in") == "Negative Conditioning" for edge in node_inputs
                    ),
                    "negative_fallback_mode": "zeroed_positive_if_unset",
                    "outputs": ["Latents"],
                }
            )
        elif node_type == "Empty Latent Image":
            plan_nodes.append(
                {
                    "id": node_id,
                    "op": "empty_latent_image",
                    "width": int(params.get("width", 512)),
                    "height": int(params.get("height", 512)),
                    "batch_size": int(params.get("batchSize", 1)),
                    "outputs": ["Latents"],
                }
            )
        elif node_type == "Decode":
            plan_nodes.append(
                {
                    "id": node_id,
                    "op": "decode_latents",
                    "inputs": incoming.get(node_id, []),
                    "outputs": ["Image"],
                }
            )
        elif node_type in {
            "Save Image",
            "Save Video",
            "Save Audio",
            "Preview Save Image",
            "Preview Save Video",
            "Preview Save Audio",
        }:
            preview = node_type.startswith("Preview")
            op = node_type.lower().replace(" ", "_")
            node_plan = {
                "id": node_id,
                "op": op,
                "filename_prefix": params.get("prefix", "output"),
                "output_dir": _default_output_subdir(preview=preview),
                "inputs": incoming.get(node_id, []),
            }
            if "fps" in params:
                node_plan["fps"] = int(params.get("fps", 8))
            if "sampleRate" in params:
                node_plan["sample_rate"] = int(params.get("sampleRate", 44100))
            plan_nodes.append(node_plan)

    return {
        "pipeline": "DiffusersGraphPipeline",
        "runtime": get_runtime_info(),
        "node_count": len(plan_nodes),
        "nodes": plan_nodes,
    }


@app.post("/api/run")
def run_workflow(payload: RunPayload) -> dict[str, Any]:
    try:
        pipeline_plan = compile_to_diffusers_plan(payload.workflow)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    generation_scaffold = scaffold_generation_request(pipeline_plan)
    build_result = build_diffusers_pipeline(pipeline_plan, MODELS_DIR)

    return {
        "status": "ok",
        "message": "Workflow compiled to a Diffusers pipeline plan and pipeline build was attempted.",
        "plan": pipeline_plan,
        "generation_scaffold": generation_scaffold,
        "pipeline_build": build_result,
    }
