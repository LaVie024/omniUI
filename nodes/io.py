from __future__ import annotations

from .registry import NodeRegistry, NodeSpec


def register_io_nodes(registry: NodeRegistry) -> None:
    registry.register(
        NodeSpec(
            name="Load Image",
            category="Input",
            inputs=[],
            outputs=["Image"],
            params={"fileName": ""},
        )
    )
    registry.register(
        NodeSpec(
            name="Load Video",
            category="Input",
            inputs=[],
            outputs=["Image"],
            params={"fileName": ""},
        )
    )
    registry.register(
        NodeSpec(
            name="Load Audio",
            category="Input",
            inputs=[],
            outputs=["Audio"],
            params={"fileName": ""},
        )
    )
