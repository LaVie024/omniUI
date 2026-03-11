from __future__ import annotations

from pathlib import Path

from .core import register_core_nodes
from .media import register_media_nodes
from .registry import NodeRegistry, load_custom_nodes


def build_registry(custom_nodes_dir: Path) -> tuple[NodeRegistry, list[str]]:
    registry = NodeRegistry()
    register_core_nodes(registry)
    register_media_nodes(registry)
    loaded_custom = load_custom_nodes(registry, custom_nodes_dir)
    return registry, loaded_custom
