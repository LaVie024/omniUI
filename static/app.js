const GRID_SIZE = 24;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2;

const state = {
  nodeDefs: {},
  workflows: [],
  activeWorkflowId: null,
  linking: null,
  models: { checkpoints: [], vae: [], loras: [] },
  inputMedia: { images: [], videos: [], audio: [] },
  runtime: null,
  customNodes: [],
  viewport: { x: 0, y: 0, scale: 1 },
  pan: null,
  selectedNodeId: null,
  cursorWorld: { x: 0, y: 0 },
};

const canvasWrap = document.getElementById("canvasWrap");
const graphSurface = document.getElementById("graphSurface");
const canvas = document.getElementById("canvas");
const edgeLayer = document.getElementById("edgeLayer");
const coordHud = document.getElementById("coordHud");
const tabList = document.getElementById("tabList");
const runOutput = document.getElementById("runOutput");
const modelRegistry = document.getElementById("modelRegistry");
const runtimeInfo = document.getElementById("runtimeInfo");
const customNodesInfo = document.getElementById("customNodesInfo");
const nodeSearchOverlay = document.getElementById("nodeSearchOverlay");
const nodeSearchInput = document.getElementById("nodeSearchInput");
const nodeSearchResults = document.getElementById("nodeSearchResults");

const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const nodeId = entry.target.dataset.nodeId;
    const wf = activeWorkflow();
    const node = wf?.nodes.find((n) => n.id === nodeId);
    if (!node) continue;
    node.width = Math.round(entry.contentRect.width);
    node.height = Math.round(entry.contentRect.height);
  }
});

function newWorkflow(name = `workflow-${Date.now()}`) {
  return { id: crypto.randomUUID(), name, nodes: [], edges: [] };
}

function activeWorkflow() {
  return state.workflows.find((wf) => wf.id === state.activeWorkflowId);
}

function snap(value) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function screenToWorld(screenX, screenY) {
  const rect = canvasWrap.getBoundingClientRect();
  return {
    x: (screenX - rect.left - state.viewport.x) / state.viewport.scale,
    y: (screenY - rect.top - state.viewport.y) / state.viewport.scale,
  };
}

function zoomAt(screenX, screenY, deltaY) {
  const oldScale = state.viewport.scale;
  const zoomFactor = deltaY < 0 ? 1.1 : 0.9;
  const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldScale * zoomFactor));
  if (newScale === oldScale) return;

  const rect = canvasWrap.getBoundingClientRect();
  const localX = screenX - rect.left;
  const localY = screenY - rect.top;
  const worldX = (localX - state.viewport.x) / oldScale;
  const worldY = (localY - state.viewport.y) / oldScale;

  state.viewport.scale = newScale;
  state.viewport.x = localX - worldX * newScale;
  state.viewport.y = localY - worldY * newScale;
  applyViewport();
  renderEdges();
}

function applyViewport() {
  graphSurface.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.scale})`;
  const scaledGrid = GRID_SIZE * state.viewport.scale;
  const offsetX = ((state.viewport.x % scaledGrid) + scaledGrid) % scaledGrid;
  const offsetY = ((state.viewport.y % scaledGrid) + scaledGrid) % scaledGrid;
  canvasWrap.style.setProperty("--grid-size", `${scaledGrid}px`);
  canvasWrap.style.setProperty("--grid-offset-x", `${offsetX}px`);
  canvasWrap.style.setProperty("--grid-offset-y", `${offsetY}px`);
}

function updateCoordHud(x, y) {
  coordHud.textContent = `X: ${Math.round(x)}  Y: ${Math.round(y)}`;
}

async function init() {
  const wf = newWorkflow("workflow-1");
  state.workflows.push(wf);
  state.activeWorkflowId = wf.id;
  await loadEnvironmentData();
  renderPalette();
  renderTabs();
  bindViewportControls();
  bindNodeSearch();
  renderCanvas();
}

async function loadEnvironmentData() {
  try {
    const [nodesRes, modelsRes, inputRes, runtimeRes] = await Promise.all([
      fetch("/api/nodes"),
      fetch("/api/models"),
      fetch("/api/input"),
      fetch("/api/runtime"),
    ]);
    const nodePayload = await nodesRes.json();
    state.nodeDefs = nodePayload.nodes || {};
    state.customNodes = nodePayload.loaded_custom_nodes || [];
    state.models = await modelsRes.json();
    state.inputMedia = await inputRes.json();
    state.runtime = await runtimeRes.json();
  } catch {
    state.nodeDefs = {};
    state.customNodes = [];
    state.models = { checkpoints: [], vae: [], loras: [] };
    state.inputMedia = { images: [], videos: [], audio: [] };
    state.runtime = null;
  }
  renderModelRegistry();
  renderRuntimeInfo();
  renderCustomNodes();
}

function nodeCategories() {
  const categories = {};
  Object.entries(state.nodeDefs).forEach(([type, def]) => {
    const category = def.category || "Other";
    categories[category] ??= [];
    categories[category].push(type);
  });
  Object.values(categories).forEach((items) => items.sort((a, b) => a.localeCompare(b)));
  return Object.entries(categories).sort(([a], [b]) => a.localeCompare(b));
}

function renderPalette() {
  const palette = document.getElementById("nodePalette");
  palette.innerHTML = "";

  nodeCategories().forEach(([category, types], idx) => {
    const details = document.createElement("details");
    details.className = "palette-group";
    if (idx === 0) details.open = true;

    const summary = document.createElement("summary");
    summary.textContent = category;
    details.appendChild(summary);

    const list = document.createElement("div");
    list.className = "palette-group-items";

    types.forEach((type) => {
      const btn = document.createElement("button");
      btn.className = "palette-item";
      btn.textContent = type;
      btn.onclick = () => addNode(type);
      list.appendChild(btn);
    });

    details.appendChild(list);
    palette.appendChild(details);
  });
}

function renderCustomNodes() {
  customNodesInfo.textContent = state.customNodes.length
    ? JSON.stringify(state.customNodes, null, 2)
    : "No custom nodes loaded from custom_nodes/*.py";
}

function renderModelRegistry() {
  modelRegistry.textContent = JSON.stringify(state.models, null, 2);
}

function renderRuntimeInfo() {
  runtimeInfo.textContent = state.runtime
    ? JSON.stringify(state.runtime, null, 2)
    : "Runtime unavailable";
}

function addNode(type, worldPosition) {
  const wf = activeWorkflow();
  const def = state.nodeDefs[type];
  const base = worldPosition || { x: 80 + wf.nodes.length * 24, y: 80 + wf.nodes.length * 24 };
  wf.nodes.push({
    id: crypto.randomUUID(),
    type,
    title: type,
    x: snap(base.x),
    y: snap(base.y),
    width: 240,
    height: 140,
    color: "",
    params: structuredClone(def.params || {}),
  });
  renderCanvas();
}

function renderTabs() {
  tabList.innerHTML = "";
  state.workflows.forEach((wf) => {
    const tab = document.createElement("button");
    tab.className = `tab ${wf.id === state.activeWorkflowId ? "active" : ""}`;
    tab.textContent = wf.name;
    tab.onclick = () => {
      state.activeWorkflowId = wf.id;
      renderTabs();
      renderCanvas();
    };
    tabList.appendChild(tab);
  });
}

function parsePortSpec(spec) {
  if (typeof spec === "string") return { name: spec, optional: false };
  return { name: spec?.name || "port", optional: Boolean(spec?.optional) };
}

function renderCanvas() {
  const wf = activeWorkflow();
  canvas.innerHTML = "";

  wf.nodes.forEach((node) => {
    const def = state.nodeDefs[node.type] || { inputs: [], outputs: [] };
    const el = document.createElement("div");
    el.className = `node ${state.selectedNodeId === node.id ? "selected" : ""}`;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.style.width = `${node.width || 240}px`;
    if (node.height) el.style.minHeight = `${Math.max(node.height, 90)}px`;
    if (node.color) el.style.background = node.color;
    el.dataset.nodeId = node.id;
    el.onclick = (event) => {
      event.stopPropagation();
      state.selectedNodeId = node.id;
      renderCanvas();
    };

    const header = document.createElement("div");
    header.className = "node-header";
    header.textContent = node.title || node.type;
    header.ondblclick = (event) => {
      event.stopPropagation();
      const renamed = prompt("Rename node", node.title || node.type);
      if (!renamed) return;
      node.title = renamed.trim();
      renderCanvas();
    };
    enableDrag(header, node);
    el.appendChild(header);

    if (state.selectedNodeId === node.id) {
      const controls = document.createElement("div");
      controls.className = "node-controls";

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete";
      deleteBtn.onclick = (event) => {
        event.stopPropagation();
        deleteNode(node.id);
      };

      const recolorBtn = document.createElement("button");
      recolorBtn.textContent = "Recolor";
      recolorBtn.onclick = (event) => {
        event.stopPropagation();
        const color = prompt("Node color (CSS value)", node.color || "#1a1f29");
        if (!color) return;
        node.color = color;
        renderCanvas();
      };

      controls.append(deleteBtn, recolorBtn);
      el.appendChild(controls);
    }

    Object.entries(node.params || {}).forEach(([key, value]) => {
      const input = buildParamInput(key, value);
      input.onchange = () => {
        node.params[key] = input.value;
      };
      el.appendChild(labelWrap(key, input));
    });

    (def.inputs || []).forEach((portSpec) => {
      const parsed = parsePortSpec(portSpec);
      el.appendChild(portRow(parsed, "input", node.id));
    });
    (def.outputs || []).forEach((portSpec) => {
      const parsed = parsePortSpec(portSpec);
      el.appendChild(portRow(parsed, "output", node.id));
    });

    canvas.appendChild(el);
    resizeObserver.observe(el);
  });

  renderEdges();
  applyViewport();
}

function deleteNode(nodeId) {
  const wf = activeWorkflow();
  wf.nodes = wf.nodes.filter((n) => n.id !== nodeId);
  wf.edges = wf.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
  if (state.selectedNodeId === nodeId) state.selectedNodeId = null;
  renderCanvas();
}

function buildParamInput(key, value) {
  if (key === "sourceMode") {
    const select = document.createElement("select");
    ["checkpoint", "diffusers_directory"].forEach((mode) => {
      const opt = document.createElement("option");
      opt.value = mode;
      opt.textContent = mode;
      select.appendChild(opt);
    });
    select.value = value;
    return select;
  }

  if (key === "fileName") {
    const select = document.createElement("select");
    const allMedia = [
      ...state.inputMedia.images,
      ...state.inputMedia.videos,
      ...state.inputMedia.audio,
    ];
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "(select from input/)";
    select.appendChild(blank);
    allMedia.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option;
      opt.textContent = option;
      select.appendChild(opt);
    });
    select.value = value;
    return select;
  }

  if (key === "modelName" || key === "vaeName" || key === "loraName") {
    const select = document.createElement("select");
    const options =
      key === "modelName"
        ? state.models.checkpoints
        : key === "vaeName"
          ? state.models.vae
          : state.models.loras;
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "(select from models/)";
    select.appendChild(blank);
    options.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option;
      opt.textContent = option;
      select.appendChild(opt);
    });
    select.value = value;
    return select;
  }

  const input = document.createElement(key.includes("text") ? "textarea" : "input");
  input.value = value;
  return input;
}

function labelWrap(label, inputEl) {
  const wrap = document.createElement("label");
  wrap.textContent = label;
  wrap.appendChild(inputEl);
  return wrap;
}

function portRow(portSpec, direction, nodeId) {
  const row = document.createElement("div");
  row.className = "port-row";

  const left = document.createElement("div");
  left.className = "port-input-wrap";

  const right = document.createElement("div");
  right.className = "port-output-wrap";

  const label = document.createElement("span");
  label.className = "port-label";
  label.textContent = portSpec.name;

  const dot = document.createElement("button");
  dot.className = `port ${portSpec.optional ? "optional" : ""}`;
  dot.dataset.nodeId = nodeId;
  dot.dataset.direction = direction;
  dot.dataset.portName = portSpec.name;
  dot.onclick = (event) => {
    event.stopPropagation();
    clickPort({ nodeId, direction, name: portSpec.name, optional: portSpec.optional });
  };

  if (
    state.linking &&
    state.linking.nodeId === nodeId &&
    state.linking.direction === direction &&
    state.linking.name === portSpec.name
  ) {
    dot.classList.add("active");
  }

  if (direction === "input") {
    left.append(dot, label);
    row.appendChild(left);
  } else {
    right.append(label, dot);
    row.appendChild(right);
  }

  return row;
}

function clickPort(port) {
  if (!state.linking) {
    if (port.direction !== "output") return;
    state.linking = port;
    renderEdges();
    return;
  }

  if (port.direction === "output") {
    state.linking = port;
    renderEdges();
    return;
  }

  const wf = activeWorkflow();
  const exists = wf.edges.some(
    (edge) => edge.from === state.linking.nodeId && edge.out === state.linking.name && edge.to === port.nodeId && edge.in === port.name,
  );
  if (!exists) {
    wf.edges.push({ from: state.linking.nodeId, out: state.linking.name, to: port.nodeId, in: port.name });
  }
  state.linking = null;
  renderCanvas();
}

function getPortCenter(nodeId, direction, portName) {
  const portEl = document.querySelector(
    `.port[data-node-id='${nodeId}'][data-direction='${direction}'][data-port-name='${CSS.escape(portName)}']`,
  );
  if (!portEl) return null;
  const portRect = portEl.getBoundingClientRect();
  const wrapRect = canvasWrap.getBoundingClientRect();
  return {
    x: (portRect.left + portRect.width / 2 - wrapRect.left - state.viewport.x) / state.viewport.scale,
    y: (portRect.top + portRect.height / 2 - wrapRect.top - state.viewport.y) / state.viewport.scale,
  };
}

function drawPath(from, to, color = "#70a1ff", dashed = false) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
  line.setAttribute("d", `M ${from.x} ${from.y} C ${from.x + 70} ${from.y}, ${to.x - 70} ${to.y}, ${to.x} ${to.y}`);
  line.setAttribute("stroke", color);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke-width", "2");
  if (dashed) line.setAttribute("stroke-dasharray", "6 4");
  edgeLayer.appendChild(line);
}

function renderEdges() {
  const wf = activeWorkflow();
  edgeLayer.innerHTML = "";

  wf.edges.forEach((edge) => {
    const from = getPortCenter(edge.from, "output", edge.out);
    const to = getPortCenter(edge.to, "input", edge.in);
    if (!from || !to) return;
    drawPath(from, to);
  });

  if (state.linking) {
    const from = getPortCenter(state.linking.nodeId, "output", state.linking.name);
    if (from) drawPath(from, state.cursorWorld, "#9bbcff", true);
  }
}

function enableDrag(handle, node) {
  handle.onmousedown = (event) => {
    event.stopPropagation();
    const start = screenToWorld(event.clientX, event.clientY);
    const drag = {
      startMouse: start,
      startNode: { x: node.x, y: node.y },
    };

    const onMove = (moveEvent) => {
      const current = screenToWorld(moveEvent.clientX, moveEvent.clientY);
      node.x = snap(drag.startNode.x + (current.x - drag.startMouse.x));
      node.y = snap(drag.startNode.y + (current.y - drag.startMouse.y));
      state.cursorWorld = current;
      updateCoordHud(current.x, current.y);
      renderCanvas();
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
}

function bindViewportControls() {
  canvasWrap.addEventListener("mousedown", (event) => {
    if (event.target.closest(".node")) return;
    state.selectedNodeId = null;
    renderCanvas();
    state.pan = {
      startX: event.clientX,
      startY: event.clientY,
      viewportX: state.viewport.x,
      viewportY: state.viewport.y,
    };
  });

  document.addEventListener("mousemove", (event) => {
    const world = screenToWorld(event.clientX, event.clientY);
    state.cursorWorld = world;
    updateCoordHud(world.x, world.y);
    if (!state.pan) {
      if (state.linking) renderEdges();
      return;
    }
    state.viewport.x = state.pan.viewportX + (event.clientX - state.pan.startX);
    state.viewport.y = state.pan.viewportY + (event.clientY - state.pan.startY);
    applyViewport();
    renderEdges();
  });

  document.addEventListener("mouseup", () => {
    state.pan = null;
  });

  canvasWrap.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, event.deltaY);
    },
    { passive: false },
  );

  canvasWrap.addEventListener("dblclick", (event) => {
    if (event.target.closest(".node")) return;
    const world = screenToWorld(event.clientX, event.clientY);
    openNodeSearch(world);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.linking) {
      state.linking = null;
      renderEdges();
    }
  });
}

function bindNodeSearch() {
  nodeSearchInput.addEventListener("input", () => renderNodeSearchResults(nodeSearchInput.value));
  nodeSearchOverlay.addEventListener("click", (event) => {
    if (event.target === nodeSearchOverlay) closeNodeSearch();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNodeSearch();
  });
}

function openNodeSearch(position) {
  nodeSearchOverlay.classList.remove("hidden");
  nodeSearchOverlay.dataset.position = JSON.stringify(position);
  nodeSearchInput.value = "";
  renderNodeSearchResults("");
  nodeSearchInput.focus();
}

function closeNodeSearch() {
  nodeSearchOverlay.classList.add("hidden");
  nodeSearchOverlay.dataset.position = "";
}

function renderNodeSearchResults(query) {
  const normalized = query.trim().toLowerCase();
  const categories = nodeCategories();
  nodeSearchResults.innerHTML = "";

  categories.forEach(([category, types]) => {
    const filtered = types.filter((type) => type.toLowerCase().includes(normalized));
    if (!filtered.length) return;

    const heading = document.createElement("div");
    heading.className = "search-category";
    heading.textContent = category;
    nodeSearchResults.appendChild(heading);

    filtered.forEach((type) => {
      const btn = document.createElement("button");
      btn.className = "search-result";
      btn.textContent = type;
      btn.onclick = () => {
        const position = JSON.parse(nodeSearchOverlay.dataset.position || "{\"x\":80,\"y\":80}");
        addNode(type, position);
        closeNodeSearch();
      };
      nodeSearchResults.appendChild(btn);
    });
  });
}

async function saveActiveWorkflow() {
  const wf = activeWorkflow();
  await fetch(`/api/workflows/${encodeURIComponent(wf.name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow: wf }),
  });
}

async function runActiveWorkflow() {
  const wf = activeWorkflow();
  const response = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow: wf }),
  });
  runOutput.textContent = JSON.stringify(await response.json(), null, 2);
}

function exportJson() {
  const wf = activeWorkflow();
  const blob = new Blob([JSON.stringify(wf, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${wf.name}.json`;
  a.click();
}

document.getElementById("newWorkflowBtn").onclick = () => {
  const wf = newWorkflow(`workflow-${state.workflows.length + 1}`);
  state.workflows.push(wf);
  state.activeWorkflowId = wf.id;
  renderTabs();
  renderCanvas();
};

document.getElementById("saveWorkflowBtn").onclick = saveActiveWorkflow;
document.getElementById("runWorkflowBtn").onclick = runActiveWorkflow;
document.getElementById("refreshModelsBtn").onclick = async () => {
  await loadEnvironmentData();
  renderPalette();
  renderCanvas();
};
document.getElementById("exportJsonBtn").onclick = exportJson;
document.getElementById("importJsonInput").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const parsed = JSON.parse(await file.text());
  parsed.id = crypto.randomUUID();
  state.workflows.push(parsed);
  state.activeWorkflowId = parsed.id;
  renderTabs();
  renderCanvas();
};

init();
