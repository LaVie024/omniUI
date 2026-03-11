from __future__ import annotations

from .registry import NodeRegistry, NodeSpec


def register_media_nodes(registry: NodeRegistry) -> None:
    registry.register(
        NodeSpec(
            name="Save Image",
            category="Output",
            inputs=["Image"],
            outputs=[],
            params={"prefix": "output"},
        )
    )
    registry.register(
        NodeSpec(
            name="Save Video",
            category="Output",
            inputs=["Image"],
            outputs=[],
            params={"prefix": "output_video", "fps": 8},
        )
    )
    registry.register(
        NodeSpec(
            name="Save Audio",
            category="Output",
            inputs=["Audio"],
            outputs=[],
            params={"prefix": "output_audio", "sampleRate": 44100},
        )
    )
    registry.register(
        NodeSpec(
            name="Preview Save Image",
            category="Preview",
            inputs=["Image"],
            outputs=[],
            params={"prefix": "preview"},
        )
    )
    registry.register(
        NodeSpec(
            name="Preview Save Video",
            category="Preview",
            inputs=["Image"],
            outputs=[],
            params={"prefix": "preview_video", "fps": 8},
        )
    )
    registry.register(
        NodeSpec(
            name="Preview Save Audio",
            category="Preview",
            inputs=["Audio"],
            outputs=[],
            params={"prefix": "preview_audio", "sampleRate": 44100},
        )
    )
