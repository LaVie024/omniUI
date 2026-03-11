from __future__ import annotations

import importlib.util
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any


@dataclass
class NodeSpec:
    name: str
    inputs: list[Any]
    outputs: list[Any]
    params: dict[str, Any]
    category: str = "Other"


class NodeRegistry:
    def __init__(self) -> None:
        self._nodes: dict[str, NodeSpec] = {}

    def register(self, spec: NodeSpec) -> None:
        self._nodes[spec.name] = spec

    def get(self, name: str) -> NodeSpec | None:
        return self._nodes.get(name)

    def as_dict(self) -> dict[str, dict[str, Any]]:
        return {name: asdict(spec) for name, spec in self._nodes.items()}


def load_custom_nodes(registry: NodeRegistry, custom_nodes_dir: Path) -> list[str]:
    loaded: list[str] = []
    if not custom_nodes_dir.exists():
        return loaded

    for file_path in sorted(custom_nodes_dir.glob("*.py")):
        if file_path.name.startswith("_"):
            continue

        module_name = f"custom_nodes.{file_path.stem}"
        spec = importlib.util.spec_from_file_location(module_name, file_path)
        if spec is None or spec.loader is None:
            continue

        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        register_fn = getattr(module, "register", None)
        if callable(register_fn):
            register_fn(registry)
            loaded.append(file_path.name)

    return loaded
