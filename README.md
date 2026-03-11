# omniUI

Lightweight node-based frontend for building and running Diffusers workflows.

## Current scaffolding

- **ComfyUI-like layout** with a left sidebar and top workflow tab bar.
- **Lightweight editor rendering** using plain DOM + SVG (no WebGL requirement).
- **Workflow tabs** to work across multiple graphs.
- **Model-aware node set**:
  - Load Components (`checkpoint` or `diffusers_directory`)
  - Load LoRA
  - Text Encode
  - Sampler
  - Decode
  - Save Image
- **Workflow persistence**:
  - server-side save/load in `workflows/*.json`
  - local import/export JSON in the UI
- **Model discovery from local directories**:
  - `models/checkpoints`
  - `models/vae`
  - `models/loras`
- **Generation/runtime scaffolding**:
  - PyTorch runtime introspection endpoint (`/api/runtime`)
  - run endpoint emits generation scaffold configured for CUDA when available

## Directory structure

```text
models/
  checkpoints/
  vae/
  loras/
workflows/
static/
app.py
runtime.py
```

## API

- `GET /api/models` list discovered checkpoints, VAE files, and LoRAs from `models/`
- `GET /api/runtime` report torch/cuda runtime capabilities
- `GET /api/workflows` list workflows
- `GET /api/workflows/{name}` load workflow
- `POST /api/workflows/{name}` save workflow JSON
- `POST /api/run` compile workflow to Diffusers plan + generation scaffold

## Install and run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload
```

Open http://localhost:8000

## NVIDIA GPU note

Install the matching CUDA build of PyTorch for your NVIDIA driver/runtime if needed. The runtime endpoint will automatically report whether CUDA is available and the active device.
