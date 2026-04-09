import { createScenario } from "../core/module-contract.js";

const ARRAY_LAYOUT = {
  baseX: 84,
  baseY: 520,
  itemWidth: 92,
  gap: 22,
  minHeight: 90,
  maxHeight: 250
};

const TREE_LAYOUT = {
  width: 960,
  baseX: 80,
  baseY: 86,
  levelGap: 100
};

const DEFAULT_STEP_DURATION = 260;

let nodeCounter = 0;
let stepCounter = 0;

function nextNodeId() {
  return `node-${nodeCounter++}`;
}

function resetNodeIds() {
  nodeCounter = 0;
}

function resetStepIds() {
  stepCounter = 0;
}

function clone(value) {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toIdList(indices, prefix) {
  if (!Array.isArray(indices)) {
    return [];
  }

  return indices
    .filter((value) => Number.isInteger(value))
    .map((value) => `${prefix}-${value}`);
}

function buildViewFromState(message, state) {
  const safeState = state && typeof state === "object" ? state : {};

  if (safeState.kind === "tree" || Array.isArray(safeState.nodes)) {
    return {
      message,
      explanation: message,
      highlights: {
        activeIds: Array.isArray(safeState.activeNodeIds) ? safeState.activeNodeIds.slice() : [],
        freshIds: [],
        selectedIds: Array.isArray(safeState.pathNodeIds) ? safeState.pathNodeIds.slice() : [],
        visitedIds: Array.isArray(safeState.visitedNodeIds) ? safeState.visitedNodeIds.slice() : [],
        frontierIds: [],
        mutedIds: []
      },
      focus: clone(safeState.focus || null),
      patches: [{ type: "state", state: clone(safeState) }]
    };
  }

  const low = Number.isInteger(safeState.low) ? safeState.low : null;
  const high = Number.isInteger(safeState.high) ? safeState.high : null;
  const midIndex = Number.isInteger(safeState.midIndex) ? safeState.midIndex : null;
  const activeIndices = Array.isArray(safeState.activeIndices) ? safeState.activeIndices : [];
  const sortedIndices = Array.isArray(safeState.sortedIndices) ? safeState.sortedIndices : [];

  return {
    message,
    explanation: message,
    highlights: {
      activeIds: toIdList(activeIndices, "value"),
      freshIds: [],
      selectedIds: toIdList(sortedIndices, "value"),
      visitedIds: [],
      frontierIds: [low, midIndex, high].filter((value) => Number.isInteger(value)).map((value) => `value-${value}`),
      mutedIds: []
    },
    focus: clone(safeState.focus || null),
    patches: [{ type: "state", state: clone(safeState) }]
  };
}

function makeArrayLayout(values, focus = {}) {
  const absoluteMax = Math.max(1, ...values.map((value) => Math.abs(Number(value) || 0)));

  return {
    type: "array",
    ...ARRAY_LAYOUT,
    slots: values.map((value, index) => {
      const numeric = Number(value) || 0;
      const height = Math.round(
        ARRAY_LAYOUT.minHeight +
          (Math.abs(numeric) / absoluteMax) * (ARRAY_LAYOUT.maxHeight - ARRAY_LAYOUT.minHeight)
      );
      return {
        id: `slot-${index}`,
        index,
        value: numeric,
        x: ARRAY_LAYOUT.baseX + index * (ARRAY_LAYOUT.itemWidth + ARRAY_LAYOUT.gap),
        y: ARRAY_LAYOUT.baseY - height,
        width: ARRAY_LAYOUT.itemWidth,
        height,
        label: `idx ${index}`
      };
    }),
    focus: clone(focus)
  };
}

function makeArrayState(values = [], extras = {}) {
  const safeValues = values.map((value) => Number(value));
  return Object.freeze({
    kind: "array",
    values: safeValues,
    sortedIndices: [],
    activeIndices: [],
    pivotIndex: null,
    low: null,
    high: null,
    midIndex: null,
    foundIndex: null,
    layout: makeArrayLayout(safeValues, extras.focus || {}),
    ...extras
  });
}

function createTreeNode(value, relation = null, parentId = null, depth = 0) {
  return {
    id: nextNodeId(),
    value: Number(value),
    left: null,
    right: null,
    parentId,
    relation,
    depth,
    x: 0,
    y: 0
  };
}

function cloneTreeNode(node) {
  if (!node) {
    return null;
  }

  return {
    ...node,
    left: cloneTreeNode(node.left),
    right: cloneTreeNode(node.right)
  };
}

function walkTree(node, visit, depth = 0, index = 0, parent = null) {
  if (!node) {
    return;
  }

  visit(node, depth, index, parent);
  walkTree(node.left, visit, depth + 1, index * 2, node);
  walkTree(node.right, visit, depth + 1, index * 2 + 1, node);
}

function layoutTree(root) {
  const nodesByDepth = new Map();
  walkTree(root, (node, depth) => {
    if (!nodesByDepth.has(depth)) {
      nodesByDepth.set(depth, []);
    }
    nodesByDepth.get(depth).push(node);
  });

  nodesByDepth.forEach((nodes, depth) => {
    const gap = TREE_LAYOUT.width / (nodes.length + 1);
    nodes.forEach((node, index) => {
      node.x = TREE_LAYOUT.baseX + gap * (index + 1);
      node.y = TREE_LAYOUT.baseY + depth * TREE_LAYOUT.levelGap;
    });
  });

  return root;
}

function treeToNodes(root) {
  const nodes = [];
  walkTree(root, (node, depth, index, parent) => {
    nodes.push({
      id: node.id,
      value: node.value,
      parentId: parent ? parent.id : null,
      relation: node.relation,
      depth,
      index,
      x: node.x,
      y: node.y,
      width: 150,
      height: 72
    });
  });
  return nodes;
}

function makeTreeState(root = null, extras = {}) {
  const clonedRoot = layoutTree(cloneTreeNode(root));
  return Object.freeze({
    kind: "tree",
    root: clonedRoot,
    nodes: treeToNodes(clonedRoot),
    activeNodeIds: [],
    visitedNodeIds: [],
    pathNodeIds: [],
    insertionPath: [],
    comparisonValue: null,
    layout: { type: "tree" },
    ...extras
  });
}

function makeStep(type, message, state, extras = {}) {
  const id = typeof extras.id === "string" && extras.id.length > 0 ? extras.id : `${type}-${String(stepCounter++).padStart(3, "0")}`;
  const view = buildViewFromState(message, state);

  return {
    id,
    type,
    label: extras.label || message,
    description: extras.description || message,
    message,
    explanation: message,
    durationMs: extras.durationMs || DEFAULT_STEP_DURATION,
    state,
    view,
    meta: extras.meta || null,
    apply() {
      return clone(state);
    },
  };
}

function createSelectionSortScenario(values = []) {
  resetStepIds();
  const working = values.map((value) => Number(value));
  const steps = [];
  const sortedIndices = new Set();

  steps.push(
    makeStep(
      "load-array",
      `Loaded ${working.length} value${working.length === 1 ? "" : "s"} for selection sort.`,
      makeArrayState(working)
    )
  );

  for (let i = 0; i < working.length - 1; i += 1) {
    let minIndex = i;
    steps.push(
      makeStep(
        "select-pass",
        `Started pass ${i + 1} with ${working[i]} as the current minimum.`,
        makeArrayState(working, {
          activeIndices: [i, minIndex],
          pivotIndex: i,
          sortedIndices: Array.from(sortedIndices)
        })
      )
    );

    for (let j = i + 1; j < working.length; j += 1) {
      steps.push(
        makeStep(
          "compare",
          `Compared ${working[j]} with the current minimum ${working[minIndex]}.`,
          makeArrayState(working, {
            activeIndices: [i, minIndex, j],
            pivotIndex: i,
            sortedIndices: Array.from(sortedIndices)
          })
        )
      );

      if (working[j] < working[minIndex]) {
        minIndex = j;
        steps.push(
          makeStep(
            "new-min",
            `${working[minIndex]} is the new minimum for this pass.`,
            makeArrayState(working, {
              activeIndices: [i, minIndex],
              pivotIndex: i,
              sortedIndices: Array.from(sortedIndices)
            })
          )
        );
      }
    }

    if (minIndex !== i) {
      const left = working[i];
      working[i] = working[minIndex];
      working[minIndex] = left;
      steps.push(
        makeStep(
          "swap",
          `Swapped ${working[i]} into position ${i}.`,
          makeArrayState(working, {
            activeIndices: [i, minIndex],
            pivotIndex: i,
            sortedIndices: Array.from(sortedIndices)
          })
        )
      );
    } else {
      steps.push(
        makeStep(
          "no-swap",
          `${working[i]} was already the smallest value for this pass.`,
          makeArrayState(working, {
            activeIndices: [i],
            pivotIndex: i,
            sortedIndices: Array.from(sortedIndices)
          })
        )
      );
    }

    sortedIndices.add(i);
  }

  if (working.length) {
    sortedIndices.add(working.length - 1);
  }

  steps.push(
    makeStep(
      "done",
      "Selection sort complete.",
      makeArrayState(working, { sortedIndices: Array.from(sortedIndices) })
    )
  );

  return {
    initialState: makeArrayState(values),
    steps
  };
}

function createBinarySearchScenario(values = [], target = null) {
  resetStepIds();
  const working = values.map((value) => Number(value)).sort((a, b) => a - b);
  const targetValue = Number(target ?? working[Math.floor(working.length / 2)] ?? 0);
  const steps = [];
  let low = 0;
  let high = working.length - 1;

  steps.push(
    makeStep(
      "load-array",
      `Loaded ${working.length} sorted value${working.length === 1 ? "" : "s"} for binary search.`,
      makeArrayState(working, { low, high, foundIndex: null })
    )
  );

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    steps.push(
      makeStep(
        "probe-mid",
        `Probed index ${mid}: ${working[mid]}.`,
        makeArrayState(working, {
          activeIndices: [low, mid, high],
          low,
          high,
          midIndex: mid
        })
      )
    );

    if (working[mid] === targetValue) {
      steps.push(
        makeStep(
          "found",
          `${targetValue} was found at index ${mid}.`,
          makeArrayState(working, {
            activeIndices: [mid],
            low,
            high,
            midIndex: mid,
            foundIndex: mid
          })
        )
      );
      return {
        initialState: makeArrayState(working, {
          low: 0,
          high: working.length - 1,
          foundIndex: null
        }),
        steps
      };
    }

    if (working[mid] < targetValue) {
      steps.push(
        makeStep(
          "narrow-right",
          `${working[mid]} is too small, so the search moves right.`,
          makeArrayState(working, {
            activeIndices: [mid],
            low: mid + 1,
            high,
            midIndex: mid
          })
        )
      );
      low = mid + 1;
    } else {
      steps.push(
        makeStep(
          "narrow-left",
          `${working[mid]} is too large, so the search moves left.`,
          makeArrayState(working, {
            activeIndices: [mid],
            low,
            high: mid - 1,
            midIndex: mid
          })
        )
      );
      high = mid - 1;
    }
  }

  steps.push(
    makeStep(
      "not-found",
      `${targetValue} does not appear in the sorted list.`,
      makeArrayState(working, {
        activeIndices: [],
        low,
        high,
        foundIndex: null
      })
    )
  );

  return {
    initialState: makeArrayState(working, {
      low: 0,
      high: working.length - 1,
      foundIndex: null
    }),
    steps
  };
}

function createTreeInsertionSteps(values = []) {
  resetNodeIds();
  resetStepIds();
  let root = null;
  const steps = [];

  steps.push(
    makeStep(
      "load-tree",
      `Loaded ${values.length} value${values.length === 1 ? "" : "s"} for binary search tree insertion.`,
      makeTreeState(null, { values: clone(values) })
    )
  );

  values.forEach((value) => {
    if (!root) {
      root = createTreeNode(value, null, null, 0);
      steps.push(
        makeStep(
          "insert-root",
          `Inserted ${value} as the root node.`,
          makeTreeState(root, { values: [Number(value)] })
        )
      );
      return;
    }

    let current = root;
    const traversedIds = [];
    while (current) {
      traversedIds.push(current.id);

      if (Number(value) === current.value) {
        steps.push(
          makeStep(
            "duplicate",
            `${value} already exists in the tree, so no new node was inserted.`,
            makeTreeState(root, {
              comparisonValue: Number(value),
              pathNodeIds: traversedIds.slice(),
              activeNodeIds: [current.id]
            })
          )
        );
        return;
      }

      const direction = Number(value) < current.value ? "left" : "right";
      const next = current[direction];
      steps.push(
        makeStep(
          "compare-node",
          `Compared ${value} with ${current.value} and moved ${direction}.`,
          makeTreeState(root, {
            comparisonValue: Number(value),
            pathNodeIds: traversedIds.slice(),
            activeNodeIds: [current.id]
          })
        )
      );

      if (!next) {
        const inserted = createTreeNode(value, direction, current.id, current.depth + 1);
        current[direction] = inserted;
        traversedIds.push(inserted.id);
        steps.push(
          makeStep(
            "insert-node",
            `Inserted ${value} as the ${direction} child of ${current.value}.`,
            makeTreeState(root, {
              comparisonValue: Number(value),
              pathNodeIds: traversedIds.slice(),
              activeNodeIds: [inserted.id, current.id]
            })
          )
        );
        return;
      }

      current = next;
    }
  });

  steps.push(
    makeStep(
      "done",
      "Binary search tree insertion sequence complete.",
      makeTreeState(root, { values: clone(values) })
    )
  );

  return {
    initialState: makeTreeState(null),
    steps
  };
}

function createTreeInsertSteps(state, value) {
  resetStepIds();
  const safeValue = Number(value);
  const root = cloneTreeNode(state?.root || null);
  const steps = [];
  let workingRoot = root;

  if (!workingRoot) {
    workingRoot = createTreeNode(safeValue);
    steps.push(
      makeStep(
        "insert-root",
        `Inserted ${safeValue} as the root node.`,
        makeTreeState(workingRoot, { comparisonValue: safeValue, activeNodeIds: [workingRoot.id] })
      )
    );
    return { initialState: makeTreeState(root), steps };
  }

  let current = workingRoot;
  const traversedIds = [];
  while (current) {
    traversedIds.push(current.id);
    if (safeValue === current.value) {
      steps.push(
        makeStep(
          "duplicate",
          `${safeValue} already exists in the tree, so no node was added.`,
          makeTreeState(workingRoot, {
            comparisonValue: safeValue,
            pathNodeIds: traversedIds.slice(),
            activeNodeIds: [current.id]
          })
        )
      );
      break;
    }

    const direction = safeValue < current.value ? "left" : "right";
    const next = current[direction];
    steps.push(
      makeStep(
        "compare-node",
        `Compared ${safeValue} with ${current.value} and moved ${direction}.`,
        makeTreeState(workingRoot, {
          comparisonValue: safeValue,
          pathNodeIds: traversedIds.slice(),
          activeNodeIds: [current.id]
        })
      )
    );

    if (!next) {
      const inserted = createTreeNode(safeValue, direction, current.id, current.depth + 1);
      current[direction] = inserted;
      traversedIds.push(inserted.id);
      steps.push(
        makeStep(
          "insert-node",
          `Inserted ${safeValue} as the ${direction} child of ${current.value}.`,
          makeTreeState(workingRoot, {
            comparisonValue: safeValue,
            pathNodeIds: traversedIds.slice(),
            activeNodeIds: [inserted.id, current.id]
          })
        )
      );
      break;
    }

    current = next;
  }

  return {
    initialState: makeTreeState(root),
    steps
  };
}

const bstPresets = Object.freeze([
  Object.freeze({ id: "balanced-growth", label: "Balanced growth", values: [42, 18, 67, 9, 27, 55, 78, 63] }),
  Object.freeze({ id: "right-heavy", label: "Right heavy", values: [10, 20, 30, 40, 50, 60, 70] }),
  Object.freeze({ id: "layered-tree", label: "Layered tree", values: [50, 25, 75, 10, 30, 60, 90, 5, 15, 27, 33] })
]);

const selectionSortPresets = Object.freeze([
  Object.freeze({ id: "short-shuffle", label: "Short shuffle", values: [34, 12, 67, 23, 89, 45] }),
  Object.freeze({ id: "wide-spread", label: "Wide spread", values: [91, 17, 63, 28, 75, 49, 6, 52] }),
  Object.freeze({ id: "nearly-sorted", label: "Nearly sorted", values: [10, 20, 30, 50, 40, 60, 70] })
]);

const binarySearchPresets = Object.freeze([
  Object.freeze({ id: "small-range", label: "Small range", values: [4, 9, 12, 18, 24, 31, 37], target: 18 }),
  Object.freeze({ id: "balanced-search", label: "Balanced search", values: [5, 11, 16, 23, 38, 41, 59, 72], target: 41 }),
  Object.freeze({ id: "missing-target", label: "Missing target", values: [6, 13, 19, 27, 34, 46, 58, 69], target: 35 })
]);

export function getBinarySearchTreeScenario(preset = bstPresets[0]) {
  return createTreeInsertionSteps(preset?.values || []);
}

export function getSelectionSortScenario(preset = selectionSortPresets[0]) {
  return createSelectionSortScenario(preset?.values || []);
}

export function getBinarySearchScenario(preset = binarySearchPresets[0]) {
  return createBinarySearchScenario(preset?.values || [], preset?.target);
}

function createPlaybackScenario(id, title, description, rawScenario, meta = {}) {
  return createScenario({
    id,
    title,
    description,
    initialState: rawScenario.initialState,
    steps: rawScenario.steps,
    meta
  });
}

export function createBinarySearchTreePlaybackScenario(preset = bstPresets[0]) {
  const safePreset = preset || bstPresets[0];
  const rawScenario = getBinarySearchTreeScenario(safePreset);
  return createPlaybackScenario(
    `binary-search-tree/${safePreset.id}`,
    `Binary Search Tree: ${safePreset.label}`,
    "Watch values travel left and right as they are inserted into a binary search tree.",
    rawScenario,
    {
      presetId: safePreset.id,
      scenarioKind: "loadPreset"
    }
  );
}

export function createSelectionSortPlaybackScenario(preset = selectionSortPresets[0]) {
  const safePreset = preset || selectionSortPresets[0];
  const rawScenario = getSelectionSortScenario(safePreset);
  return createPlaybackScenario(
    `selection-sort/${safePreset.id}`,
    `Selection Sort: ${safePreset.label}`,
    "Select the smallest value on each pass and swap it into the next sorted position.",
    rawScenario,
    {
      presetId: safePreset.id,
      scenarioKind: "loadPreset"
    }
  );
}

export function createBinarySearchPlaybackScenario(preset = binarySearchPresets[0]) {
  const safePreset = preset || binarySearchPresets[0];
  const rawScenario = getBinarySearchScenario(safePreset);
  return createPlaybackScenario(
    `binary-search/${safePreset.id}`,
    `Binary Search: ${safePreset.label}`,
    "Search a sorted list by repeatedly narrowing the range around the target.",
    rawScenario,
    {
      presetId: safePreset.id,
      scenarioKind: "loadPreset",
      target: safePreset.target
    }
  );
}

export const binarySearchTreeModule = Object.freeze({
  id: "binary-search-tree",
  kind: "data-structure",
  title: "Binary Search Tree",
  description: "Watch values travel left and right as they are inserted into a binary search tree.",
  presets: bstPresets,
  manualOperations: Object.freeze([
    Object.freeze({
      type: "insert",
      label: "Insert",
      description: "Insert a value into the tree and highlight the traversal path.",
      inputs: [{ name: "value", type: "number", required: true }]
    }),
    Object.freeze({
      type: "clear",
      label: "Clear",
      description: "Reset the tree back to an empty state.",
      inputs: []
    })
  ]),
  initialState: makeTreeState(null),
  createScenario: createBinarySearchTreePlaybackScenario,
  generateSteps: (operation = { type: "loadPreset" }, state = makeTreeState(null)) => {
    if (operation.type === "insert") {
      return createTreeInsertSteps(state, operation.value).steps;
    }

    if (operation.type === "clear") {
      return [
        makeStep("clear", "Cleared the tree.", makeTreeState(null))
      ];
    }

    const preset = bstPresets.find((candidate) => candidate.id === operation.presetId) || bstPresets[0];
    return getBinarySearchTreeScenario(preset).steps;
  }
});

export const selectionSortModule = Object.freeze({
  id: "selection-sort",
  kind: "algorithm",
  title: "Selection Sort",
  description: "Select the smallest value on each pass and swap it into the next sorted position.",
  presets: selectionSortPresets,
  manualOperations: Object.freeze([]),
  initialState: makeArrayState([]),
  createScenario: createSelectionSortPlaybackScenario,
  generateSteps: (operation = { type: "loadPreset" }, state = makeArrayState([])) => {
    const preset = selectionSortPresets.find((candidate) => candidate.id === operation.presetId) || selectionSortPresets[0];
    const values = Array.isArray(state?.values) && state.values.length ? state.values : preset.values;
    return createSelectionSortScenario(values).steps;
  }
});

export const binarySearchModule = Object.freeze({
  id: "binary-search",
  kind: "algorithm",
  title: "Binary Search",
  description: "Search a sorted list by repeatedly narrowing the range around the target.",
  presets: binarySearchPresets,
  manualOperations: Object.freeze([
    Object.freeze({
      type: "search",
      label: "Search",
      description: "Search a sorted list for a target value.",
      inputs: [{ name: "value", type: "number", required: true }]
    })
  ]),
  initialState: makeArrayState([]),
  createScenario: createBinarySearchPlaybackScenario,
  generateSteps: (operation = { type: "loadPreset" }, state = makeArrayState([])) => {
    if (operation.type === "search") {
      const values = Array.isArray(state?.values) ? state.values : [];
      return createBinarySearchScenario(values, operation.value).steps;
    }

    const preset = binarySearchPresets.find((candidate) => candidate.id === operation.presetId) || binarySearchPresets[0];
    return createBinarySearchScenario(preset.values, preset.target).steps;
  }
});

export const nonlinearModules = Object.freeze([
  binarySearchTreeModule,
  selectionSortModule,
  binarySearchModule
]);

export const nonlinearModuleMap = Object.freeze({
  [binarySearchTreeModule.id]: binarySearchTreeModule,
  [selectionSortModule.id]: selectionSortModule,
  [binarySearchModule.id]: binarySearchModule
});

export function getNonlinearModule(id) {
  return nonlinearModuleMap[id] || null;
}

export default nonlinearModules;
