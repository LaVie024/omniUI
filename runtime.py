from __future__ import annotations

from typing import Any

try:
    import torch
except Exception:  # pragma: no cover - fallback for environments without torch
    torch = None


def get_runtime_info() -> dict[str, Any]:
    if torch is None:
        return {
            "torch_version": None,
            "cuda_available": False,
            "cuda_version": None,
            "device": "cpu",
            "gpu_name": None,
            "supports_amp": False,
            "warning": "PyTorch not installed yet. Install requirements to enable runtime detection.",
        }

    cuda_available = torch.cuda.is_available()
    device = "cuda" if cuda_available else "cpu"

    return {
        "torch_version": torch.__version__,
        "cuda_available": cuda_available,
        "cuda_version": torch.version.cuda,
        "device": device,
        "gpu_name": torch.cuda.get_device_name(0) if cuda_available else None,
        "supports_amp": cuda_available,
    }


def scaffold_generation_request(plan: dict[str, Any]) -> dict[str, Any]:
    runtime = get_runtime_info()
    return {
        "device": runtime["device"],
        "autocast_dtype": "float16" if runtime["cuda_available"] else "float32",
        "scheduler": "default",
        "enable_attention_slicing": True,
        "enable_xformers": runtime["cuda_available"],
        "pipeline_plan": plan,
        "notes": [
            "Scaffold only: wire this to concrete Diffusers pipeline construction.",
            "For NVIDIA GPUs, keep tensors and models on cuda when available.",
        ],
    }
