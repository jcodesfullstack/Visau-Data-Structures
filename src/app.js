const SVG_NS = "http://www.w3.org/2000/svg";

const modeSelect = document.getElementById("mode-select");
const visualizationSelect = document.getElementById("visualization-select");
const presetSelect = document.getElementById("preset-select");
const presetGallery = document.getElementById("preset-gallery");
const playRecommendedBtn = document.getElementById("play-recommended-btn");
const valueInput = document.getElementById("value-input");
const applyValueBtn = document.getElementById("apply-value-btn");
const speedInput = document.getElementById("speed-input");
const speedLabel = document.getElementById("speed-label");
const playBtn = document.getElementById("play-btn");
const pauseBtn = document.getElementById("pause-btn");
const stepBackBtn = document.getElementById("step-back-btn");
const stepBtn = document.getElementById("step-btn");
const resetBtn = document.getElementById("reset-btn");
const statusText = document.getElementById("status-text");
const opCounter = document.getElementById("op-counter");
const visualizationTitle = document.getElementById("visualization-title");
const structureDescription = document.getElementById("structure-description");
const stepExplanation = document.getElementById("step-explanation");

const layers = {
  backdrop: document.getElementById("viz-backdrop"),
  edges: document.getElementById("edges-layer"),
  nodes: document.getElementById("nodes-layer"),
  labels: document.getElementById("labels-layer")
};

const PRESET_NOTES = {
  array: {
    "short-shuffle": "Watch values drop into slots and shift when an insertion happens.",
    "wide-spread": "The height spread makes the movement across indices easier to track.",
    "nearly-sorted": "A calmer example that still shows how inserts move the lineup."
  },
  stack: {
    "small-stack": "Push values upward and watch the top item leave on a pop.",
    "mixed-values": "The motion is the same, but the changing top is easier to spot here.",
    "tall-stack": "A taller tower makes the vertical motion more dramatic."
  },
  queue: {
    "ticket-line": "Items slide in from the right and leave from the front.",
    "balanced-queue": "A cleaner queue for seeing front and back movement.",
    "busy-line": "A longer line that makes the left-to-right flow obvious."
  },
  "linked-list": {
    "short-chain": "Nodes fly in and connect with visible next pointers.",
    "mixed-chain": "A good example for pointer motion and traversal highlights.",
    "long-chain": "More links means more visible pointer flow."
  },
  tree: {
    "balanced-growth": "New nodes descend through the tree before settling in place.",
    "right-heavy": "Shows repeated motion down the right side.",
    "layered-tree": "Builds a fuller tree so the branching motion is easier to read."
  },
  "bubble-sort": {
    "short-shuffle": "Bars swap places repeatedly so you can watch the sort happen.",
    "wide-spread": "The bigger differences make swap motion easier to follow.",
    "nearly-sorted": "A lighter version that still shows the swap path."
  },
  "selection-sort": {
    "short-shuffle": "Highlights the minimum search before each swap.",
    "wide-spread": "Makes the min-selection passes more obvious.",
    "nearly-sorted": "Good for comparing how the passes still scan the whole range."
  },
  "binary-search": {
    "small-range": "Shows low, mid, and high squeezing around the target.",
    "balanced-search": "A clean midpoint-focused search.",
    "missing-target": "Best demo for seeing the search window collapse."
  }
};

const rendererState = {
  objects: new Map(),
  edges: new Map(),
  labels: new Map(),
  animations: new Map(),
  edgeAnimations: new Map(),
  labelAnimations: new Map()
};

const player = {
  frames: [],
  frameIndex: 0,
  playing: false,
  timer: null,
  currentVisualizationId: "array",
  currentMode: "structure",
  currentPresetId: "",
  sceneType: "preset",
  customValue: null
};

function svg(tagName, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tagName);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) {
      element.setAttribute(key, String(value));
    }
  }
  return element;
}

function clearTimers() {
  if (player.timer) {
    clearTimeout(player.timer);
    player.timer = null;
  }
}

function currentSpeed() {
  return Number(speedInput.value);
}

function updateSpeedLabel() {
  const speed = currentSpeed();
  speedLabel.textContent = `${speed}ms`;
  document.documentElement.style.setProperty("--speed-ms", `${speed}ms`);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOut(value) {
  return value < 0.5 ? 4 * value * value * value : 1 - ((-2 * value + 2) ** 3) / 2;
}

function animateNumberMap(store, key, from, to, draw, duration = currentSpeed()) {
  if (store.has(key)) {
    cancelAnimationFrame(store.get(key));
  }

  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    draw(lerp(from, to, easeInOut(progress)));
    if (progress < 1) {
      store.set(key, requestAnimationFrame(tick));
    } else {
      store.delete(key);
      draw(to);
    }
  };

  store.set(key, requestAnimationFrame(tick));
}

function animatePoint(store, key, from, to, draw, duration = currentSpeed()) {
  if (store.has(key)) {
    cancelAnimationFrame(store.get(key));
  }

  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = easeInOut(progress);
    draw({
      x: lerp(from.x, to.x, eased),
      y: lerp(from.y, to.y, eased)
    });
    if (progress < 1) {
      store.set(key, requestAnimationFrame(tick));
    } else {
      store.delete(key);
      draw(to);
    }
  };

  store.set(key, requestAnimationFrame(tick));
}

function ensureBackdrop() {
  if (layers.backdrop.childNodes.length) {
    return;
  }

  const grid = svg("g", { class: "viz-backdrop-grid" });
  for (let y = 80; y <= 620; y += 90) {
    grid.appendChild(svg("line", { x1: 30, x2: 1050, y1: y, y2: y }));
  }
  layers.backdrop.appendChild(grid);
}

function setGroupPosition(group, x, y) {
  group.setAttribute("transform", `translate(${x} ${y})`);
}

function makeObjectElement(object) {
  const group = svg("g", { class: object.kind === "bar" ? "viz-bar" : "viz-node" });

  if (object.kind === "circle") {
    group.appendChild(svg("circle", { r: object.radius || 28 }));
    const text = svg("text");
    text.textContent = String(object.value);
    group.appendChild(text);
    return group;
  }

  const rect = svg("rect", {
    width: object.width,
    height: object.height,
    rx: object.kind === "list-node" ? 20 : 24,
    ry: object.kind === "list-node" ? 20 : 24
  });
  group.appendChild(rect);

  const text = svg("text", {
    x: object.width / 2,
    y: object.kind === "bar" ? object.height - 26 : object.height / 2
  });
  text.textContent = String(object.value);
  group.appendChild(text);
  return group;
}

function applyObjectState(group, object) {
  group.classList.remove("is-active", "is-new", "is-selected", "is-visited", "is-frontier", "is-muted");
  if (object.state === "active") {
    group.classList.add("is-active");
  }
  if (object.state === "new") {
    group.classList.add("is-new");
  }
  if (object.state === "selected") {
    group.classList.add("is-selected");
  }
  if (object.state === "visited") {
    group.classList.add("is-visited");
  }
  if (object.state === "frontier") {
    group.classList.add("is-frontier");
  }
  if (object.state === "muted") {
    group.classList.add("is-muted");
  }
}

function upsertObject(object, immediate = false) {
  let group = rendererState.objects.get(object.id);
  if (!group) {
    group = makeObjectElement(object);
    layers.nodes.appendChild(group);
    rendererState.objects.set(object.id, group);
    setGroupPosition(group, object.x, object.y);
  }

  const rect = group.querySelector("rect");
  if (rect && object.width && object.height) {
    rect.setAttribute("width", String(object.width));
    rect.setAttribute("height", String(object.height));
  }

  const circle = group.querySelector("circle");
  if (circle && object.radius) {
    circle.setAttribute("r", String(object.radius));
  }

  const text = group.querySelector("text");
  if (text) {
    text.textContent = String(object.value);
    if (object.kind !== "circle" && object.width && object.height) {
      text.setAttribute("x", String(object.width / 2));
      text.setAttribute("y", String(object.kind === "bar" ? object.height - 26 : object.height / 2));
    }
  }

  applyObjectState(group, object);
  const previous = group._pos || { x: object.x, y: object.y };
  const next = { x: object.x, y: object.y };

  if (immediate) {
    setGroupPosition(group, next.x, next.y);
    group._pos = next;
  } else {
    animatePoint(rendererState.animations, object.id, previous, next, (point) => {
      setGroupPosition(group, point.x, point.y);
    });
    group._pos = next;
  }
}

function upsertEdge(edge, immediate = false) {
  let line = rendererState.edges.get(edge.id);
  if (!line) {
    line = svg("line", { class: "edge" });
    layers.edges.appendChild(line);
    rendererState.edges.set(edge.id, line);
    line._coords = { x1: edge.x1, y1: edge.y1, x2: edge.x2, y2: edge.y2 };
  }

  const previous = line._coords || { x1: edge.x1, y1: edge.y1, x2: edge.x2, y2: edge.y2 };
  const next = { x1: edge.x1, y1: edge.y1, x2: edge.x2, y2: edge.y2 };

  const draw = (coords) => {
    line.setAttribute("x1", String(coords.x1));
    line.setAttribute("y1", String(coords.y1));
    line.setAttribute("x2", String(coords.x2));
    line.setAttribute("y2", String(coords.y2));
  };

  if (immediate) {
    draw(next);
  } else {
    if (rendererState.edgeAnimations.has(edge.id)) {
      cancelAnimationFrame(rendererState.edgeAnimations.get(edge.id));
    }
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / currentSpeed());
      const eased = easeInOut(progress);
      draw({
        x1: lerp(previous.x1, next.x1, eased),
        y1: lerp(previous.y1, next.y1, eased),
        x2: lerp(previous.x2, next.x2, eased),
        y2: lerp(previous.y2, next.y2, eased)
      });
      if (progress < 1) {
        rendererState.edgeAnimations.set(edge.id, requestAnimationFrame(tick));
      } else {
        rendererState.edgeAnimations.delete(edge.id);
        draw(next);
      }
    };
    rendererState.edgeAnimations.set(edge.id, requestAnimationFrame(tick));
  }

  line._coords = next;
}

function upsertLabel(label, immediate = false) {
  let group = rendererState.labels.get(label.id);
  if (!group) {
    group = svg("g", { class: "viz-label" });
    const text = svg("text");
    group.appendChild(text);
    layers.labels.appendChild(group);
    rendererState.labels.set(label.id, group);
    setGroupPosition(group, label.x, label.y);
  }

  const text = group.querySelector("text");
  text.textContent = label.text;
  const previous = group._pos || { x: label.x, y: label.y };
  const next = { x: label.x, y: label.y };

  if (immediate) {
    setGroupPosition(group, next.x, next.y);
  } else {
    animatePoint(rendererState.labelAnimations, label.id, previous, next, (point) => {
      setGroupPosition(group, point.x, point.y);
    });
  }

  group._pos = next;
}

function pruneMap(map, activeIds) {
  for (const [id, element] of map.entries()) {
    if (!activeIds.has(id)) {
      element.remove();
      map.delete(id);
    }
  }
}

function renderScene(scene, immediate = false) {
  ensureBackdrop();

  const activeObjectIds = new Set(scene.objects.map((object) => object.id));
  const activeEdgeIds = new Set(scene.edges.map((edge) => edge.id));
  const activeLabelIds = new Set(scene.labels.map((label) => label.id));

  for (const edge of scene.edges) {
    upsertEdge(edge, immediate);
  }
  for (const object of scene.objects) {
    upsertObject(object, immediate);
  }
  for (const label of scene.labels) {
    upsertLabel(label, immediate);
  }

  pruneMap(rendererState.edges, activeEdgeIds);
  pruneMap(rendererState.objects, activeObjectIds);
  pruneMap(rendererState.labels, activeLabelIds);
}

function arraySlot(value, index, state = "neutral") {
  const width = 92;
  const gap = 22;
  const maxValue = 100;
  const height = 90 + (Math.abs(value) / maxValue) * 250;
  return {
    id: `item-${value}-${index}`,
    kind: "bar",
    value,
    width,
    height,
    x: 84 + index * (width + gap),
    y: 520 - height,
    state
  };
}

function stackBlock(value, index, count, state = "neutral") {
  return {
    id: `stack-${value}-${index}`,
    kind: "rect",
    value,
    width: 220,
    height: 62,
    x: 430,
    y: 520 - (count - index) * 78,
    state
  };
}

function queueBlock(value, index, state = "neutral") {
  return {
    id: `queue-${value}-${index}`,
    kind: "rect",
    value,
    width: 132,
    height: 76,
    x: 78 + index * 150,
    y: 292,
    state
  };
}

function listNode(value, index, state = "neutral") {
  return {
    id: `list-${value}-${index}`,
    kind: "list-node",
    value,
    width: 150,
    height: 72,
    x: 78 + index * 178,
    y: 296,
    state
  };
}

function treeNode(value, x, y, id, state = "neutral") {
  return {
    id,
    kind: "circle",
    value,
    radius: 28,
    x,
    y,
    state
  };
}

function withIndexLabels(objects, prefix = "idx") {
  return objects.map((object, index) => ({
    id: `${object.id}-label`,
    text:
      prefix === "list"
        ? index === 0
          ? "HEAD"
          : `node ${index}`
        : `${prefix} ${index}`,
    x: object.x + (object.width ? object.width / 2 : 0),
    y: object.kind === "bar" ? 560 : object.y - 18
  }));
}

function frame({ message, explanation, objects = [], edges = [], labels = [] }) {
  return { message, explanation, objects, edges, labels };
}

function buildArrayConstruction(values) {
  const frames = [];
  let placed = [];

  values.forEach((value, index) => {
    const staged = placed.map((item, itemIndex) => arraySlot(item, itemIndex));
    staged.push({ ...arraySlot(value, index, "new"), x: 84 + index * 114, y: 40 });
    frames.push(
      frame({
        message: `Value ${value} enters above index ${index}.`,
        explanation: `The new value starts above the array before it drops into slot ${index}.`,
        objects: staged,
        labels: withIndexLabels(staged, "idx")
      })
    );

    placed = [...placed, value];
    const settled = placed.map((item, itemIndex) => arraySlot(item, itemIndex, itemIndex === index ? "active" : "neutral"));
    frames.push(
      frame({
        message: `Value ${value} settles into index ${index}.`,
        explanation: `Arrays store values by position, so the new value lands in the next open slot.`,
        objects: settled,
        labels: withIndexLabels(settled, "idx")
      })
    );
  });

  return frames;
}

function buildArrayRecommended() {
  const frames = buildArrayConstruction([34, 12, 67]);
  const beforeInsert = [34, 12, 67];

  frames.push(
    frame({
      message: "Value 23 arrives above index 1.",
      explanation: "To insert in the middle, the new value targets index 1 while the items to the right prepare to shift.",
      objects: [
        arraySlot(34, 0),
        arraySlot(12, 1, "selected"),
        arraySlot(67, 2, "selected"),
        { ...arraySlot(23, 1, "new"), y: 40 }
      ],
      labels: withIndexLabels(
        [arraySlot(34, 0), arraySlot(12, 1), arraySlot(67, 2), arraySlot(23, 1)],
        "idx"
      )
    })
  );

  frames.push(
    frame({
      message: "Items shift right to open index 1.",
      explanation: "Insertion in an array forces later values to move right so the new item has room.",
      objects: [
        arraySlot(34, 0),
        arraySlot(12, 2, "active"),
        arraySlot(67, 3, "active"),
        arraySlot(23, 1, "new")
      ],
      labels: withIndexLabels(
        [arraySlot(34, 0), arraySlot(23, 1), arraySlot(12, 2), arraySlot(67, 3)],
        "idx"
      )
    })
  );

  const afterInsert = [34, 23, 12, 67];
  frames.push(
    frame({
      message: "Value 23 is inserted at index 1.",
      explanation: "Now the array order is updated and every value occupies its new index.",
      objects: afterInsert.map((value, index) => arraySlot(value, index, value === 23 ? "active" : "neutral")),
      labels: withIndexLabels(afterInsert.map((value, index) => arraySlot(value, index)), "idx")
    })
  );

  frames.push(
    frame({
      message: "Value 12 lifts out from index 2.",
      explanation: "Removing from an array pulls one value out and leaves a gap behind it.",
      objects: [
        arraySlot(34, 0),
        arraySlot(23, 1),
        { ...arraySlot(12, 2, "active"), y: 40 },
        arraySlot(67, 3, "selected")
      ],
      labels: withIndexLabels(afterInsert.map((value, index) => arraySlot(value, index)), "idx")
    })
  );

  frames.push(
    frame({
      message: "Value 67 slides left to close the gap.",
      explanation: "After a removal, later items shift left so the array stays packed by index.",
      objects: [arraySlot(34, 0), arraySlot(23, 1), arraySlot(67, 2, "active")],
      labels: withIndexLabels([arraySlot(34, 0), arraySlot(23, 1), arraySlot(67, 2)], "idx")
    })
  );

  frames.push(
    frame({
      message: "Value 45 inserts at index 0 and everything else shifts right.",
      explanation: "This is the most dramatic array motion because every existing element has to move one slot.",
      objects: [
        { ...arraySlot(45, 0, "new"), y: 40 },
        arraySlot(34, 1, "active"),
        arraySlot(23, 2, "active"),
        arraySlot(67, 3, "active")
      ],
      labels: withIndexLabels([arraySlot(45, 0), arraySlot(34, 1), arraySlot(23, 2), arraySlot(67, 3)], "idx")
    })
  );

  frames.push(
    frame({
      message: "The array finishes with 45 at the front.",
      explanation: "The final layout makes it easy to see how index-based insertion changes many positions at once.",
      objects: [45, 34, 23, 67].map((value, index) => arraySlot(value, index, value === 45 ? "active" : "neutral")),
      labels: withIndexLabels([45, 34, 23, 67].map((value, index) => arraySlot(value, index)), "idx")
    })
  );

  return frames;
}

function buildStackConstruction(values) {
  const frames = [];
  let placed = [];

  values.forEach((value) => {
    const staged = [...placed, value];
    frames.push(
      frame({
        message: `Value ${value} drops onto the stack.`,
        explanation: "Stacks grow vertically, so each push lands on top of the previous item.",
        objects: staged.map((item, index) => {
          const object = stackBlock(item, index, staged.length, item === value ? "new" : "neutral");
          return item === value ? { ...object, y: 40 } : object;
        })
      })
    );

    placed = staged;
    frames.push(
      frame({
        message: `Value ${value} becomes the top item.`,
        explanation: "The newest value is now on top, which is what makes stack operations last-in, first-out.",
        objects: placed.map((item, index) => stackBlock(item, index, placed.length, index === placed.length - 1 ? "active" : "neutral"))
      })
    );
  });

  return frames;
}

function buildStackRecommended() {
  const frames = buildStackConstruction([12, 24, 36]);
  frames.push(
    frame({
      message: "The stack peeks at the top value 36.",
      explanation: "Peek does not move anything, but it highlights the top item.",
      objects: [12, 24, 36].map((value, index, list) => stackBlock(value, index, list.length, value === 36 ? "selected" : "neutral"))
    })
  );
  frames.push(
    frame({
      message: "Value 36 pops upward and leaves the stack.",
      explanation: "Pop removes the most recently pushed value first.",
      objects: [12, 24].map((value, index, list) => stackBlock(value, index, list.length + 1)).concat([
        { ...stackBlock(36, 2, 3, "active"), y: 20 }
      ])
    })
  );
  frames.push(
    frame({
      message: "Value 48 drops onto the top.",
      explanation: "After the pop, a new push lands on top again.",
      objects: [
        stackBlock(12, 0, 3),
        stackBlock(24, 1, 3),
        { ...stackBlock(48, 2, 3, "new"), y: 40 }
      ]
    })
  );
  frames.push(
    frame({
      message: "The stack now has 48 on top.",
      explanation: "That top-most position is the key visual for understanding stacks.",
      objects: [12, 24, 48].map((value, index, list) => stackBlock(value, index, list.length, value === 48 ? "active" : "neutral"))
    })
  );
  return frames;
}

function buildQueueConstruction(values) {
  const frames = [];
  let placed = [];

  values.forEach((value) => {
    const stage = [...placed, value];
    frames.push(
      frame({
        message: `Value ${value} slides in at the back of the queue.`,
        explanation: "Queues accept new items at the back end.",
        objects: stage.map((item, index) => {
          const object = queueBlock(item, index, item === value ? "new" : "neutral");
          return item === value ? { ...object, x: 930 } : object;
        })
      })
    );
    placed = stage;
    frames.push(
      frame({
        message: `Value ${value} joins the back of the line.`,
        explanation: "The queue grows from front to back.",
        objects: placed.map((item, index) => queueBlock(item, index, index === placed.length - 1 ? "active" : "neutral"))
      })
    );
  });

  return frames;
}

function buildQueueRecommended() {
  const frames = buildQueueConstruction([18, 26, 31]);
  frames.push(
    frame({
      message: "The front value 18 exits to the left.",
      explanation: "Queues remove from the front, so the oldest value leaves first.",
      objects: [
        { ...queueBlock(18, 0, "active"), x: -120 },
        queueBlock(26, 1, "selected"),
        queueBlock(31, 2, "selected")
      ]
    })
  );
  frames.push(
    frame({
      message: "The remaining items slide forward.",
      explanation: "Everything behind the old front advances toward the front of the queue.",
      objects: [queueBlock(26, 0, "active"), queueBlock(31, 1, "active")]
    })
  );
  frames.push(
    frame({
      message: "Value 44 enters at the back.",
      explanation: "A new enqueue still comes in from the back side.",
      objects: [queueBlock(26, 0), queueBlock(31, 1), { ...queueBlock(44, 2, "new"), x: 930 }]
    })
  );
  frames.push(
    frame({
      message: "The queue settles into its new order.",
      explanation: "You can see the front and back positions visually once the motion finishes.",
      objects: [26, 31, 44].map((value, index) => queueBlock(value, index, value === 44 ? "active" : "neutral"))
    })
  );
  return frames;
}

function listEdges(values) {
  return values.slice(0, -1).map((value, index) => {
    const from = listNode(value, index);
    const to = listNode(values[index + 1], index + 1);
    return {
      id: `edge-${value}-${values[index + 1]}-${index}`,
      x1: from.x + from.width,
      y1: from.y + from.height / 2,
      x2: to.x,
      y2: to.y + to.height / 2
    };
  });
}

function buildLinkedListConstruction(values) {
  const frames = [];
  let placed = [];

  values.forEach((value) => {
    const stage = [...placed, value];
    frames.push(
      frame({
        message: `Node ${value} travels into the chain.`,
        explanation: "Linked-list nodes arrive one at a time before being connected to the chain.",
        objects: stage.map((item, index) => {
          const object = listNode(item, index, item === value ? "new" : "neutral");
          return item === value ? { ...object, x: 920, y: 140 } : object;
        }),
        edges: listEdges(placed)
      })
    );
    placed = stage;
    frames.push(
      frame({
        message: `Node ${value} links into the list.`,
        explanation: "Now the next pointer reaches the new tail node.",
        objects: placed.map((item, index) => listNode(item, index, item === value ? "active" : "neutral")),
        edges: listEdges(placed),
        labels: withIndexLabels(placed.map((item, index) => listNode(item, index)), "list")
      })
    );
  });

  return frames;
}

function buildLinkedListRecommended() {
  const frames = buildLinkedListConstruction([11, 22, 33]);
  frames.push(
    frame({
      message: "Traversal visits node 11 first.",
      explanation: "Lists are followed node by node, so the search starts at the head.",
      objects: [11, 22, 33].map((value, index) => listNode(value, index, value === 11 ? "visited" : "neutral")),
      edges: listEdges([11, 22, 33]),
      labels: withIndexLabels([11, 22, 33].map((value, index) => listNode(value, index)), "list")
    })
  );
  frames.push(
    frame({
      message: "Traversal reaches node 22.",
      explanation: "The search follows the next pointer to move through the list.",
      objects: [11, 22, 33].map((value, index) =>
        listNode(value, index, value === 11 ? "visited" : value === 22 ? "active" : "neutral")
      ),
      edges: listEdges([11, 22, 33]),
      labels: withIndexLabels([11, 22, 33].map((value, index) => listNode(value, index)), "list")
    })
  );
  frames.push(
    frame({
      message: "Node 17 flies between 11 and 22.",
      explanation: "Insertion changes pointers, so the new node lands between two existing nodes.",
      objects: [
        listNode(11, 0),
        { ...listNode(17, 1, "new"), x: 330, y: 120 },
        listNode(22, 1, "selected"),
        listNode(33, 2, "selected")
      ],
      edges: listEdges([11, 22, 33])
    })
  );
  frames.push(
    frame({
      message: "Pointers reconnect around node 17.",
      explanation: "The chain now routes through 17 before continuing to 22 and 33.",
      objects: [11, 17, 22, 33].map((value, index) => listNode(value, index, value === 17 ? "active" : "neutral")),
      edges: listEdges([11, 17, 22, 33]),
      labels: withIndexLabels([11, 17, 22, 33].map((value, index) => listNode(value, index)), "list")
    })
  );
  return frames;
}

function treeLayout(values) {
  const slots = {};
  values.forEach((entry) => {
    slots[entry.id] = treeNode(entry.value, entry.x, entry.y, entry.id, entry.state || "neutral");
  });
  return slots;
}

function buildTreeFrames(values) {
  const positions = {
    root: { x: 540, y: 86 },
    left: { x: 320, y: 186 },
    right: { x: 760, y: 186 },
    leftleft: { x: 200, y: 286 },
    leftright: { x: 420, y: 286 },
    rightleft: { x: 650, y: 286 },
    rightright: { x: 870, y: 286 },
    rlleft: { x: 600, y: 386 },
    rlright: { x: 720, y: 386 }
  };

  const frames = [];
  const nodes = [];

  const addNode = (id, value, posKey, path = [], parentId = null) => {
    for (const step of path) {
      frames.push(
        frame({
          message: `Value ${value} compares with ${step.value} and moves ${step.direction}.`,
          explanation: "Binary search tree insertion follows left for smaller values and right for larger ones.",
          objects: nodes.map((node) => treeNode(node.value, node.x, node.y, node.id, node.id === step.id ? "active" : "selected")),
          edges: nodes
            .filter((node) => node.parentId)
            .map((node) => ({
              id: `${node.parentId}-${node.id}`,
              x1: positions[node.parentKey].x,
              y1: positions[node.parentKey].y + 18,
              x2: node.x,
              y2: node.y - 18
            }))
        })
      );
    }

    frames.push(
      frame({
        message: `Value ${value} descends into place.`,
        explanation: "The new node travels down the chosen branch before settling into its slot.",
        objects: nodes
          .map((node) => treeNode(node.value, node.x, node.y, node.id))
          .concat([treeNode(value, positions.root.x, 20, id, "new")]),
        edges: nodes
          .filter((node) => node.parentId)
          .map((node) => ({
            id: `${node.parentId}-${node.id}`,
            x1: positions[node.parentKey].x,
            y1: positions[node.parentKey].y + 18,
            x2: node.x,
            y2: node.y - 18
          }))
      })
    );

    nodes.push({
      id,
      value,
      x: positions[posKey].x,
      y: positions[posKey].y,
      parentId,
      parentKey: parentId ? nodes.find((node) => node.id === parentId).slot : null,
      slot: posKey
    });

    frames.push(
      frame({
        message: `Value ${value} locks into the tree.`,
        explanation: "Once it reaches its destination, the new node becomes part of the tree structure.",
        objects: nodes.map((node) => treeNode(node.value, node.x, node.y, node.id, node.id === id ? "active" : "neutral")),
        edges: nodes
          .filter((node) => node.parentId)
          .map((node) => {
            const parent = nodes.find((candidate) => candidate.id === node.parentId);
            return {
              id: `${parent.id}-${node.id}`,
              x1: parent.x,
              y1: parent.y + 18,
              x2: node.x,
              y2: node.y - 18
            };
          })
      })
    );
  };

  addNode("n50", 50, "root");
  addNode("n25", 25, "left", [{ id: "n50", value: 50, direction: "left" }], "n50");
  addNode("n75", 75, "right", [{ id: "n50", value: 50, direction: "right" }], "n50");
  addNode(
    "n10",
    10,
    "leftleft",
    [
      { id: "n50", value: 50, direction: "left" },
      { id: "n25", value: 25, direction: "left" }
    ],
    "n25"
  );
  addNode(
    "n30",
    30,
    "leftright",
    [
      { id: "n50", value: 50, direction: "left" },
      { id: "n25", value: 25, direction: "right" }
    ],
    "n25"
  );
  addNode(
    "n60",
    60,
    "rightleft",
    [
      { id: "n50", value: 50, direction: "right" },
      { id: "n75", value: 75, direction: "left" }
    ],
    "n75"
  );

  return frames;
}

function buildBubbleSortFrames(values) {
  const frames = [];
  const items = [...values];

  frames.push(
    frame({
      message: "Bubble sort starts with an unsorted array.",
      explanation: "Now we watch values compare and swap positions until larger ones drift right.",
      objects: items.map((value, index) => arraySlot(value, index)),
      labels: withIndexLabels(items.map((value, index) => arraySlot(value, index)), "idx")
    })
  );

  for (let end = items.length - 1; end > 0; end -= 1) {
    for (let index = 0; index < end; index += 1) {
      frames.push(
        frame({
          message: `Compare ${items[index]} and ${items[index + 1]}.`,
          explanation: "Bubble sort checks adjacent values one pair at a time.",
          objects: items.map((value, itemIndex) =>
            arraySlot(value, itemIndex, itemIndex === index || itemIndex === index + 1 ? "active" : itemIndex > end ? "selected" : "neutral")
          ),
          labels: withIndexLabels(items.map((value, itemIndex) => arraySlot(value, itemIndex)), "idx")
        })
      );

      if (items[index] > items[index + 1]) {
        const left = items[index];
        const right = items[index + 1];
        frames.push(
          frame({
            message: `Swap ${left} and ${right}.`,
            explanation: "The larger value moves right while the smaller value moves left.",
            objects: items.map((value, itemIndex) => {
              if (itemIndex === index) {
                return { ...arraySlot(left, index, "new"), x: 84 + (index + 1) * 114 };
              }
              if (itemIndex === index + 1) {
                return { ...arraySlot(right, index + 1, "new"), x: 84 + index * 114 };
              }
              return arraySlot(value, itemIndex, itemIndex > end ? "selected" : "neutral");
            }),
            labels: withIndexLabels(items.map((value, itemIndex) => arraySlot(value, itemIndex)), "idx")
          })
        );
        items[index] = right;
        items[index + 1] = left;
      }
    }
  }

  frames.push(
    frame({
      message: "Bubble sort is complete.",
      explanation: "The final order shows the accumulated effect of all those pairwise swaps.",
      objects: items.map((value, index) => arraySlot(value, index, "active")),
      labels: withIndexLabels(items.map((value, index) => arraySlot(value, index)), "idx")
    })
  );

  return frames;
}

function buildSelectionSortFrames(values) {
  const frames = [];
  const items = [...values];

  for (let start = 0; start < items.length - 1; start += 1) {
    let minIndex = start;
    frames.push(
      frame({
        message: `Selection sort starts pass ${start + 1}.`,
        explanation: "This pass looks for the smallest value in the unsorted region.",
        objects: items.map((value, index) => arraySlot(value, index, index === start ? "active" : index < start ? "selected" : "neutral")),
        labels: withIndexLabels(items.map((value, index) => arraySlot(value, index)), "idx")
      })
    );

    for (let index = start + 1; index < items.length; index += 1) {
      frames.push(
        frame({
          message: `Compare ${items[index]} with current minimum ${items[minIndex]}.`,
          explanation: "Selection sort scans the whole unsorted region before making one swap.",
          objects: items.map((value, itemIndex) =>
            arraySlot(
              value,
              itemIndex,
              itemIndex === minIndex ? "selected" : itemIndex === index ? "active" : itemIndex < start ? "visited" : "neutral"
            )
          ),
          labels: withIndexLabels(items.map((value, itemIndex) => arraySlot(value, itemIndex)), "idx")
        })
      );

      if (items[index] < items[minIndex]) {
        minIndex = index;
      }
    }

    if (minIndex !== start) {
      const left = items[start];
      const min = items[minIndex];
      frames.push(
        frame({
          message: `Move minimum ${min} into index ${start}.`,
          explanation: "Once the smallest value is known, selection sort performs its swap.",
          objects: items.map((value, index) => {
            if (index === start) {
              return { ...arraySlot(left, index, "new"), x: 84 + minIndex * 114 };
            }
            if (index === minIndex) {
              return { ...arraySlot(min, minIndex, "new"), x: 84 + start * 114 };
            }
            return arraySlot(value, index, index < start ? "visited" : "neutral");
          }),
          labels: withIndexLabels(items.map((value, index) => arraySlot(value, index)), "idx")
        })
      );
      items[start] = min;
      items[minIndex] = left;
    }
  }

  frames.push(
    frame({
      message: "Selection sort is complete.",
      explanation: "Each pass placed one minimum into its final slot.",
      objects: items.map((value, index) => arraySlot(value, index, "active")),
      labels: withIndexLabels(items.map((value, index) => arraySlot(value, index)), "idx")
    })
  );

  return frames;
}

function buildBinarySearchFrames(values, target) {
  const frames = [];
  let low = 0;
  let high = values.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    frames.push(
      frame({
        message: `Search range is ${low} through ${high}.`,
        explanation: "Binary search keeps shrinking the range around the target.",
        objects: values.map((value, index) =>
          arraySlot(
            value,
            index,
            index === low || index === high ? "selected" : index === mid ? "active" : index < low || index > high ? "muted" : "neutral"
          )
        ),
        labels: withIndexLabels(values.map((value, index) => arraySlot(value, index)), "idx").concat([
          { id: "low-marker", text: `low ${low}`, x: 130 + low * 114, y: 76 },
          { id: "mid-marker", text: `mid ${mid}`, x: 130 + mid * 114, y: 104 },
          { id: "high-marker", text: `high ${high}`, x: 130 + high * 114, y: 132 }
        ])
      })
    );

    if (values[mid] === target) {
      frames.push(
        frame({
          message: `Target ${target} is found at index ${mid}.`,
          explanation: "The midpoint matches the target, so the search stops here.",
          objects: values.map((value, index) => arraySlot(value, index, index === mid ? "active" : "muted")),
          labels: withIndexLabels(values.map((value, index) => arraySlot(value, index)), "idx")
        })
      );
      return frames;
    }

    if (values[mid] < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  frames.push(
    frame({
      message: `Target ${target} is not in the list.`,
      explanation: "Once low passes high, the search window is empty and the search is over.",
      objects: values.map((value, index) => arraySlot(value, index, "muted")),
      labels: withIndexLabels(values.map((value, index) => arraySlot(value, index)), "idx")
    })
  );

  return frames;
}

const VISUALIZATIONS = [
  {
    id: "array",
    mode: "structure",
    label: "Array",
    applyLabel: "Append",
    description: "Arrays store values by index. The visual focus here is how insertion and removal force values to slide between slots.",
    presets: [
      { id: "short-shuffle", label: "Short shuffle", values: [34, 12, 67, 23, 89, 45] },
      { id: "wide-spread", label: "Wide spread", values: [91, 17, 63, 28, 75, 49, 6, 52] },
      { id: "nearly-sorted", label: "Nearly sorted", values: [10, 20, 30, 50, 40, 60, 70] }
    ],
    buildPresetFrames(preset, customValue) {
      const values = [...preset.values];
      if (Number.isFinite(customValue)) {
        values.push(customValue);
      }
      return buildArrayConstruction(values);
    },
    buildRecommendedFrames() {
      return buildArrayRecommended();
    }
  },
  {
    id: "stack",
    mode: "structure",
    label: "Stack",
    applyLabel: "Push",
    description: "Stacks grow and shrink from the top. The motion here shows push, peek, and pop as vertical actions.",
    presets: [
      { id: "small-stack", label: "Small stack", values: [12, 24, 36, 48] },
      { id: "mixed-values", label: "Mixed values", values: [9, 31, 14, 57, 22] },
      { id: "tall-stack", label: "Tall stack", values: [5, 10, 15, 20, 25, 30] }
    ],
    buildPresetFrames(preset, customValue) {
      const values = [...preset.values];
      if (Number.isFinite(customValue)) {
        values.push(customValue);
      }
      return buildStackConstruction(values);
    },
    buildRecommendedFrames() {
      return buildStackRecommended();
    }
  },
  {
    id: "queue",
    mode: "structure",
    label: "Queue",
    applyLabel: "Enqueue",
    description: "Queues add at the back and remove at the front. This animation is designed around that side-to-side flow.",
    presets: [
      { id: "ticket-line", label: "Ticket line", values: [18, 26, 31, 44] },
      { id: "balanced-queue", label: "Balanced queue", values: [7, 14, 21, 28, 35] },
      { id: "busy-line", label: "Busy line", values: [4, 11, 19, 27, 34, 41] }
    ],
    buildPresetFrames(preset, customValue) {
      const values = [...preset.values];
      if (Number.isFinite(customValue)) {
        values.push(customValue);
      }
      return buildQueueConstruction(values);
    },
    buildRecommendedFrames() {
      return buildQueueRecommended();
    }
  },
  {
    id: "linked-list",
    mode: "structure",
    label: "Linked List",
    applyLabel: "Append",
    description: "Linked lists are about node order and pointer flow. The animation makes nodes travel in and visibly connect with next pointers.",
    presets: [
      { id: "short-chain", label: "Short chain", values: [11, 22, 33, 44] },
      { id: "mixed-chain", label: "Mixed chain", values: [5, 19, 8, 27, 13] },
      { id: "long-chain", label: "Long chain", values: [3, 6, 9, 12, 15, 18, 21] }
    ],
    buildPresetFrames(preset, customValue) {
      const values = [...preset.values];
      if (Number.isFinite(customValue)) {
        values.push(customValue);
      }
      return buildLinkedListConstruction(values);
    },
    buildRecommendedFrames() {
      return buildLinkedListRecommended();
    }
  },
  {
    id: "tree",
    mode: "structure",
    label: "Binary Search Tree",
    applyLabel: "Insert",
    description: "Binary search tree motion is about descending left or right through the structure before a node settles in place.",
    presets: [
      { id: "balanced-growth", label: "Balanced growth", values: [42, 18, 67, 9, 27, 55, 78, 63] },
      { id: "right-heavy", label: "Right heavy", values: [10, 20, 30, 40, 50, 60, 70] },
      { id: "layered-tree", label: "Layered tree", values: [50, 25, 75, 10, 30, 60, 90, 5, 15, 27, 33] }
    ],
    buildPresetFrames() {
      return buildTreeFrames();
    },
    buildRecommendedFrames() {
      return buildTreeFrames();
    }
  },
  {
    id: "bubble-sort",
    mode: "algorithm",
    label: "Bubble Sort",
    applyLabel: "Add Value",
    description: "Bubble sort repeatedly swaps adjacent values, so the visual focus is on bars trading places.",
    presets: [
      { id: "short-shuffle", label: "Short shuffle", values: [34, 12, 67, 23, 89, 45] },
      { id: "wide-spread", label: "Wide spread", values: [91, 17, 63, 28, 75, 49, 6, 52] },
      { id: "nearly-sorted", label: "Nearly sorted", values: [10, 20, 30, 50, 40, 60, 70] }
    ],
    buildPresetFrames(preset, customValue) {
      const values = [...preset.values];
      if (Number.isFinite(customValue)) {
        values.push(customValue);
      }
      return buildBubbleSortFrames(values);
    },
    buildRecommendedFrames() {
      return buildBubbleSortFrames([91, 17, 63, 28, 75, 49, 6, 52]);
    }
  },
  {
    id: "selection-sort",
    mode: "algorithm",
    label: "Selection Sort",
    applyLabel: "Add Value",
    description: "Selection sort scans for the minimum first, then performs a single swap per pass.",
    presets: [
      { id: "short-shuffle", label: "Short shuffle", values: [34, 12, 67, 23, 89, 45] },
      { id: "wide-spread", label: "Wide spread", values: [91, 17, 63, 28, 75, 49, 6, 52] },
      { id: "nearly-sorted", label: "Nearly sorted", values: [10, 20, 30, 50, 40, 60, 70] }
    ],
    buildPresetFrames(preset, customValue) {
      const values = [...preset.values];
      if (Number.isFinite(customValue)) {
        values.push(customValue);
      }
      return buildSelectionSortFrames(values);
    },
    buildRecommendedFrames() {
      return buildSelectionSortFrames([34, 12, 67, 23, 89, 45]);
    }
  },
  {
    id: "binary-search",
    mode: "algorithm",
    label: "Binary Search",
    applyLabel: "Set Target",
    description: "Binary search visually narrows the active range until the midpoint finds the target or the range disappears.",
    presets: [
      { id: "small-range", label: "Small range", values: [4, 9, 12, 18, 24, 31, 37], target: 18 },
      { id: "balanced-search", label: "Balanced search", values: [5, 11, 16, 23, 38, 41, 59, 72], target: 41 },
      { id: "missing-target", label: "Missing target", values: [6, 13, 19, 27, 34, 46, 58, 69], target: 35 }
    ],
    buildPresetFrames(preset, customValue) {
      const target = Number.isFinite(customValue) ? customValue : preset.target;
      return buildBinarySearchFrames(preset.values, target);
    },
    buildRecommendedFrames() {
      return buildBinarySearchFrames([6, 13, 19, 27, 34, 46, 58, 69], 35);
    }
  }
];

const visualizationMap = new Map(VISUALIZATIONS.map((entry) => [entry.id, entry]));

function getCurrentVisualization() {
  return visualizationMap.get(player.currentVisualizationId);
}

function getModeVisualizations(mode) {
  return VISUALIZATIONS.filter((entry) => entry.mode === mode);
}

function getCurrentPreset() {
  const visualization = getCurrentVisualization();
  return visualization.presets.find((preset) => preset.id === player.currentPresetId) || visualization.presets[0];
}

function updateLessonCopy() {
  const visualization = getCurrentVisualization();
  visualizationTitle.textContent = visualization.label;
  structureDescription.textContent = visualization.description;
  applyValueBtn.textContent = visualization.applyLabel;
}

function getPresetDescription(definitionId, preset) {
  return PRESET_NOTES[definitionId]?.[preset.id] || "A visual walkthrough of this preset.";
}

function getPresetValueSummary(preset) {
  if (Array.isArray(preset.values)) {
    return `Preset: ${preset.values.join(", ")}${typeof preset.target === "number" ? ` | target ${preset.target}` : ""}`;
  }
  return typeof preset.target === "number" ? `Target: ${preset.target}` : "";
}

function rebuildVisualizationOptions() {
  const options = getModeVisualizations(player.currentMode);
  visualizationSelect.innerHTML = "";
  for (const option of options) {
    const element = document.createElement("option");
    element.value = option.id;
    element.textContent = option.label;
    visualizationSelect.appendChild(element);
  }

  if (!options.some((option) => option.id === player.currentVisualizationId)) {
    player.currentVisualizationId = options[0].id;
  }

  visualizationSelect.value = player.currentVisualizationId;
}

function rebuildPresetOptions() {
  const visualization = getCurrentVisualization();
  presetSelect.innerHTML = "";
  for (const preset of visualization.presets) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    presetSelect.appendChild(option);
  }

  if (!visualization.presets.some((preset) => preset.id === player.currentPresetId)) {
    player.currentPresetId = visualization.presets[0].id;
  }

  presetSelect.value = player.currentPresetId;
}

function rebuildPresetGallery() {
  const visualization = getCurrentVisualization();
  presetGallery.innerHTML = "";

  for (const preset of visualization.presets) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "preset-card";
    if (preset.id === player.currentPresetId) {
      card.classList.add("is-selected");
    }

    const title = document.createElement("span");
    title.className = "preset-card-title";
    title.textContent = preset.label;

    const copy = document.createElement("span");
    copy.className = "preset-card-copy";
    copy.textContent = getPresetDescription(visualization.id, preset);

    const values = document.createElement("span");
    values.className = "preset-values";
    values.textContent = getPresetValueSummary(preset);

    card.append(title, copy, values);
    card.addEventListener("click", () => {
      player.currentPresetId = preset.id;
      player.sceneType = "preset";
      rebuildPresetGallery();
      loadFrames(false);
      play();
    });
    presetGallery.appendChild(card);
  }
}

function buildFrames() {
  const visualization = getCurrentVisualization();
  if (player.sceneType === "recommended") {
    return visualization.buildRecommendedFrames();
  }

  return visualization.buildPresetFrames(getCurrentPreset(), player.customValue);
}

function syncStatus() {
  const scene = player.frames[player.frameIndex];
  if (!scene) {
    statusText.textContent = "No demo loaded.";
    stepExplanation.textContent = "Pick a visualization to begin.";
    opCounter.textContent = "0 / 0 scenes";
    return;
  }

  statusText.textContent = scene.message;
  stepExplanation.textContent = scene.explanation;
  opCounter.textContent = `${player.frameIndex + 1} / ${player.frames.length} scenes`;
}

function renderCurrentScene(immediate = false) {
  renderScene(player.frames[player.frameIndex], immediate);
  syncStatus();
  pauseBtn.disabled = !player.playing;
  stepBackBtn.disabled = player.frameIndex === 0;
  stepBtn.disabled = player.frameIndex >= player.frames.length - 1;
}

function loadFrames(immediate = true) {
  clearTimers();
  player.playing = false;
  player.frames = buildFrames();
  player.frameIndex = 0;
  renderCurrentScene(immediate);
  updateLessonCopy();
}

function nextFrame() {
  if (player.frameIndex >= player.frames.length - 1) {
    player.playing = false;
    syncStatus();
    return false;
  }

  player.frameIndex += 1;
  renderCurrentScene(false);
  return true;
}

function scheduleNext() {
  clearTimers();
  if (!player.playing) {
    return;
  }

  player.timer = setTimeout(() => {
    if (!player.playing) {
      return;
    }
    const advanced = nextFrame();
    if (advanced) {
      scheduleNext();
    } else {
      player.playing = false;
      pauseBtn.disabled = true;
    }
  }, Math.round(currentSpeed() * 1.15));
}

function play() {
  if (!player.frames.length) {
    return;
  }

  if (player.frameIndex >= player.frames.length - 1) {
    player.frameIndex = 0;
    renderCurrentScene(true);
  }

  player.playing = true;
  renderCurrentScene(true);
  scheduleNext();
}

function pause() {
  player.playing = false;
  clearTimers();
  pauseBtn.disabled = true;
}

function stepForward() {
  pause();
  nextFrame();
}

function stepBackward() {
  pause();
  if (player.frameIndex > 0) {
    player.frameIndex -= 1;
    renderCurrentScene(true);
  }
}

function resetPlayback() {
  pause();
  player.frameIndex = 0;
  renderCurrentScene(true);
}

function applyCustomValue() {
  const visualization = getCurrentVisualization();
  const value = Number(valueInput.value);
  if (!Number.isFinite(value)) {
    return;
  }

  player.sceneType = "preset";
  player.customValue = value;
  statusText.textContent =
    visualization.id === "binary-search"
      ? `Target is set to ${value}.`
      : `Custom value ${value} is added to this walkthrough.`;
  loadFrames(false);
}

function playRecommended() {
  player.sceneType = "recommended";
  player.customValue = null;
  loadFrames(true);
  play();
}

modeSelect.addEventListener("change", () => {
  player.currentMode = modeSelect.value;
  const nextVisualization = getModeVisualizations(player.currentMode)[0];
  player.currentVisualizationId = nextVisualization.id;
  player.currentPresetId = nextVisualization.presets[0].id;
  player.sceneType = "preset";
  player.customValue = null;
  rebuildVisualizationOptions();
  rebuildPresetOptions();
  rebuildPresetGallery();
  loadFrames(true);
});

visualizationSelect.addEventListener("change", () => {
  player.currentVisualizationId = visualizationSelect.value;
  player.currentPresetId = getCurrentVisualization().presets[0].id;
  player.sceneType = "preset";
  player.customValue = null;
  rebuildPresetOptions();
  rebuildPresetGallery();
  loadFrames(true);
});

presetSelect.addEventListener("change", () => {
  player.currentPresetId = presetSelect.value;
  player.sceneType = "preset";
  player.customValue = null;
  rebuildPresetGallery();
  loadFrames(true);
});

applyValueBtn.addEventListener("click", applyCustomValue);
valueInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    applyCustomValue();
  }
});

speedInput.addEventListener("input", () => {
  updateSpeedLabel();
});

playBtn.addEventListener("click", play);
pauseBtn.addEventListener("click", pause);
stepBtn.addEventListener("click", stepForward);
stepBackBtn.addEventListener("click", stepBackward);
resetBtn.addEventListener("click", resetPlayback);
playRecommendedBtn.addEventListener("click", playRecommended);

player.currentMode = modeSelect.value;
player.currentVisualizationId = visualizationSelect.value;
player.currentPresetId = getCurrentVisualization().presets[0].id;

updateSpeedLabel();
rebuildVisualizationOptions();
rebuildPresetOptions();
rebuildPresetGallery();
loadFrames(true);
