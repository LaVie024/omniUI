# omniUI

Lightweight node-based frontend for building and running Diffusers workflows.

## What is set up

- **Node editor UI** with draggable nodes and lightweight DOM+SVG rendering (no WebGL dependency).
- **ComfyUI-like layout** with a left sidebar for node palette and a topbar for workflow tabs.
- **Workflow tabs** to switch between multiple workflows in one session.
- **Basic node set**:
  - Load Components (supports `checkpoint` and `diffusers_directory` modes)
  - Text Encode
  - Sampler
  - Decode
  - Save Image
- **Workflow JSON support**:
  - Save to server as `workflows/*.json`
  - Export/import JSON locally
- **Run endpoint** that compiles the graph into a Diffusers pipeline execution plan.

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload
```

Open http://localhost:8000

## Notes

- Node and port names intentionally avoid specific model family names for futureproofing.
- Backend compilation currently returns a structured pipeline plan suitable for execution workers.
