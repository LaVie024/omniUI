# omniUI

Lightweight node-based frontend for building and running Diffusers workflows.

## Current scaffolding

- **ComfyUI-like layout** with a left sidebar and top workflow tab bar.
- **Lightweight editor rendering** using plain DOM + SVG (no WebGL requirement).
- **Workflow tabs** to work across multiple graphs.
- **Modular node architecture** in `nodes/` with core + media nodes.
- **Custom node loading scaffold** via `custom_nodes/*.py` (`register(registry)` convention).
- **Model-aware node set**:
  - Load Components (`checkpoint` or `diffusers_directory`)
  - Load LoRA
  - Text Encode
  - Sampler
  - Decode
  - Save Image
  - Save Video
  - Save Audio
- **Workflow persistence** in `workflows/*.json` and local import/export from UI.
- **Model discovery from local directories**:
  - `models/checkpoints`
  - `models/vae`
  - `models/loras`
- **Runtime + execution scaffolding**:
  - PyTorch runtime introspection endpoint (`/api/runtime`)
  - Node catalog endpoint (`/api/nodes`)
  - `/api/run` compiles workflow and attempts diffusers pipeline construction

## Directory structure

```text
nodes/
  core.py
  media.py
  registry.py
custom_nodes/
models/
  checkpoints/
  vae/
  loras/
workflows/
static/
app.py
pipeline_builder.py
runtime.py
```

## API

- `GET /api/nodes` list built-in and loaded custom node specs
- `GET /api/models` list discovered checkpoints, VAE files, and LoRAs from `models/`
- `GET /api/runtime` report torch/cuda runtime capabilities
- `GET /api/workflows` list workflows
- `GET /api/workflows/{name}` load workflow
- `POST /api/workflows/{name}` save workflow JSON
- `POST /api/run` compile workflow + scaffold generation + attempt diffusers pipeline build

## Install and run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload
```

Open http://localhost:8000
