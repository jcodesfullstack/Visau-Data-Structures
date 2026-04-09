const SVG_NS = "http://www.w3.org/2000/svg";
const VIEWBOX_WIDTH = 1080;
const VIEWBOX_HEIGHT = 620;
const TREE_NODE_RADIUS = 28;

const layerState = new WeakMap();
const activeAnimations = new WeakMap();

function svg(tagName, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tagName);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) {
      node.setAttribute(key, String(value));
    }
  }
  return node;
}

function getLayerMaps(layers) {
  if (!layerState.has(layers)) {
    layerState.set(layers, {
      backdrop: new Map(),
      edges: new Map(),
      nodes: new Map(),
      labels: new Map()
    });
  }

  return layerState.get(layers);
}

function normalizeIdEntry(entry) {
  if (typeof entry === "string") {
    return entry;
  }

  if (typeof entry === "number" && Number.isFinite(entry)) {
    return `value-${entry}`;
  }

  if (entry && typeof entry === "object") {
    if (typeof entry.id === "string") {
      return entry.id;
    }

    if (typeof entry.value === "number" && Number.isFinite(entry.value)) {
      return `value-${entry.value}`;
    }
  }

  return null;
}

function collectIds(values = []) {
  const list = Array.isArray(values) ? values.flat(Infinity) : [values];
  return list.map(normalizeIdEntry).filter(Boolean);
}

function toIdSet(values = []) {
  return new Set(collectIds(values));
}

function deriveHighlightSets(state = {}, view = {}) {
  const highlights = view?.highlights ?? {};
  return {
    activeIds: toIdSet(highlights.activeIds ?? state.activeIds),
    freshIds: toIdSet(highlights.freshIds ?? state.freshIds),
    selectedIds: toIdSet(highlights.selectedIds ?? state.selectedIds),
    visitedIds: toIdSet(highlights.visitedIds ?? state.visitedIds),
    frontierIds: toIdSet(highlights.frontierIds ?? state.frontierIds),
    mutedIds: toIdSet(highlights.mutedIds ?? state.mutedIds)
  };
}

function resetHighlightClasses(group) {
  group.classList.remove("is-active", "is-new", "is-selected", "is-visited", "is-frontier", "is-muted");
}

function applyHighlightClasses(group, id, sets) {
  resetHighlightClasses(group);

  if (sets.activeIds.has(id)) {
    group.classList.add("is-active");
  }
  if (sets.freshIds.has(id)) {
    group.classList.add("is-new");
  }
  if (sets.selectedIds.has(id)) {
    group.classList.add("is-selected");
  }
  if (sets.visitedIds.has(id)) {
    group.classList.add("is-visited");
  }
  if (sets.frontierIds.has(id)) {
    group.classList.add("is-frontier");
  }
  if (sets.mutedIds.has(id)) {
    group.classList.add("is-muted");
  }
}

function getAnimationDurationMs() {
  const value = globalThis.getComputedStyle?.(document.documentElement)?.getPropertyValue("--speed-ms") || "650ms";
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : 650;
}

function easeOutCubic(value) {
  return 1 - (1 - value) ** 3;
}

function applyTranslate(element, x, y) {
  element.setAttribute("transform", `translate(${x} ${y})`);
}

function setTranslate(element, x, y, immediate = false) {
  const nextPosition = { x, y };
  const existing = activeAnimations.get(element);

  if (existing?.frameId) {
    cancelAnimationFrame(existing.frameId);
  }

  if (!existing || immediate) {
    applyTranslate(element, x, y);
    activeAnimations.set(element, { position: nextPosition, frameId: null });
    return;
  }

  const startPosition = existing.position;
  if (
    Math.abs(startPosition.x - nextPosition.x) < 0.5 &&
    Math.abs(startPosition.y - nextPosition.y) < 0.5
  ) {
    applyTranslate(element, x, y);
    activeAnimations.set(element, { position: nextPosition, frameId: null });
    return;
  }

  const durationMs = getAnimationDurationMs();
  const startedAt = performance.now();

  const tick = (now) => {
    const elapsed = now - startedAt;
    const progress = Math.min(1, elapsed / durationMs);
    const eased = easeOutCubic(progress);
    const currentX = startPosition.x + (nextPosition.x - startPosition.x) * eased;
    const currentY = startPosition.y + (nextPosition.y - startPosition.y) * eased;

    applyTranslate(element, currentX, currentY);

    if (progress < 1) {
      const frameId = requestAnimationFrame(tick);
      activeAnimations.set(element, { position: nextPosition, frameId });
      return;
    }

    activeAnimations.set(element, { position: nextPosition, frameId: null });
  };

  const frameId = requestAnimationFrame(tick);
  activeAnimations.set(element, { position: startPosition, frameId });
}

function markEntering(element) {
  element.classList.add("is-entering");
  requestAnimationFrame(() => {
    element.classList.remove("is-entering");
  });
}

function upsert(map, parent, key, tagName, className = "") {
  let element = map.get(key);

  if (!element) {
    element = svg(tagName);
    element.dataset.key = key;
    if (className) {
      element.setAttribute("class", className);
    }
    parent.appendChild(element);
    map.set(key, element);
    markEntering(element);
    activeAnimations.set(element, { position: { x: 0, y: 0 }, frameId: null });
  } else if (element.parentNode !== parent) {
    parent.appendChild(element);
  }

  return element;
}

function prune(map, keepKeys) {
  for (const [key, element] of map.entries()) {
    if (!keepKeys.has(key)) {
      element.remove();
      map.delete(key);
    }
  }
}

function ensureBackdropGrid(layers, maps) {
  const grid = upsert(maps.backdrop, layers.backdrop, "grid", "g", "viz-backdrop-grid");
  if (grid.childNodes.length === 0) {
    for (let y = 80; y <= VIEWBOX_HEIGHT; y += 90) {
      grid.appendChild(
        svg("line", {
          x1: 30,
          x2: VIEWBOX_WIDTH - 30,
          y1: y,
          y2: y
        })
      );
    }
  }
}

function remember(seenSet, key) {
  seenSet.add(key);
}

function upsertText(parent, className = "") {
  let text = parent.querySelector("text");
  if (!text) {
    text = svg("text");
    if (className) {
      text.setAttribute("class", className);
    }
    parent.appendChild(text);
  }
  return text;
}

function renderFloatingLabel(maps, layers, seen, key, textValue, x, y, className = "viz-label") {
  const group = upsert(maps.labels, layers.labels, key, "g", className);
  remember(seen.labels, key);
  setTranslate(group, x, y);
  const text = upsertText(group);
  text.textContent = textValue;
}

function getOverridePosition(layout, id) {
  return layout?.focus?.overridePositions?.[id] || null;
}

function renderRectNode(maps, layers, seen, slot, sets) {
  const group = upsert(maps.nodes, layers.nodes, slot.id, "g", "viz-node");
  remember(seen.nodes, slot.id);
  const override = getOverridePosition({ focus: slot.focus || null }, slot.id);
  const x = override?.x ?? slot.x;
  const y = override?.y ?? slot.y;
  setTranslate(group, x, y);
  applyHighlightClasses(group, slot.id, sets);

  let rect = group.querySelector("rect");
  if (!rect) {
    rect = svg("rect");
    group.appendChild(rect);
  }
  rect.setAttribute("width", String(slot.width));
  rect.setAttribute("height", String(slot.height));
  rect.setAttribute("rx", "24");
  rect.setAttribute("ry", "24");

  const text = upsertText(group);
  text.setAttribute("x", String(slot.width / 2));
  text.setAttribute("y", String(slot.height / 2));
  text.textContent = String(slot.value);

  if (slot.label) {
    renderFloatingLabel(
      maps,
      layers,
      seen,
      `label:${slot.id}`,
      slot.label,
      slot.x + slot.width / 2,
      slot.y - 18
    );
  }
}

function renderArrayLayout(maps, layers, seen, layout, sets) {
  for (const slot of layout.slots ?? []) {
    const group = upsert(maps.nodes, layers.nodes, slot.id, "g", "viz-bar");
    remember(seen.nodes, slot.id);
    const override = getOverridePosition(layout, slot.id);
    const x = override?.x ?? slot.x;
    const y = override?.y ?? slot.y;
    setTranslate(group, x, y);
    applyHighlightClasses(group, slot.id, sets);

    let rect = group.querySelector("rect");
    if (!rect) {
      rect = svg("rect");
      group.appendChild(rect);
    }
    rect.setAttribute("width", String(slot.width));
    rect.setAttribute("height", String(slot.height));

    const text = upsertText(group);
    text.setAttribute("x", String(slot.width / 2));
    text.setAttribute("y", String(slot.height - 26));
    text.textContent = String(slot.value);

    renderFloatingLabel(maps, layers, seen, `index:${slot.id}`, slot.label, slot.x + slot.width / 2, 560);
  }
}

function renderTrack(maps, layers, seen, key, attributes) {
  const track = upsert(maps.backdrop, layers.backdrop, key, "rect", "track");
  remember(seen.backdrop, key);
  for (const [name, value] of Object.entries(attributes)) {
    track.setAttribute(name, String(value));
  }
}

function renderLinearLayout(maps, layers, seen, layout, sets) {
  if (!layout) {
    return;
  }

  if (layout.type === "array") {
    renderArrayLayout(maps, layers, seen, layout, sets);
    return;
  }

  if (layout.type === "stack") {
    renderTrack(maps, layers, seen, "stack-track", {
      x: 406,
      y: 82,
      width: 268,
      height: 470,
      rx: 24,
      fill: "rgba(255,255,255,0.06)"
    });

    for (const slot of layout.slots ?? []) {
      renderRectNode(maps, layers, seen, { ...slot, focus: layout.focus }, sets);
    }
    return;
  }

  if (layout.type === "queue") {
    renderTrack(maps, layers, seen, "queue-track", {
      x: 56,
      y: 242,
      width: 970,
      height: 154,
      rx: 28,
      fill: "rgba(255,255,255,0.06)"
    });

    for (const slot of layout.slots ?? []) {
      renderRectNode(maps, layers, seen, { ...slot, focus: layout.focus }, sets);
    }
    return;
  }

  if (layout.type === "linked-list") {
    for (const edge of layout.edges ?? []) {
      const line = upsert(maps.edges, layers.edges, `${edge.from}:${edge.to}`, "line", "edge");
      remember(seen.edges, `${edge.from}:${edge.to}`);
      line.setAttribute("x1", String(edge.x1));
      line.setAttribute("y1", String(edge.y1));
      line.setAttribute("x2", String(edge.x2));
      line.setAttribute("y2", String(edge.y2));

      renderFloatingLabel(
        maps,
        layers,
        seen,
        `pointer:${edge.from}:${edge.to}`,
        "next",
        edge.x2 - 14,
        edge.y2 - 10,
        "viz-label pointer-label"
      );
    }

    for (const node of layout.nodes ?? []) {
      renderRectNode(maps, layers, seen, { ...node, focus: layout.focus }, sets);
    }
  }
}

function renderTreeState(maps, layers, seen, state, sets) {
  const nodes = state.nodes ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));

  for (const node of nodes) {
    if (!node.parentId || !byId.has(node.parentId)) {
      continue;
    }

    const parent = byId.get(node.parentId);
    const line = upsert(maps.edges, layers.edges, `${parent.id}:${node.id}`, "line", "edge");
    remember(seen.edges, `${parent.id}:${node.id}`);
    line.setAttribute("x1", String(parent.x));
    line.setAttribute("y1", String(parent.y + TREE_NODE_RADIUS / 2));
    line.setAttribute("x2", String(node.x));
    line.setAttribute("y2", String(node.y - TREE_NODE_RADIUS / 2));
  }

  for (const node of nodes) {
    const group = upsert(maps.nodes, layers.nodes, node.id, "g", "viz-node");
    remember(seen.nodes, node.id);
    setTranslate(group, node.x, node.y);
    applyHighlightClasses(group, node.id, sets);

    let circle = group.querySelector("circle");
    if (!circle) {
      circle = svg("circle");
      group.appendChild(circle);
    }
    circle.setAttribute("r", String(TREE_NODE_RADIUS));

    const text = upsertText(group);
    text.textContent = String(node.value);
  }
}

function toAlgorithmSlots(values = []) {
  const counts = new Map();
  return values.map((value, index) => {
    const seen = counts.get(value) || 0;
    counts.set(value, seen + 1);
    return {
      id: `value:${value}:${seen}`,
      value,
      index
    };
  });
}

function remapAlgorithmIds(sourceSet, slots) {
  const remapped = new Set();
  for (const slot of slots) {
    if (sourceSet.has(`value-${slot.index}`)) {
      remapped.add(slot.id);
    }
  }
  return remapped;
}

function renderAlgorithmArray(maps, layers, seen, state, sets) {
  const values = Array.isArray(state.values) ? state.values : [];
  const slots = toAlgorithmSlots(values);
  const maxValue = Math.max(1, ...values.map((value) => Math.abs(value)));
  const barWidth = 90;
  const gap = 24;
  const startX = 84;
  const baseY = 520;

  slots.forEach((slot) => {
    const height = 90 + (Math.abs(slot.value) / maxValue) * 250;
    const x = startX + slot.index * (barWidth + gap);
    const y = baseY - height;

    const group = upsert(maps.nodes, layers.nodes, slot.id, "g", "viz-bar");
    remember(seen.nodes, slot.id);
    setTranslate(group, x, y);

    const algorithmSets = {
      ...sets,
      activeIds: remapAlgorithmIds(sets.activeIds, slots),
      selectedIds: remapAlgorithmIds(sets.selectedIds, slots),
      visitedIds: remapAlgorithmIds(sets.visitedIds, slots),
      frontierIds: remapAlgorithmIds(sets.frontierIds, slots),
      freshIds: remapAlgorithmIds(sets.freshIds, slots),
      mutedIds: remapAlgorithmIds(sets.mutedIds, slots)
    };

    applyHighlightClasses(group, slot.id, algorithmSets);

    let rect = group.querySelector("rect");
    if (!rect) {
      rect = svg("rect");
      group.appendChild(rect);
    }
    rect.setAttribute("width", String(barWidth));
    rect.setAttribute("height", String(height));

    const text = upsertText(group);
    text.setAttribute("x", String(barWidth / 2));
    text.setAttribute("y", String(height - 26));
    text.textContent = String(slot.value);

    renderFloatingLabel(maps, layers, seen, `index:${slot.id}`, `idx ${slot.index}`, x + barWidth / 2, 560);
  });

  const markers = [];
  if (Number.isInteger(state.low)) {
    markers.push({ key: "low", label: `low ${state.low}`, index: state.low });
  }
  if (Number.isInteger(state.midIndex)) {
    markers.push({ key: "mid", label: `mid ${state.midIndex}`, index: state.midIndex });
  }
  if (Number.isInteger(state.high)) {
    markers.push({ key: "high", label: `high ${state.high}`, index: state.high });
  }

  markers.forEach((marker, markerIndex) => {
    const x = startX + marker.index * (barWidth + gap) + barWidth / 2;
    renderFloatingLabel(maps, layers, seen, `marker:${marker.key}`, marker.label, x, 72 + markerIndex * 24, "viz-label range-marker");
  });
}

function normalizeStateHighlights(state, view) {
  const viewHighlights = view?.highlights ?? {};
  const nextState = { ...state };

  if (Array.isArray(state.values)) {
    const activeFromState = []
      .concat(state.activeIndices ?? [])
      .concat(state.pivotIndex ?? [])
      .concat(state.midIndex ?? [])
      .map(normalizeIdEntry)
      .filter(Boolean);

    const selectedFromState = []
      .concat(state.sortedIndices ?? [])
      .map(normalizeIdEntry)
      .filter(Boolean);

    nextState.activeIds = viewHighlights.activeIds ?? activeFromState;
    nextState.selectedIds = viewHighlights.selectedIds ?? selectedFromState;
    nextState.freshIds = viewHighlights.freshIds ?? [];
    nextState.visitedIds = viewHighlights.visitedIds ?? [];
  }

  if (Array.isArray(state.nodes)) {
    nextState.activeIds = viewHighlights.activeIds ?? state.activeNodeIds ?? [];
    nextState.selectedIds = viewHighlights.selectedIds ?? state.pathNodeIds ?? [];
    nextState.visitedIds = viewHighlights.visitedIds ?? state.visitedNodeIds ?? [];
    nextState.freshIds = viewHighlights.freshIds ?? [];
  }

  return nextState;
}

export function renderVisualization(layers, state, view = {}) {
  if (!layers || !layers.backdrop || !layers.edges || !layers.nodes || !layers.labels) {
    return;
  }

  const maps = getLayerMaps(layers);
  ensureBackdropGrid(layers, maps);

  if (!state) {
    return;
  }

  const seen = {
    backdrop: new Set(["grid"]),
    edges: new Set(),
    nodes: new Set(),
    labels: new Set()
  };

  const normalizedState = normalizeStateHighlights(state, view);
  const sets = deriveHighlightSets(normalizedState, view);

  if (normalizedState.layout && normalizedState.layout.type !== "tree") {
    renderLinearLayout(maps, layers, seen, normalizedState.layout, sets);
  } else if (Array.isArray(normalizedState.nodes)) {
    renderTreeState(maps, layers, seen, normalizedState, sets);
  } else if (Array.isArray(normalizedState.values)) {
    renderAlgorithmArray(maps, layers, seen, normalizedState, sets);
  }

  prune(maps.backdrop, seen.backdrop);
  prune(maps.edges, seen.edges);
  prune(maps.nodes, seen.nodes);
  prune(maps.labels, seen.labels);
}
