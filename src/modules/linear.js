import { cloneValue, createScenario } from "../core/module-contract.js";

const DEFAULT_STEP_DURATIONS = {
  load: 420,
  compare: 520,
  swap: 760,
  insert: 700,
  append: 700,
  push: 700,
  enqueue: 700,
  remove: 620,
  pop: 620,
  dequeue: 620,
  search: 520,
  complete: 420
};

const ARRAY_LAYOUT = {
  baseX: 84,
  baseY: 520,
  itemWidth: 92,
  gap: 22,
  maxHeight: 250,
  minHeight: 90
};

const STACK_LAYOUT = {
  centerX: 540,
  baseY: 520,
  itemWidth: 220,
  itemHeight: 62,
  gap: 16
};

const QUEUE_LAYOUT = {
  startX: 78,
  baseY: 292,
  itemWidth: 132,
  itemHeight: 76,
  gap: 18
};

const LINKED_LIST_LAYOUT = {
  startX: 78,
  baseY: 296,
  nodeWidth: 150,
  nodeHeight: 72,
  gap: 28
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cloneItems(items) {
  return items.map((item) => ({ ...item }));
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry) => typeof entry === "string" && entry.length > 0).map((entry) => entry.trim());
}

function uniqueIds(...lists) {
  return [...new Set(lists.flatMap((list) => normalizeIdList(list)))];
}

function makeItems(values, prefix) {
  return values.map((value, index) => ({
    id: `${prefix}-${index}`,
    value
  }));
}

function normalizePreset(preset, prefix) {
  return {
    id: preset.id,
    label: preset.label,
    values: [...preset.values],
    items: makeItems(preset.values, `${prefix}-${preset.id}`)
  };
}

function buildArrayLayout(items, focus = {}) {
  const maxValue = Math.max(1, ...items.map((item) => Math.abs(item.value)));

  return {
    type: "array",
    axis: "horizontal",
    baseX: ARRAY_LAYOUT.baseX,
    baseY: ARRAY_LAYOUT.baseY,
    itemWidth: ARRAY_LAYOUT.itemWidth,
    gap: ARRAY_LAYOUT.gap,
    slots: items.map((item, index) => {
      const height = Math.round(
        ARRAY_LAYOUT.minHeight +
          (Math.abs(item.value) / maxValue) * (ARRAY_LAYOUT.maxHeight - ARRAY_LAYOUT.minHeight)
      );
      return {
        id: item.id,
        index,
        value: item.value,
        x: ARRAY_LAYOUT.baseX + index * (ARRAY_LAYOUT.itemWidth + ARRAY_LAYOUT.gap),
        y: ARRAY_LAYOUT.baseY - height,
        width: ARRAY_LAYOUT.itemWidth,
        height,
        label: `idx ${index}`
      };
    }),
    focus: deepClone(focus)
  };
}

function buildStackLayout(items, focus = {}) {
  return {
    type: "stack",
    axis: "vertical",
    centerX: STACK_LAYOUT.centerX,
    baseY: STACK_LAYOUT.baseY,
    itemWidth: STACK_LAYOUT.itemWidth,
    itemHeight: STACK_LAYOUT.itemHeight,
    slots: items.map((item, index) => {
      const isTop = index === items.length - 1;
      return {
        id: item.id,
        index,
        value: item.value,
        x: STACK_LAYOUT.centerX,
        y: STACK_LAYOUT.baseY - (index + 1) * (STACK_LAYOUT.itemHeight + STACK_LAYOUT.gap),
        width: STACK_LAYOUT.itemWidth,
        height: STACK_LAYOUT.itemHeight,
        label: isTop ? "TOP" : ""
      };
    }),
    focus: deepClone(focus)
  };
}

function buildQueueLayout(items, focus = {}) {
  return {
    type: "queue",
    axis: "horizontal",
    startX: QUEUE_LAYOUT.startX,
    baseY: QUEUE_LAYOUT.baseY,
    itemWidth: QUEUE_LAYOUT.itemWidth,
    itemHeight: QUEUE_LAYOUT.itemHeight,
    slots: items.map((item, index) => {
      const isFront = index === 0;
      const isBack = index === items.length - 1;
      return {
        id: item.id,
        index,
        value: item.value,
        x: QUEUE_LAYOUT.startX + index * (QUEUE_LAYOUT.itemWidth + QUEUE_LAYOUT.gap),
        y: QUEUE_LAYOUT.baseY,
        width: QUEUE_LAYOUT.itemWidth,
        height: QUEUE_LAYOUT.itemHeight,
        label: isFront ? "FRONT" : isBack ? "BACK" : ""
      };
    }),
    focus: deepClone(focus)
  };
}

function buildLinkedListLayout(items, focus = {}) {
  const nodes = items.map((item, index) => {
    const nextItem = items[index + 1] || null;
    return {
      id: item.id,
      index,
      value: item.value,
      x: LINKED_LIST_LAYOUT.startX + index * (LINKED_LIST_LAYOUT.nodeWidth + LINKED_LIST_LAYOUT.gap),
      y: LINKED_LIST_LAYOUT.baseY,
      width: LINKED_LIST_LAYOUT.nodeWidth,
      height: LINKED_LIST_LAYOUT.nodeHeight,
      nextId: nextItem ? nextItem.id : null,
      label: index === 0 ? "HEAD" : index === items.length - 1 ? "TAIL" : ""
    };
  });

  const edges = nodes
    .filter((node) => node.nextId)
    .map((node) => {
      const nextNode = nodes.find((candidate) => candidate.id === node.nextId);
      return {
        from: node.id,
        to: nextNode.id,
        x1: node.x + node.width,
        y1: node.y + node.height / 2,
        x2: nextNode.x,
        y2: nextNode.y + nextNode.height / 2
      };
    });

  return {
    type: "linked-list",
    axis: "horizontal",
    startX: LINKED_LIST_LAYOUT.startX,
    baseY: LINKED_LIST_LAYOUT.baseY,
    nodeWidth: LINKED_LIST_LAYOUT.nodeWidth,
    nodeHeight: LINKED_LIST_LAYOUT.nodeHeight,
    nodes,
    edges,
    focus: deepClone(focus)
  };
}

function getStagedInsertPosition(kind, index, item) {
  if (kind === "array") {
    return {
      x: ARRAY_LAYOUT.baseX + index * (ARRAY_LAYOUT.itemWidth + ARRAY_LAYOUT.gap),
      y: 36
    };
  }

  if (kind === "stack") {
    return {
      x: STACK_LAYOUT.centerX,
      y: 18
    };
  }

  if (kind === "queue") {
    return {
      x: QUEUE_LAYOUT.startX - QUEUE_LAYOUT.itemWidth - 96,
      y: QUEUE_LAYOUT.baseY
    };
  }

  return {
    x: LINKED_LIST_LAYOUT.startX - LINKED_LIST_LAYOUT.nodeWidth - 140,
    y: LINKED_LIST_LAYOUT.baseY
  };
}

function buildSnapshot(kind, items, focus = {}, extras = {}) {
  const clonedItems = cloneItems(items);
  const activeIds = uniqueIds(extras.activeIds, focus.activeIds);
  const freshIds = uniqueIds(extras.freshIds, focus.freshIds);
  const selectedIds = uniqueIds(extras.selectedIds, focus.selectedIds);
  const visitedIds = uniqueIds(extras.visitedIds, focus.visitedIds);
  const frontierIds = uniqueIds(extras.frontierIds, focus.frontierIds);
  const mutedIds = uniqueIds(extras.mutedIds, focus.mutedIds);
  const base = {
    kind,
    items: clonedItems,
    focus: deepClone(focus),
    activeIds,
    freshIds,
    selectedIds,
    visitedIds,
    frontierIds,
    mutedIds,
    operationCount: typeof extras.operationCount === "number" ? extras.operationCount : 0,
    lastMessage: typeof extras.lastMessage === "string" ? extras.lastMessage : "",
    message: typeof extras.message === "string" ? extras.message : "",
    explanation:
      typeof extras.explanation === "string"
        ? extras.explanation
        : typeof extras.message === "string"
          ? extras.message
          : ""
  };

  if (kind === "array") {
    return {
      ...base,
      layout: buildArrayLayout(clonedItems, focus)
    };
  }

  if (kind === "stack") {
    return {
      ...base,
      layout: buildStackLayout(clonedItems, focus)
    };
  }

  if (kind === "queue") {
    return {
      ...base,
      layout: buildQueueLayout(clonedItems, focus)
    };
  }

  return {
    ...base,
    layout: buildLinkedListLayout(clonedItems, focus)
  };
}

function buildStep({
  moduleId,
  kind,
  index,
  type,
  message,
  explanation = message,
  items,
  focus = {},
  highlights = {},
  operation = null,
  durationMs = DEFAULT_STEP_DURATIONS[type] || DEFAULT_STEP_DURATIONS.complete
}) {
  const nextState = buildSnapshot(kind, items, focus, {
    ...highlights,
    message,
    explanation,
    operationCount: index + 1,
    lastMessage: message
  });
  const view = {
    message,
    explanation,
    highlights: {
      activeIds: nextState.activeIds,
      freshIds: nextState.freshIds,
      selectedIds: nextState.selectedIds,
      visitedIds: nextState.visitedIds,
      frontierIds: nextState.frontierIds,
      mutedIds: nextState.mutedIds
    },
    focus: deepClone(focus),
    patches: [{ type: "state", state: cloneValue(nextState) }]
  };

  return {
    id: `${moduleId}-step-${String(index).padStart(3, "0")}`,
    moduleId,
    kind,
    index,
    type,
    label: message,
    description: explanation,
    durationMs,
    message,
    explanation,
    operation: operation ? deepClone(operation) : null,
    state: cloneValue(nextState),
    view,
    meta: {
      moduleId,
      kind,
      index,
      type,
      operation: operation ? deepClone(operation) : null
    },
    apply(state, context) {
      return cloneValue(nextState);
    }
  };
}

function buildModule({
  id,
  label,
  kind,
  description,
  defaultPresetId,
  presets,
  manualOperations,
  initialValues = []
}) {
  const normalizedPresets = presets.map((preset) => normalizePreset(preset, id));
  const initialState = {
    items: makeItems(initialValues, `${id}-initial`),
    selectedIds: [],
    highlights: [],
    operationCount: 0,
    lastMessage: ""
  };

  function createInitialState() {
    return deepClone(initialState);
  }

  function getPreset(presetId = defaultPresetId) {
    return normalizedPresets.find((preset) => preset.id === presetId) || normalizedPresets[0] || null;
  }

  function createItemsFromState(state) {
    return cloneItems(state.items || []);
  }

  function appendItem(items, value) {
    return [...items, { id: `${id}-item-${items.length}`, value }];
  }

  function insertItem(items, index, value) {
    const nextItems = cloneItems(items);
    nextItems.splice(clamp(index, 0, nextItems.length), 0, { id: `${id}-item-${nextItems.length}`, value });
    return nextItems;
  }

  function removeItem(items, index) {
    const nextItems = cloneItems(items);
    if (!nextItems.length) {
      return { items: nextItems, removed: null };
    }

    const safeIndex = clamp(index, 0, nextItems.length - 1);
    const [removed] = nextItems.splice(safeIndex, 1);
    return { items: nextItems, removed };
  }

  function snapshotItems(items, focus = {}) {
    return buildSnapshot(kind, items, focus);
  }

  function createLoadSteps(preset, operation) {
    const items = cloneItems(preset.items);
    return [
      buildStep({
        moduleId: id,
        kind,
        index: 0,
        type: "load",
        message: `Loaded ${items.length} values for ${label.toLowerCase()}.`,
        items,
        focus: { presetId: preset.id, kind: "load" },
        highlights: { freshIds: items.map((item) => item.id) },
        operation
      }),
      buildStep({
        moduleId: id,
        kind,
        index: 1,
        type: "complete",
        message: `${label} is ready.`,
        items,
        focus: { presetId: preset.id, kind: "idle" },
        highlights: { selectedIds: items.map((item) => item.id) },
        operation,
        durationMs: DEFAULT_STEP_DURATIONS.complete
      })
    ];
  }

  function createInsertSteps(state, operation, stepType = "insert") {
    const items = createItemsFromState(state);
    const index = clamp(Number(operation.index ?? items.length), 0, items.length);
    const value = Number(operation.value);
    const nextItems = insertItem(items, index, value);
    const insertedItem = nextItems[index];
    const stagedPosition = getStagedInsertPosition(kind, index, insertedItem);
    const message =
      stepType === "push"
        ? `Pushed ${value} onto the stack.`
        : stepType === "enqueue"
          ? `Enqueued ${value} at the back of the queue.`
          : stepType === "append"
            ? `Appended ${value} to the list.`
            : `Inserted ${value} at index ${index}.`;
    return [
      buildStep({
        moduleId: id,
        kind,
        index: 0,
        type: "load",
        message: `Preparing to place ${value}${stepType === "append" ? " at the end" : stepType === "push" ? " on top" : stepType === "enqueue" ? " at the back" : ` at index ${index}`}.`,
        items: nextItems,
        focus: {
          type: "insert-preview",
          index,
          value,
          activeIds: [insertedItem.id],
          freshIds: [insertedItem.id],
          overridePositions: {
            [insertedItem.id]: stagedPosition
          }
        },
        highlights: {
          activeIds: [insertedItem.id],
          freshIds: [insertedItem.id],
          selectedIds: items.map((item) => item.id)
        },
        operation,
        durationMs: DEFAULT_STEP_DURATIONS.load
      }),
      buildStep({
        moduleId: id,
        kind,
        index: 1,
        type: "insert",
        message,
        items: nextItems,
        focus: { type: "insert", index, value, activeIds: [insertedItem.id] },
        highlights: {
          activeIds: [insertedItem.id],
          freshIds: [insertedItem.id]
        },
        operation
      })
    ];
  }

  function createRemoveSteps(state, operation, stepType = "remove") {
    const items = createItemsFromState(state);
    if (!items.length) {
      return [
        buildStep({
          moduleId: id,
          kind,
          index: 0,
          type: stepType,
          message: `${label} is empty, so nothing could be removed.`,
          items,
          focus: { type: "remove", empty: true },
          operation
        })
      ];
    }

    const index = clamp(Number(operation.index ?? items.length - 1), 0, items.length - 1);
    const { items: nextItems, removed } = removeItem(items, index);
    const message =
      stepType === "pop"
        ? `Popped ${removed.value} from the stack.`
        : stepType === "dequeue"
          ? `Dequeued ${removed.value} from the front of the queue.`
          : `Removed ${removed.value} from index ${index}.`;
    return [
      buildStep({
        moduleId: id,
        kind,
        index: 0,
        type: stepType,
        message,
        items: nextItems,
        focus: { type: "remove", index, removedId: removed.id },
        highlights: { activeIds: [removed.id], selectedIds: [removed.id] },
        operation
      })
    ];
  }

  function createPeekSteps(state, operation) {
    const items = createItemsFromState(state);
    const focusIndex = kind === "stack" ? items.length - 1 : 0;
    const peekedItem = items[focusIndex] || null;

    return [
      buildStep({
        moduleId: id,
        kind,
        index: 0,
        type: "peek",
        message: peekedItem
          ? `Peeked ${peekedItem.value} from the ${kind === "stack" ? "top" : "front"}.`
          : `${label} is empty, so there is nothing to peek at.`,
        items,
        focus: peekedItem
          ? {
              type: "peek",
              index: focusIndex,
              activeIndices: [focusIndex],
              activeIds: [peekedItem.id]
            }
          : { type: "peek", empty: true },
        highlights: peekedItem ? { activeIds: [peekedItem.id], selectedIds: [peekedItem.id] } : {},
        operation
      })
    ];
  }

  function createSearchSteps(state, operation) {
    const items = createItemsFromState(state);
    const target = Number(operation.value);
    const steps = [];
    let foundIndex = -1;
    const visitedIds = [];

    for (let i = 0; i < items.length; i += 1) {
      visitedIds.push(items[i].id);
      steps.push(
        buildStep({
          moduleId: id,
          kind,
          index: steps.length,
          type: "search",
          message: `Checked ${items[i].value} at index ${i}.`,
          items,
          focus: { type: "search", target, activeIndices: [i], activeIds: [items[i].id] },
          highlights: { activeIds: [items[i].id], visitedIds: visitedIds.slice() },
          operation,
          durationMs: DEFAULT_STEP_DURATIONS.search
        })
      );

      if (items[i].value === target) {
        foundIndex = i;
        break;
      }
    }

    steps.push(
      buildStep({
        moduleId: id,
        kind,
        index: steps.length,
        type: "complete",
        message:
          foundIndex >= 0
            ? `Found ${target} at index ${foundIndex}.`
            : `${target} was not found in the list.`,
        items,
        focus: { type: "search", target, foundIndex },
        highlights: foundIndex >= 0 ? { activeIds: [items[foundIndex].id], selectedIds: [items[foundIndex].id], visitedIds } : { visitedIds },
        operation
      })
    );

    return steps;
  }

  function createBubbleSortSteps(state, operation) {
    const items = createItemsFromState(state);
    const steps = [];

    if (items.length === 0) {
      steps.push(
        buildStep({
          moduleId: id,
          kind,
          index: 0,
          type: "complete",
          message: "Nothing to sort yet.",
          items,
          focus: { type: "sort", algorithm: "bubble-sort", empty: true },
          operation
        })
      );
      return steps;
    }

    steps.push(
      buildStep({
        moduleId: id,
        kind,
        index: 0,
        type: "load",
        message: `Started bubble sort with ${items.length} values.`,
        items,
        focus: { type: "sort", algorithm: "bubble-sort", pass: 0 },
        highlights: { selectedIds: items.map((item) => item.id) },
        operation
      })
    );

    let stepIndex = 1;
    for (let end = items.length - 1; end > 0; end -= 1) {
      for (let i = 0; i < end; i += 1) {
        steps.push(
        buildStep({
          moduleId: id,
          kind,
          index: stepIndex++,
          type: "compare",
          message: `Compared ${items[i].value} and ${items[i + 1].value}.`,
          items,
          focus: {
            type: "sort",
            algorithm: "bubble-sort",
            compareIndices: [i, i + 1],
            sortedTailStart: end + 1
          },
          highlights: {
            activeIds: [items[i].id, items[i + 1].id],
            selectedIds: items.slice(end + 1).map((item) => item.id)
          },
          operation,
          durationMs: DEFAULT_STEP_DURATIONS.compare
        })
      );

        if (items[i].value > items[i + 1].value) {
          const left = items[i];
          items[i] = items[i + 1];
          items[i + 1] = left;
          steps.push(
            buildStep({
              moduleId: id,
              kind,
              index: stepIndex++,
              type: "swap",
              message: `Swapped ${left.value} and ${items[i].value} to move the larger value right.`,
              items,
              focus: {
                type: "sort",
                algorithm: "bubble-sort",
                swapIndices: [i, i + 1],
                sortedTailStart: end + 1
              },
              highlights: {
                activeIds: [items[i].id, items[i + 1].id],
                selectedIds: items.slice(end + 1).map((item) => item.id)
              },
              operation,
              durationMs: DEFAULT_STEP_DURATIONS.swap
            })
          );
        }
      }
    }

    steps.push(
      buildStep({
        moduleId: id,
        kind,
        index: stepIndex,
        type: "complete",
        message: "Bubble sort finished.",
        items,
        focus: { type: "sort", algorithm: "bubble-sort", complete: true },
        operation
      })
    );

    return steps;
  }

  function createSelectionSortSteps(state, operation) {
    const items = createItemsFromState(state);
    const steps = [];

    if (items.length === 0) {
      steps.push(
        buildStep({
          moduleId: id,
          kind,
          index: 0,
          type: "complete",
          message: "Nothing to sort yet.",
          items,
          focus: { type: "sort", algorithm: "selection-sort", empty: true },
          operation
        })
      );
      return steps;
    }

    steps.push(
      buildStep({
        moduleId: id,
        kind,
        index: 0,
        type: "load",
        message: `Started selection sort with ${items.length} values.`,
        items,
        focus: { type: "sort", algorithm: "selection-sort", pass: 0 },
        highlights: { selectedIds: [] },
        operation
      })
    );

    let stepIndex = 1;
    for (let i = 0; i < items.length - 1; i += 1) {
      let minIndex = i;
      steps.push(
        buildStep({
          moduleId: id,
          kind,
          index: stepIndex++,
          type: "compare",
          message: `Selected ${items[minIndex].value} as the current minimum for position ${i}.`,
          items,
          focus: { type: "sort", algorithm: "selection-sort", passIndex: i, minIndex },
          highlights: {
            activeIds: [items[minIndex].id],
            selectedIds: items.slice(0, i).map((item) => item.id)
          },
          operation,
          durationMs: DEFAULT_STEP_DURATIONS.compare
        })
      );

      for (let j = i + 1; j < items.length; j += 1) {
        steps.push(
          buildStep({
            moduleId: id,
            kind,
            index: stepIndex++,
            type: "compare",
            message: `Compared ${items[j].value} with current minimum ${items[minIndex].value}.`,
            items,
            focus: {
              type: "sort",
              algorithm: "selection-sort",
              passIndex: i,
              minIndex,
              compareIndex: j
            },
            highlights: {
              activeIds: [items[minIndex].id, items[j].id],
              selectedIds: items.slice(0, i).map((item) => item.id)
            },
            operation,
            durationMs: DEFAULT_STEP_DURATIONS.compare
          })
        );

        if (items[j].value < items[minIndex].value) {
          minIndex = j;
          steps.push(
            buildStep({
              moduleId: id,
              kind,
              index: stepIndex++,
              type: "compare",
              message: `Updated the minimum to ${items[minIndex].value}.`,
              items,
              focus: {
                type: "sort",
                algorithm: "selection-sort",
                passIndex: i,
                minIndex,
                compareIndex: j
              },
              highlights: {
                activeIds: [items[minIndex].id, items[j].id],
                selectedIds: items.slice(0, i).map((item) => item.id)
              },
              operation,
              durationMs: DEFAULT_STEP_DURATIONS.compare
            })
          );
        }
      }

      if (minIndex !== i) {
        const selected = items[i];
        items[i] = items[minIndex];
        items[minIndex] = selected;
        steps.push(
          buildStep({
            moduleId: id,
            kind,
            index: stepIndex++,
            type: "swap",
            message: `Moved ${items[i].value} into position ${i}.`,
            items,
            focus: {
              type: "sort",
              algorithm: "selection-sort",
              passIndex: i,
              swapIndices: [i, minIndex]
            },
            highlights: {
              activeIds: [items[i].id, items[minIndex].id],
              selectedIds: items.slice(0, i + 1).map((item) => item.id)
            },
            operation,
            durationMs: DEFAULT_STEP_DURATIONS.swap
          })
        );
      }
    }

    steps.push(
      buildStep({
        moduleId: id,
        kind,
        index: stepIndex,
        type: "complete",
        message: "Selection sort finished.",
        items,
        focus: { type: "sort", algorithm: "selection-sort", complete: true },
        operation
      })
    );

    return steps;
  }

  function applyOperation(state, operation) {
    const action = operation?.type || operation?.name || "loadPreset";
    const nextState = createInitialState();
    nextState.items = createItemsFromState(state);
    nextState.operationCount = (state.operationCount || 0) + 1;
    nextState.lastMessage = "";

    if (action === "loadPreset") {
      const preset = getPreset(operation?.presetId);
      if (preset) {
        nextState.items = cloneItems(preset.items);
        nextState.lastMessage = `Loaded ${preset.label}.`;
      }
      return nextState;
    }

    if (action === "append" || action === "push" || action === "enqueue") {
      nextState.items = appendItem(nextState.items, Number(operation.value));
      nextState.lastMessage =
        action === "push"
          ? `Pushed ${Number(operation.value)} onto the stack.`
          : action === "enqueue"
            ? `Enqueued ${Number(operation.value)} at the back of the queue.`
            : `Appended ${Number(operation.value)} to the list.`;
      return nextState;
    }

    if (action === "insertAt") {
      nextState.items = insertItem(nextState.items, Number(operation.index), Number(operation.value));
      nextState.lastMessage = `Inserted ${Number(operation.value)} at index ${Number(operation.index)}.`;
      return nextState;
    }

    if (action === "removeAt" || action === "pop" || action === "dequeue") {
      const result = removeItem(nextState.items, Number(operation.index ?? nextState.items.length - 1));
      nextState.items = result.items;
      nextState.lastMessage = result.removed
        ? action === "pop"
          ? `Popped ${result.removed.value} from the stack.`
          : action === "dequeue"
            ? `Dequeued ${result.removed.value} from the front of the queue.`
            : `Removed ${result.removed.value}.`
        : `${label} is empty.`;
      return nextState;
    }

    if (action === "peek") {
      const peekIndex = kind === "stack" ? nextState.items.length - 1 : 0;
      const peekedItem = nextState.items[peekIndex] || null;
      nextState.lastMessage = peekedItem
        ? `Peeked ${peekedItem.value}.`
        : `${label} is empty.`;
      return nextState;
    }

    if (action === "search") {
      nextState.lastMessage = `Searched for ${Number(operation.value)}.`;
      return nextState;
    }

    if (action === "bubbleSort" || action === "selectionSort") {
      const steps = action === "bubbleSort" ? createBubbleSortSteps(state, operation) : createSelectionSortSteps(state, operation);
      if (steps.length) {
        nextState.items = cloneItems(steps[steps.length - 1].state.items);
        nextState.lastMessage = steps[steps.length - 1].message;
      }
      return nextState;
    }

    nextState.lastMessage = `Unsupported action: ${action}.`;
    return nextState;
  }

  function generateSteps(operation = { type: "loadPreset" }, state = createInitialState()) {
    const action = operation?.type || operation?.name || "loadPreset";

    if (action === "loadPreset") {
      const preset = getPreset(operation?.presetId);
      return preset ? createLoadSteps(preset, operation) : [];
    }

    if (action === "append" || action === "push" || action === "enqueue" || action === "insertAt") {
      return createInsertSteps(state, operation, action);
    }

    if (action === "removeAt" || action === "pop" || action === "dequeue") {
      return createRemoveSteps(state, operation, action);
    }

    if (action === "peek") {
      return createPeekSteps(state, operation);
    }

    if (action === "search") {
      return createSearchSteps(state, operation);
    }

    if (action === "bubbleSort" || action === "selectionSort") {
      return action === "bubbleSort"
        ? createBubbleSortSteps(state, operation)
        : createSelectionSortSteps(state, operation);
    }

    return [
      buildStep({
        moduleId: id,
        kind,
        index: 0,
        type: "complete",
        message: `Unsupported action: ${action}.`,
        items: createItemsFromState(state),
        focus: { type: "error", action },
        operation
      })
    ];
  }

  function createTimeline(operation = { type: "loadPreset" }, state = createInitialState()) {
    const steps = generateSteps(operation, state);
    const finalState = applyOperation(state, operation);
    return { steps, finalState };
  }

  function scenarioIdFor(operationType, suffix = "") {
    const safeSuffix = suffix ? `:${String(suffix).trim()}` : "";
    return `${id}/${operationType}${safeSuffix}`;
  }

  function createCoreScenario(operation, baseState = createInitialState(), options = {}) {
    const normalizedOperation = operation ? deepClone(operation) : { type: "loadPreset" };
    const steps = generateSteps(normalizedOperation, baseState);
    const initialState = cloneValue(baseState);
    const title = typeof options.title === "string" && options.title.length > 0 ? options.title : `${label} ${normalizedOperation.type}`;
    const scenarioDescription =
      typeof options.description === "string" && options.description.length > 0
        ? options.description
        : `${description}.`;

    const suffix = options.suffix ?? normalizedOperation.presetId ?? normalizedOperation.value ?? "";

    return createScenario({
      id: options.id || scenarioIdFor(normalizedOperation.type, suffix),
      title,
      description: scenarioDescription,
      steps,
      initialState,
      meta: {
        moduleId: id,
        kind,
        operation: normalizedOperation,
        ...((options.meta && typeof options.meta === "object") ? options.meta : {})
      }
    });
  }

  function createPresetScenario(presetId = defaultPresetId) {
    const preset = getPreset(presetId);
    const scenarioOperation = { type: "loadPreset", presetId: preset?.id || presetId };
    return createCoreScenario(scenarioOperation, createInitialState(), {
      id: scenarioIdFor("load", preset?.id || presetId),
      title: `${label}: ${preset?.label || presetId}`,
      description: `Load the ${preset?.label || presetId} preset into the ${label.toLowerCase()}.`,
      suffix: preset?.id || presetId,
      meta: { scenarioKind: "loadPreset", presetId: preset?.id || presetId }
    });
  }

  function createOperationScenario(operation, baseState = createInitialState(), options = {}) {
    const scenarioOperation = operation && typeof operation === "object" ? operation : { type: "loadPreset" };
    const suffix = options.suffix ?? scenarioOperation.index ?? scenarioOperation.value ?? "";
    return createCoreScenario(scenarioOperation, baseState, {
      id: options.id || scenarioIdFor(scenarioOperation.type, suffix),
      title: options.title || `${label}: ${scenarioOperation.type}`,
      description:
        options.description ||
        `Run ${scenarioOperation.type} on the ${label.toLowerCase()} with deterministic playback steps.`,
      suffix: options.suffix,
      meta: { scenarioKind: "operation", ...options.meta }
    });
  }

  function buildScenarioCollection() {
    const scenarios = [];

    for (const preset of normalizedPresets) {
      scenarios.push(createPresetScenario(preset.id));
    }

    if (kind === "array") {
      const defaultPreset = getPreset(defaultPresetId);
      if (defaultPreset) {
        const presetState = snapshotItems(defaultPreset.items, { type: "demo" });
        scenarios.push(
          createOperationScenario(
            { type: "bubbleSort" },
            presetState,
            {
              id: scenarioIdFor("bubble-sort", defaultPreset.id),
              title: `${label}: Bubble sort ${defaultPreset.label}`,
              description: `Bubble sort the ${defaultPreset.label} preset.`,
              suffix: defaultPreset.id,
              meta: { algorithm: "bubble-sort", presetId: defaultPreset.id }
            }
          )
        );
        scenarios.push(
          createOperationScenario(
            { type: "selectionSort" },
            presetState,
            {
              id: scenarioIdFor("selection-sort", defaultPreset.id),
              title: `${label}: Selection sort ${defaultPreset.label}`,
              description: `Selection sort the ${defaultPreset.label} preset.`,
              suffix: defaultPreset.id,
              meta: { algorithm: "selection-sort", presetId: defaultPreset.id }
            }
          )
        );
      }
    } else if (kind === "stack" || kind === "queue") {
      const defaultPreset = getPreset(defaultPresetId);
      if (defaultPreset) {
        const presetState = snapshotItems(defaultPreset.items, { type: "demo" });
        scenarios.push(
          createOperationScenario(
            { type: "peek" },
            presetState,
            {
              id: scenarioIdFor("peek", defaultPreset.id),
              title: `${label}: Peek ${defaultPreset.label}`,
              description: `Peek at the ${kind === "stack" ? "top" : "front"} of the ${defaultPreset.label} preset.`,
              suffix: defaultPreset.id,
              meta: { operationKind: "peek", presetId: defaultPreset.id }
            }
          )
        );
      }
    } else if (kind === "linked-list") {
      const defaultPreset = getPreset(defaultPresetId);
      if (defaultPreset) {
        const target = defaultPreset.values[Math.floor(defaultPreset.values.length / 2)];
        const presetState = snapshotItems(defaultPreset.items, { type: "demo" });
        scenarios.push(
          createOperationScenario(
            { type: "search", value: target },
            presetState,
            {
              id: scenarioIdFor("search", defaultPreset.id),
              title: `${label}: Search ${defaultPreset.label}`,
              description: `Search for ${target} within the ${defaultPreset.label} chain.`,
              suffix: defaultPreset.id,
              meta: { operationKind: "search", presetId: defaultPreset.id, target }
            }
          )
        );
      }
    }

    return scenarios;
  }

  const scenarios = buildScenarioCollection();
  const scenarioMap = Object.freeze(
    scenarios.reduce((accumulator, scenario) => {
      accumulator[scenario.id] = scenario;
      return accumulator;
    }, {})
  );
  const defaultScenarioId = scenarios[0]?.id || "";

  return Object.freeze({
    metadata: Object.freeze({
      id,
      label,
      kind,
      description,
      category: "linear",
      defaultPresetId
    }),
    id,
    title: label,
    label,
    kind,
    description,
    scenarios,
    scenarioMap,
    defaultScenarioId,
    meta: Object.freeze({
      category: "linear",
      defaultPresetId
    }),
    presets: normalizedPresets,
    manualOperations: deepClone(manualOperations),
    operations: deepClone(manualOperations),
    initialState,
    createInitialState,
    getPreset,
    buildSnapshot: snapshotItems,
    applyOperation,
    generateSteps,
    createTimeline,
    scenarioBuilders: Object.freeze({
      preset: createPresetScenario,
      operation: createOperationScenario,
      core: createCoreScenario
    }),
    createPresetScenario,
    createOperationScenario,
    createCoreScenario,
    createScenarioBuilder: createOperationScenario
  });
}

const arrayModule = buildModule({
  id: "array",
  label: "Array",
  kind: "array",
  description:
    "Arrays keep values in order by index. This module supports insertion, removal, and two sorting algorithms so learners can watch values move across slots in real time.",
  defaultPresetId: "short-shuffle",
  presets: [
    { id: "short-shuffle", label: "Short shuffle", values: [34, 12, 67, 23, 89, 45] },
    { id: "wide-spread", label: "Wide spread", values: [91, 17, 63, 28, 75, 49, 6, 52] },
    { id: "nearly-sorted", label: "Nearly sorted", values: [10, 20, 30, 50, 40, 60, 70] }
  ],
  manualOperations: [
    {
      type: "append",
      label: "Append",
      description: "Add a value to the end of the array.",
      inputs: [{ name: "value", type: "number", required: true }]
    },
    {
      type: "insertAt",
      label: "Insert at index",
      description: "Insert a value at a specific position.",
      inputs: [
        { name: "index", type: "number", required: true, min: 0 },
        { name: "value", type: "number", required: true }
      ]
    },
    {
      type: "removeAt",
      label: "Remove at index",
      description: "Remove the value at a specific position.",
      inputs: [{ name: "index", type: "number", required: true, min: 0 }]
    },
    {
      type: "bubbleSort",
      label: "Bubble sort",
      description: "Compare adjacent values and swap until the array is sorted.",
      inputs: []
    },
    {
      type: "selectionSort",
      label: "Selection sort",
      description: "Find the smallest value in the unsorted region and place it next.",
      inputs: []
    }
  ]
});

const stackModule = buildModule({
  id: "stack",
  label: "Stack",
  kind: "stack",
  description:
    "Stacks follow last-in, first-out behavior. New values land on top and removals pop the most recent item first.",
  defaultPresetId: "small-stack",
  presets: [
    { id: "small-stack", label: "Small stack", values: [12, 24, 36, 48] },
    { id: "mixed-values", label: "Mixed values", values: [9, 31, 14, 57, 22] },
    { id: "tall-stack", label: "Tall stack", values: [5, 10, 15, 20, 25, 30] }
  ],
  manualOperations: [
    {
      type: "push",
      label: "Push",
      description: "Place a value on the top of the stack.",
      inputs: [{ name: "value", type: "number", required: true }]
    },
    {
      type: "pop",
      label: "Pop",
      description: "Remove the current top value.",
      inputs: []
    },
    {
      type: "peek",
      label: "Peek",
      description: "Inspect the top value without removing it.",
      inputs: []
    }
  ]
});

const queueModule = buildModule({
  id: "queue",
  label: "Queue",
  kind: "queue",
  description:
    "Queues follow first-in, first-out behavior. New values enter at the back and removals happen from the front.",
  defaultPresetId: "ticket-line",
  presets: [
    { id: "ticket-line", label: "Ticket line", values: [18, 26, 31, 44] },
    { id: "balanced-queue", label: "Balanced queue", values: [7, 14, 21, 28, 35] },
    { id: "busy-line", label: "Busy line", values: [4, 11, 19, 27, 34, 41] }
  ],
  manualOperations: [
    {
      type: "enqueue",
      label: "Enqueue",
      description: "Add a value to the back of the queue.",
      inputs: [{ name: "value", type: "number", required: true }]
    },
    {
      type: "dequeue",
      label: "Dequeue",
      description: "Remove the value at the front of the queue.",
      inputs: []
    },
    {
      type: "peek",
      label: "Peek",
      description: "Inspect the front value without removing it.",
      inputs: []
    }
  ]
});

const linkedListModule = buildModule({
  id: "linked-list",
  label: "Linked List",
  kind: "linked-list",
  description:
    "Linked lists connect values through explicit next pointers. This module focuses on traversal, insertion, removal, and search so the pointer flow stays visible.",
  defaultPresetId: "short-chain",
  presets: [
    { id: "short-chain", label: "Short chain", values: [11, 22, 33, 44] },
    { id: "mixed-chain", label: "Mixed chain", values: [5, 19, 8, 27, 13] },
    { id: "long-chain", label: "Long chain", values: [3, 6, 9, 12, 15, 18, 21] }
  ],
  manualOperations: [
    {
      type: "append",
      label: "Append",
      description: "Add a value to the end of the linked list.",
      inputs: [{ name: "value", type: "number", required: true }]
    },
    {
      type: "insertAt",
      label: "Insert at index",
      description: "Insert a node at a specific position.",
      inputs: [
        { name: "index", type: "number", required: true, min: 0 },
        { name: "value", type: "number", required: true }
      ]
    },
    {
      type: "removeAt",
      label: "Remove at index",
      description: "Remove the node at a specific position.",
      inputs: [{ name: "index", type: "number", required: true, min: 0 }]
    },
    {
      type: "search",
      label: "Search",
      description: "Traverse the list until a matching value is found.",
      inputs: [{ name: "value", type: "number", required: true }]
    }
  ]
});

const linearModules = {
  array: arrayModule,
  stack: stackModule,
  queue: queueModule,
  linkedList: linkedListModule
};

export {
  arrayModule,
  stackModule,
  queueModule,
  linkedListModule,
  linearModules,
  buildModule as createLinearModule
};

export default linearModules;
