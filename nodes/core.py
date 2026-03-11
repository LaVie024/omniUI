from __future__ import annotations

from .registry import NodeRegistry, NodeSpec


def register_core_nodes(registry: NodeRegistry) -> None:
    registry.register(
        NodeSpec(
            name="Load Components",
            category="Model Loading",
            inputs=[],
            outputs=["Model", "TE", "VAE"],
            params={
                "sourceMode": "checkpoint",
                "modelName": "",
                "modelPath": "",
                "vaeName": "",
                "vaePath": "",
            },
        )
    )
    registry.register(
        NodeSpec(
            name="Load LoRA",
            category="Model Loading",
            inputs=["Model"],
            outputs=["Model"],
            params={"loraName": "", "scale": 1.0},
        )
    )
    registry.register(
        NodeSpec(
            name="Text Encode",
            category="Conditioning",
            inputs=["TE"],
            outputs=["Conditioning"],
            params={"text": ""},
        )
    )
    registry.register(
        NodeSpec(
            name="Sampler",
            category="Generation",
            inputs=["Model", "Conditioning"],
            outputs=["Latents"],
            params={"steps": 20, "guidance": 7.5, "width": 512, "height": 512},
        )
    )
    registry.register(
        NodeSpec(
            name="Decode",
            category="Generation",
            inputs=["Latents", "VAE"],
            outputs=["Image"],
            params={},
        )
    )
