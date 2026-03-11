from __future__ import annotations

from .registry import NodeRegistry, NodeSpec


def register_core_nodes(registry: NodeRegistry) -> None:
    registry.register(
        NodeSpec(
            name="Load Components",
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
            inputs=["Model"],
            outputs=["Model"],
            params={"loraName": "", "scale": 1.0},
        )
    )
    registry.register(
        NodeSpec(
            name="Text Encode",
            inputs=["TE"],
            outputs=["Conditioning"],
            params={"text": ""},
        )
    )
    registry.register(
        NodeSpec(
            name="Sampler",
            inputs=["Model", "Conditioning"],
            outputs=["Latents"],
            params={"steps": 20, "guidance": 7.5, "width": 512, "height": 512},
        )
    )
    registry.register(
        NodeSpec(
            name="Decode",
            inputs=["Latents", "VAE"],
            outputs=["Image"],
            params={},
        )
    )
