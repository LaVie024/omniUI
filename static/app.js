const state = {
  nodeDefs: {},
  workflows: [],
  activeWorkflowId: null,
  linking: null,
  models: { checkpoints: [], vae: [], loras: [] },
  inputMedia: { images: [], videos: [], audio: [] },
  runtime: null,
  customNodes: [],
};

const canvas = document.getElementById("canvas");
const edgeLayer = document.getElementById("edgeLayer");
const tabList = document.getElementById("tabList");
const runOutput = document.getElementById("runOutput");
const modelRegistry = document.getElementById("modelRegistry");
const runtimeInfo = document.getElementById("runtimeInfo");
const customNodesInfo = document.getElementById("customNodesInfo");

function newWorkflow(name = `workflow-${Date.now()}`) {
  return { id: crypto.randomUUID(), name, nodes: [], edges: [] };
}

function activeWorkflow() {
  return state.workflows.find((wf) => wf.id === state.activeWorkflowId);
}

async function init() {
  const wf = newWorkflow("workflow-1");
  state.workflows.push(wf);
  state.activeWorkflowId = wf.id;
  await loadEnvironmentData();
  renderPalette();
  renderTabs();
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

function renderPalette() {
  const palette = document.getElementById("nodePalette");
  palette.innerHTML = "";
  Object.keys(state.nodeDefs).forEach((type) => {
    const btn = document.createElement("button");
    btn.className = "palette-item";
    btn.textContent = type;
    btn.onclick = () => addNode(type);
    palette.appendChild(btn);
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

function addNode(type) {
  const wf = activeWorkflow();
  const def = state.nodeDefs[type];
  wf.nodes.push({
    id: crypto.randomUUID(),
    type,
    x: 50 + wf.nodes.length * 20,
    y: 50 + wf.nodes.length * 20,
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

function renderCanvas() {
  const wf = activeWorkflow();
  canvas.innerHTML = "";
  edgeLayer.innerHTML = "";

  wf.nodes.forEach((node) => {
    const def = state.nodeDefs[node.type] || { inputs: [], outputs: [] };
    const el = document.createElement("div");
    el.className = "node";
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.dataset.nodeId = node.id;

    const header = document.createElement("div");
    header.className = "node-header";
    header.textContent = node.type;
    enableDrag(header, node);
    el.appendChild(header);

    Object.entries(node.params || {}).forEach(([key, value]) => {
      const input = buildParamInput(key, value);
      input.onchange = () => {
        node.params[key] = input.value;
      };
      el.appendChild(labelWrap(key, input));
    });

    (def.inputs || []).forEach((name) => el.appendChild(portRow(name, "input", node.id)));
    (def.outputs || []).forEach((name) => el.appendChild(portRow(name, "output", node.id)));

    canvas.appendChild(el);
  });

  wf.edges.forEach((edge) => drawEdge(edge));
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

function portRow(name, direction, nodeId) {
  const row = document.createElement("div");
  row.className = "port-row";
  const side = document.createElement("span");
  side.className = "port";
  side.textContent = `${direction === "input" ? "←" : "→"} ${name}`;
  side.onclick = () => clickPort({ nodeId, direction, name, element: side });
  row.appendChild(side);
  return row;
}

function clickPort(port) {
  if (!state.linking) {
    if (port.direction !== "output") return;
    state.linking = port;
    port.element.classList.add("active");
    return;
  }
  if (port.direction !== "input") return;
  const wf = activeWorkflow();
  wf.edges.push({ from: state.linking.nodeId, out: state.linking.name, to: port.nodeId, in: port.name });
  state.linking.element.classList.remove("active");
  state.linking = null;
  renderCanvas();
}

function drawEdge(edge) {
  const fromNode = document.querySelector(`[data-node-id='${edge.from}']`);
  const toNode = document.querySelector(`[data-node-id='${edge.to}']`);
  if (!fromNode || !toNode) return;
  const x1 = fromNode.offsetLeft + fromNode.offsetWidth;
  const y1 = fromNode.offsetTop + fromNode.offsetHeight / 2;
  const x2 = toNode.offsetLeft;
  const y2 = toNode.offsetTop + toNode.offsetHeight / 2;
  const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
  line.setAttribute("d", `M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 - 60} ${y2}, ${x2} ${y2}`);
  line.setAttribute("stroke", "#70a1ff");
  line.setAttribute("fill", "none");
  line.setAttribute("stroke-width", "2");
  edgeLayer.appendChild(line);
}

function enableDrag(handle, node) {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;
  handle.onmousedown = (event) => {
    dragging = true;
    offsetX = event.clientX - node.x;
    offsetY = event.clientY - node.y;
  };
  document.onmousemove = (event) => {
    if (!dragging) return;
    node.x = event.clientX - offsetX;
    node.y = event.clientY - offsetY;
    renderCanvas();
  };
  document.onmouseup = () => {
    dragging = false;
  };
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
