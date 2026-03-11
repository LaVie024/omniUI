from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).parent
WORKFLOW_DIR = ROOT / "workflows"
WORKFLOW_DIR.mkdir(exist_ok=True)

app = FastAPI(title="OmniUI", version="0.1.0")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


class WorkflowPayload(BaseModel):
    workflow: dict[str, Any]


class RunPayload(BaseModel):
    workflow: dict[str, Any]


@app.get("/")
def index() -> FileResponse:
    return FileResponse(ROOT / "static" / "index.html")


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
    """Compile a frontend workflow graph into an execution plan that maps to Diffusers."""
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
                    "model_path": params.get("modelPath", ""),
                    "vae_path": params.get("vaePath", ""),
                    "outputs": ["Model", "TE", "VAE"],
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
            plan_nodes.append(
                {
                    "id": node_id,
                    "op": "sample_latents",
                    "steps": int(params.get("steps", 20)),
                    "guidance": float(params.get("guidance", 7.5)),
                    "width": int(params.get("width", 512)),
                    "height": int(params.get("height", 512)),
                    "inputs": incoming.get(node_id, []),
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
        elif node_type == "Save Image":
            plan_nodes.append(
                {
                    "id": node_id,
                    "op": "save_image",
                    "filename_prefix": params.get("prefix", "output"),
                    "inputs": incoming.get(node_id, []),
                }
            )

    return {
        "pipeline": "DiffusersGraphPipeline",
        "node_count": len(plan_nodes),
        "nodes": plan_nodes,
    }


@app.post("/api/run")
def run_workflow(payload: RunPayload) -> dict[str, Any]:
    try:
        pipeline_plan = compile_to_diffusers_plan(payload.workflow)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # TODO: map plan into concrete diffusers objects for execution workers.
    return {
        "status": "ok",
        "message": "Workflow compiled to a Diffusers pipeline plan.",
        "plan": pipeline_plan,
    }
