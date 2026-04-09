const backdropLayer = document.getElementById("viz-backdrop");
const edgesLayer = document.getElementById("edges-layer");
const nodesLayer = document.getElementById("nodes-layer");
const labelsLayer = document.getElementById("labels-layer");

const structureSelect = document.getElementById("structure-select");
const presetSelect = document.getElementById("preset-select");
const valueInput = document.getElementById("value-input");
const addBtn = document.getElementById("add-btn");
const playBtn = document.getElementById("play-btn");
const stepBtn = document.getElementById("step-btn");
const removeBtn = document.getElementById("remove-btn");
const resetBtn = document.getElementById("reset-btn");
const speedInput = document.getElementById("speed-input");
const speedLabel = document.getElementById("speed-label");
const statusText = document.getElementById("status-text");
const opCounter = document.getElementById("op-counter");
const structureTitle = document.getElementById("structure-title");
const structureDescription = document.getElementById("structure-description");

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEWBOX_WIDTH = 1080;
const VIEWBOX_HEIGHT = 620;
const TREE_WIDTH = 960;
const TREE_LEVEL_GAP = 100;
const TREE_NODE_RADIUS = 28;

const STRUCTURES = {
  array: {
    title: "Array Sorting",
    description:
      "Arrays keep values in order by index. This demo uses bubble sort so you can watch adjacent values compare and swap until the list is sorted.",
    addLabel: "Add",
    removeLabel: "Shuffle",
    removeHint: "Shuffle mixes the current array so you can sort it again.",
    presets: [
      { label: "Short shuffle", values: [34, 12, 67, 23, 89, 45] },
      { label: "Wide spread", values: [91, 17, 63, 28, 75, 49, 6, 52] },
      { label: "Nearly sorted", values: [10, 20, 30, 50, 40, 60, 70] }
    ]
  },
  stack: {
    title: "Stack",
    description:
      "Stacks follow last-in, first-out behavior. Every new value lands on top, and removals pop the most recent item first.",
    addLabel: "Push",
    removeLabel: "Pop",
    removeHint: "Pop removes the current top value.",
    presets: [
      { label: "Small stack", values: [12, 24, 36, 48] },
      { label: "Mixed values", values: [9, 31, 14, 57, 22] },
      { label: "Tall stack", values: [5, 10, 15, 20, 25, 30] }
    ]
  },
  queue: {
    title: "Queue",
    description:
      "Queues follow first-in, first-out behavior. New values enter at the tail, and removals dequeue from the front.",
    addLabel: "Enqueue",
    removeLabel: "Dequeue",
    removeHint: "Dequeue removes the oldest value at the front.",
    presets: [
      { label: "Ticket line", values: [18, 26, 31, 44] },
      { label: "Balanced queue", values: [7, 14, 21, 28, 35] },
      { label: "Busy line", values: [4, 11, 19, 27, 34, 41] }
    ]
  },
  tree: {
    title: "Binary Search Tree",
    description:
      "Binary search trees place smaller values on the left and larger values on the right. Watch each insertion travel through the tree before settling into position.",
    addLabel: "Insert",
    removeLabel: "Clear",
    removeHint: "Clear removes the entire tree.",
    presets: [
      { label: "Balanced growth", values: [42, 18, 67, 9, 27, 55, 78, 63] },
      { label: "Right heavy", values: [10, 20, 30, 40, 50, 60, 70] },
      { label: "Layered tree", values: [50, 25, 75, 10, 30, 60, 90, 5, 15, 27, 33] }
    ]
  }
};

let currentStructure = structureSelect.value;
let state = {
  values: [],
  treeRoot: null,
  operations: 0,
  activeIds: new Set(),
  freshIds: new Set()
};
let nextItemId = 0;
let playbackQueue = [];
let playbackIndex = 0;
let playbackTimer = null;
let lastAction = null;

function createItem(value) {
  return {
    id: `item-${nextItemId++}`,
    value
  };
}

function createTreeNode(value) {
  return {
    id: `node-${nextItemId++}`,
    value,
    left: null,
    right: null,
    x: TREE_WIDTH / 2,
    y: 78,
    targetX: TREE_WIDTH / 2,
    targetY: 78
  };
}

function currentSpeed() {
  return Number(speedInput.value);
}

function updateSpeedLabel() {
  speedLabel.textContent = `${currentSpeed()}ms`;
  document.documentElement.style.setProperty("--speed-ms", `${currentSpeed()}ms`);
}

function setStatus(message) {
  statusText.textContent = message;
}

function setHighlights(activeIds = [], freshIds = []) {
  state.activeIds = new Set(activeIds);
  state.freshIds = new Set(freshIds);
}

function clearHighlightsLater() {
  window.setTimeout(() => {
    setHighlights();
    render();
  }, Math.max(180, currentSpeed() * 0.72));
}

function bumpOperations() {
  state.operations += 1;
  opCounter.textContent = `${state.operations} operation${state.operations === 1 ? "" : "s"}`;
}

function resetState() {
  stopPlayback();
  state = {
    values: [],
    treeRoot: null,
    operations: 0,
    activeIds: new Set(),
    freshIds: new Set()
  };
  playbackQueue = [];
  playbackIndex = 0;
  lastAction = null;
  opCounter.textContent = "0 operations";
}

function walkTree(node, visit, depth = 0, index = 0, parent = null) {
  if (!node) {
    return;
  }

  visit(node, depth, index, parent);
  walkTree(node.left, visit, depth + 1, index * 2, node);
  walkTree(node.right, visit, depth + 1, index * 2 + 1, node);
}

function computeTreeLayout() {
  walkTree(state.treeRoot, (node, depth, index) => {
    const slots = 2 ** depth;
    const gap = TREE_WIDTH / slots;
    node.targetX = gap * index + gap / 2 + 60;
    node.targetY = 86 + depth * TREE_LEVEL_GAP;
  });
}

function renderBackdropLines() {
  backdropLayer.innerHTML = "";
  const group = document.createElementNS(SVG_NS, "g");
  group.classList.add("viz-backdrop-grid");

  for (let y = 80; y <= VIEWBOX_HEIGHT; y += 90) {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", "30");
    line.setAttribute("x2", String(VIEWBOX_WIDTH - 30));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    group.appendChild(line);
  }

  backdropLayer.appendChild(group);
}

function render() {
  renderBackdropLines();
  edgesLayer.innerHTML = "";
  nodesLayer.innerHTML = "";
  labelsLayer.innerHTML = "";

  if (currentStructure === "array") {
    renderArray();
    return;
  }

  if (currentStructure === "stack") {
    renderStack();
    return;
  }

  if (currentStructure === "queue") {
    renderQueue();
    return;
  }

  renderTree();
}

function renderArray() {
  const baseY = 520;
  const barWidth = 90;
  const gap = 24;
  const startX = 90;
  const maxValue = Math.max(100, ...state.values.map((item) => item.value));

  state.values.forEach((item, index) => {
    const height = 120 + (item.value / maxValue) * 220;
    const x = startX + index * (barWidth + gap);
    const y = baseY - height;
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("viz-bar");
    if (state.activeIds.has(item.id)) {
      group.classList.add("is-active");
    }
    if (state.freshIds.has(item.id)) {
      group.classList.add("is-new");
    }
    group.setAttribute("transform", `translate(${x}, ${y})`);

    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("width", String(barWidth));
    rect.setAttribute("height", String(height));

    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", String(barWidth / 2));
    text.setAttribute("y", String(height - 26));
    text.textContent = String(item.value);

    group.append(rect, text);
    nodesLayer.appendChild(group);

    const labelGroup = document.createElementNS(SVG_NS, "g");
    labelGroup.classList.add("viz-label");
    labelGroup.setAttribute("transform", `translate(${x + barWidth / 2}, 560)`);

    const label = document.createElementNS(SVG_NS, "text");
    label.textContent = `idx ${index}`;
    labelGroup.appendChild(label);
    labelsLayer.appendChild(labelGroup);
  });
}

function renderStack() {
  const slotHeight = 78;
  const width = 200;
  const originX = 430;
  const bottomY = 520;

  const track = document.createElementNS(SVG_NS, "rect");
  track.classList.add("track");
  track.setAttribute("x", String(originX - 24));
  track.setAttribute("y", "82");
  track.setAttribute("width", String(width + 48));
  track.setAttribute("height", "470");
  track.setAttribute("rx", "24");
  track.setAttribute("fill", "rgba(255,255,255,0.35)");
  backdropLayer.appendChild(track);

  state.values.forEach((item, index) => {
    const y = bottomY - (index + 1) * slotHeight;
    renderBlockNode({
      item,
      x: originX,
      y,
      width,
      height: 62,
      label: index === state.values.length - 1 ? "TOP" : ""
    });
  });
}

function renderQueue() {
  const width = 128;
  const height = 78;
  const gap = 18;
  const startX = 90;
  const y = 280;

  const guide = document.createElementNS(SVG_NS, "rect");
  guide.classList.add("track");
  guide.setAttribute("x", "56");
  guide.setAttribute("y", "242");
  guide.setAttribute("width", "970");
  guide.setAttribute("height", "154");
  guide.setAttribute("rx", "28");
  guide.setAttribute("fill", "rgba(255,255,255,0.35)");
  backdropLayer.appendChild(guide);

  state.values.forEach((item, index) => {
    const x = startX + index * (width + gap);
    let label = "";
    if (index === 0) {
      label = "FRONT";
    } else if (index === state.values.length - 1) {
      label = "BACK";
    }

    renderBlockNode({
      item,
      x,
      y,
      width,
      height,
      label
    });
  });
}

function renderBlockNode({ item, x, y, width, height, label }) {
  const group = document.createElementNS(SVG_NS, "g");
  group.classList.add("viz-node");
  if (state.activeIds.has(item.id)) {
    group.classList.add("is-active");
  }
  if (state.freshIds.has(item.id)) {
    group.classList.add("is-new");
  }
  group.setAttribute("transform", `translate(${x}, ${y})`);

  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("width", String(width));
  rect.setAttribute("height", String(height));
  rect.setAttribute("rx", "24");
  rect.setAttribute("ry", "24");

  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("x", String(width / 2));
  text.setAttribute("y", String(height / 2));
  text.textContent = String(item.value);

  group.append(rect, text);
  nodesLayer.appendChild(group);

  if (label) {
    const labelGroup = document.createElementNS(SVG_NS, "g");
    labelGroup.classList.add("viz-label");
    labelGroup.setAttribute("transform", `translate(${x + width / 2}, ${y - 18})`);

    const labelText = document.createElementNS(SVG_NS, "text");
    labelText.textContent = label;
    labelGroup.appendChild(labelText);
    labelsLayer.appendChild(labelGroup);
  }
}

function renderTree() {
  computeTreeLayout();
  walkTree(state.treeRoot, (node, depth, index, parent) => {
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("viz-node");
    if (state.activeIds.has(node.id)) {
      group.classList.add("is-active");
    }
    if (state.freshIds.has(node.id)) {
      group.classList.add("is-new");
    }
    group.setAttribute("transform", `translate(${node.targetX}, ${node.targetY})`);

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("r", String(TREE_NODE_RADIUS));

    const text = document.createElementNS(SVG_NS, "text");
    text.textContent = String(node.value);

    group.append(circle, text);
    nodesLayer.appendChild(group);

    if (parent) {
      const edge = document.createElementNS(SVG_NS, "line");
      edge.classList.add("edge");
      edge.setAttribute("x1", String(parent.targetX));
      edge.setAttribute("y1", String(parent.targetY + TREE_NODE_RADIUS / 2));
      edge.setAttribute("x2", String(node.targetX));
      edge.setAttribute("y2", String(node.targetY - TREE_NODE_RADIUS / 2));
      edgesLayer.appendChild(edge);
    }
  });
}

function addManualValue() {
  const value = Number(valueInput.value);
  if (!Number.isFinite(value)) {
    setStatus("Enter a valid number first.");
    return;
  }

  stopPlayback();
  if (currentStructure === "array") {
    const item = createItem(value);
    state.values.push(item);
    setHighlights([], [item.id]);
    bumpOperations();
    setStatus(`Added ${value} to the end of the array.`);
  } else if (currentStructure === "stack") {
    const item = createItem(value);
    state.values.push(item);
    setHighlights([item.id], [item.id]);
    bumpOperations();
    setStatus(`Pushed ${value} onto the stack.`);
  } else if (currentStructure === "queue") {
    const item = createItem(value);
    state.values.push(item);
    setHighlights([item.id], [item.id]);
    bumpOperations();
    setStatus(`Enqueued ${value} at the back of the queue.`);
  } else {
    insertTreeValue(value);
    return;
  }

  render();
  clearHighlightsLater();
}

function removeValue() {
  stopPlayback();

  if (currentStructure === "array") {
    if (!state.values.length) {
      setStatus("The array is empty, so there is nothing to shuffle.");
      return;
    }

    state.values = [...state.values].sort(() => Math.random() - 0.5);
    setHighlights(state.values.map((item) => item.id), []);
    bumpOperations();
    setStatus("Shuffled the array. Press Step or Play Preset to sort it.");
    render();
    clearHighlightsLater();
    return;
  }

  if (currentStructure === "tree") {
    resetState();
    setStatus("Cleared the tree. Ready for a new insertion sequence.");
    render();
    return;
  }

  if (!state.values.length) {
    setStatus(`The ${currentStructure} is empty right now.`);
    return;
  }

  const removed = currentStructure === "stack" ? state.values.pop() : state.values.shift();
  setHighlights([removed.id], []);
  bumpOperations();

  if (currentStructure === "stack") {
    setStatus(`Popped ${removed.value} from the stack.`);
  } else {
    setStatus(`Dequeued ${removed.value} from the front of the queue.`);
  }

  render();
  clearHighlightsLater();
}

function insertTreeValue(value) {
  let inserted = null;
  const path = [];

  if (!state.treeRoot) {
    inserted = createTreeNode(value);
    state.treeRoot = inserted;
    bumpOperations();
    setHighlights([inserted.id], [inserted.id]);
    setStatus(`Inserted ${value} as the root node.`);
    render();
    clearHighlightsLater();
    return true;
  }

  let current = state.treeRoot;
  while (current) {
    path.push(current.id);
    if (value === current.value) {
      setHighlights(path, []);
      setStatus(`${value} is already in the tree, so no node was added.`);
      render();
      clearHighlightsLater();
      return false;
    }

    if (value < current.value) {
      if (!current.left) {
        inserted = createTreeNode(value);
        current.left = inserted;
        break;
      }
      current = current.left;
    } else {
      if (!current.right) {
        inserted = createTreeNode(value);
        current.right = inserted;
        break;
      }
      current = current.right;
    }
  }

  bumpOperations();
  setHighlights([...path, inserted.id], [inserted.id]);
  setStatus(`Inserted ${value} after traversing ${path.length} node${path.length === 1 ? "" : "s"}.`);
  render();
  clearHighlightsLater();
  return true;
}

function buildPresetSteps() {
  const preset = STRUCTURES[currentStructure].presets[presetSelect.selectedIndex] || STRUCTURES[currentStructure].presets[0];
  if (!preset) {
    return [];
  }

  if (currentStructure === "array") {
    const items = preset.values.map((value) => createItem(value));
    const steps = [
      {
        type: "load-array",
        items,
        message: `Loaded ${items.length} values into the array.`
      }
    ];
    const sortable = [...items];
    for (let end = sortable.length - 1; end > 0; end -= 1) {
      for (let i = 0; i < end; i += 1) {
        const left = sortable[i];
        const right = sortable[i + 1];
        if (left.value > right.value) {
          sortable[i] = right;
          sortable[i + 1] = left;
          steps.push({
            type: "swap-array",
            ids: [left.id, right.id],
            nextValues: [...sortable],
            message: `Swapped ${left.value} and ${right.value} because ${left.value} was larger.`
          });
        } else {
          steps.push({
            type: "inspect-array",
            ids: [left.id, right.id],
            message: `Compared ${left.value} and ${right.value}. They stay in place.`
          });
        }
      }
    }
    return steps;
  }

  if (currentStructure === "stack") {
    return STRUCTURES.stack.presets[presetSelect.selectedIndex].values.map((value) => ({
      type: "push-stack",
      item: createItem(value),
      message: `Pushed ${value} onto the stack.`
    }));
  }

  if (currentStructure === "queue") {
    return STRUCTURES.queue.presets[presetSelect.selectedIndex].values.map((value) => ({
      type: "enqueue-queue",
      item: createItem(value),
      message: `Enqueued ${value} at the back of the queue.`
    }));
  }

  return STRUCTURES.tree.presets[presetSelect.selectedIndex].values.map((value) => ({
    type: "insert-tree",
    value,
    message: `Inserted ${value} into the binary search tree.`
  }));
}

function applyStep(step) {
  if (!step) {
    return false;
  }

  if (step.type === "load-array") {
    state.values = [...step.items];
    setHighlights([], step.items.map((item) => item.id));
    bumpOperations();
    setStatus(step.message);
    render();
    clearHighlightsLater();
    return true;
  }

  if (step.type === "inspect-array") {
    setHighlights(step.ids, []);
    bumpOperations();
    setStatus(step.message);
    render();
    clearHighlightsLater();
    return true;
  }

  if (step.type === "swap-array") {
    state.values = [...step.nextValues];
    setHighlights(step.ids, step.ids);
    bumpOperations();
    setStatus(step.message);
    render();
    clearHighlightsLater();
    return true;
  }

  if (step.type === "push-stack") {
    state.values.push(step.item);
    setHighlights([step.item.id], [step.item.id]);
    bumpOperations();
    setStatus(step.message);
    render();
    clearHighlightsLater();
    return true;
  }

  if (step.type === "enqueue-queue") {
    state.values.push(step.item);
    setHighlights([step.item.id], [step.item.id]);
    bumpOperations();
    setStatus(step.message);
    render();
    clearHighlightsLater();
    return true;
  }

  if (step.type === "insert-tree") {
    return insertTreeValue(step.value);
  }

  return false;
}

function stopPlayback() {
  if (playbackTimer) {
    window.clearTimeout(playbackTimer);
    playbackTimer = null;
  }
}

function playbackNext() {
  if (playbackIndex >= playbackQueue.length) {
    setStatus(`Preset complete for ${STRUCTURES[currentStructure].title}.`);
    stopPlayback();
    return;
  }

  applyStep(playbackQueue[playbackIndex]);
  playbackIndex += 1;
  playbackTimer = window.setTimeout(playbackNext, currentSpeed() + 120);
}

function preparePlayback() {
  resetState();
  playbackQueue = buildPresetSteps();
  playbackIndex = 0;
  render();
}

function playPreset() {
  preparePlayback();
  if (!playbackQueue.length) {
    setStatus("No preset steps are available for this structure.");
    return;
  }
  playbackNext();
}

function stepPreset() {
  stopPlayback();
  if (!playbackQueue.length || lastAction !== "step") {
    preparePlayback();
  }

  lastAction = "step";
  if (playbackIndex >= playbackQueue.length) {
    setStatus(`Preset complete for ${STRUCTURES[currentStructure].title}.`);
    return;
  }

  applyStep(playbackQueue[playbackIndex]);
  playbackIndex += 1;
}

function syncControlCopy() {
  const meta = STRUCTURES[currentStructure];
  structureTitle.textContent = meta.title;
  structureDescription.textContent = `${meta.description} ${meta.removeHint}`;
  addBtn.textContent = meta.addLabel;
  removeBtn.textContent = meta.removeLabel;
}

function rebuildPresetSelect() {
  presetSelect.innerHTML = "";
  for (const preset of STRUCTURES[currentStructure].presets) {
    const option = document.createElement("option");
    option.textContent = preset.label;
    presetSelect.appendChild(option);
  }
}

function switchStructure() {
  currentStructure = structureSelect.value;
  lastAction = null;
  rebuildPresetSelect();
  syncControlCopy();
  resetState();
  setStatus(`Switched to ${STRUCTURES[currentStructure].title}. Press Play Preset to begin.`);
  render();
}

addBtn.addEventListener("click", () => {
  lastAction = "manual";
  addManualValue();
});

removeBtn.addEventListener("click", () => {
  lastAction = "manual";
  removeValue();
});

playBtn.addEventListener("click", () => {
  lastAction = "play";
  playPreset();
});

stepBtn.addEventListener("click", stepPreset);

resetBtn.addEventListener("click", () => {
  switchStructure();
});

structureSelect.addEventListener("change", switchStructure);
speedInput.addEventListener("input", updateSpeedLabel);
valueInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    lastAction = "manual";
    addManualValue();
  }
});
presetSelect.addEventListener("change", () => {
  lastAction = null;
  stopPlayback();
  setStatus(`Preset changed for ${STRUCTURES[currentStructure].title}. Press Play Preset or Step.`);
});

updateSpeedLabel();
rebuildPresetSelect();
syncControlCopy();
setStatus(`Switched to ${STRUCTURES[currentStructure].title}. Press Play Preset to begin.`);
render();
