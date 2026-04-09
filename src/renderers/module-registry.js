import linearModules, {
  arrayModule,
  linkedListModule,
  queueModule,
  stackModule
} from "../modules/linear.js";
import nonlinearModules, {
  binarySearchModule,
  binarySearchTreeModule,
  selectionSortModule
} from "../modules/nonlinear.js";

const MODE_OPTIONS = Object.freeze({
  structure: Object.freeze([
    Object.freeze({ id: "array", label: "Array", module: arrayModule, source: "linear", operation: "loadPreset" }),
    Object.freeze({ id: "stack", label: "Stack", module: stackModule, source: "linear", operation: "loadPreset" }),
    Object.freeze({ id: "queue", label: "Queue", module: queueModule, source: "linear", operation: "loadPreset" }),
    Object.freeze({
      id: "linked-list",
      label: "Linked List",
      module: linkedListModule,
      source: "linear",
      operation: "loadPreset"
    }),
    Object.freeze({
      id: "tree",
      label: "Binary Search Tree",
      module: binarySearchTreeModule,
      source: "nonlinear",
      operation: "preset"
    })
  ]),
  algorithm: Object.freeze([
    Object.freeze({
      id: "bubble-sort",
      label: "Bubble Sort",
      module: arrayModule,
      source: "linear",
      operation: "bubbleSort"
    }),
    Object.freeze({
      id: "selection-sort",
      label: "Selection Sort",
      module: selectionSortModule,
      source: "nonlinear",
      operation: "preset"
    }),
    Object.freeze({
      id: "binary-search",
      label: "Binary Search",
      module: binarySearchModule,
      source: "nonlinear",
      operation: "preset"
    })
  ])
});

const MODULE_LOOKUP = Object.freeze({
  array: arrayModule,
  stack: stackModule,
  queue: queueModule,
  "linked-list": linkedListModule,
  tree: binarySearchTreeModule,
  "bubble-sort": arrayModule,
  "selection-sort": selectionSortModule,
  "binary-search": binarySearchModule
});

const DEFAULT_SELECTION_BY_MODE = Object.freeze({
  structure: "array",
  algorithm: "bubble-sort"
});

function cloneLike(value) {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function normalizePresetId(moduleDefinition, presetId) {
  if (!moduleDefinition?.presets?.length) {
    return "";
  }

  if (presetId && moduleDefinition.presets.some((preset) => preset.id === presetId)) {
    return presetId;
  }

  return moduleDefinition.defaultPresetId || moduleDefinition.presets[0].id || "";
}

function createScenarioStepsFromModule(moduleDefinition, operation, state) {
  if (typeof moduleDefinition?.createTimeline === "function") {
    const timeline = moduleDefinition.createTimeline(operation, cloneLike(state));
    return Array.isArray(timeline?.steps) ? timeline.steps : [];
  }

  if (typeof moduleDefinition?.generateSteps === "function") {
    return moduleDefinition.generateSteps(operation, cloneLike(state)) || [];
  }

  return [];
}

function wrapSteps(moduleDefinition, steps, initialState) {
  const safeInitialState = cloneLike(initialState ?? moduleDefinition?.initialState ?? null);

  return {
    id: `${moduleDefinition.id}-${steps[0]?.type || "scenario"}`,
    title: moduleDefinition.title || moduleDefinition.label || moduleDefinition.id,
    description: moduleDefinition.description || "",
    initialState: safeInitialState,
    steps: steps.map((step, index) => ({
      id: step.id || `${moduleDefinition.id}-step-${String(index).padStart(3, "0")}`,
      type: step.type || "step",
      label: step.label || step.message || moduleDefinition.title || moduleDefinition.id,
      title: step.title || step.label || step.message || moduleDefinition.title || moduleDefinition.id,
      description: step.description || step.message || "",
      explanation: step.explanation || step.message || step.description || "",
      durationMs: Number.isFinite(step.durationMs) ? step.durationMs : 0,
      meta: step.meta ? cloneLike(step.meta) : null,
      view: step.view ? cloneLike(step.view) : null,
      apply: () => cloneLike(step.state ?? step.view ?? step.nextState ?? step.snapshot ?? initialState ?? null)
    }))
  };
}

export function getModeOptions(mode) {
  return MODE_OPTIONS[mode] || MODE_OPTIONS.structure;
}

export function getDefaultModeSelection(mode) {
  return DEFAULT_SELECTION_BY_MODE[mode] || DEFAULT_SELECTION_BY_MODE.structure;
}

export function getVisualizationConfig(visualizationId) {
  return MODULE_LOOKUP[visualizationId] || null;
}

export function getVisibleVisualizationIds(mode) {
  return getModeOptions(mode).map((entry) => entry.id);
}

export function getVisualizationEntry(mode, visualizationId) {
  return getModeOptions(mode).find((entry) => entry.id === visualizationId) || null;
}

export function getModulePresetList(visualizationId) {
  const moduleDefinition = getVisualizationConfig(visualizationId);
  return moduleDefinition?.presets ? moduleDefinition.presets.map((preset) => ({ ...preset })) : [];
}

export function getDefaultPresetId(visualizationId) {
  const moduleDefinition = getVisualizationConfig(visualizationId);
  if (!moduleDefinition?.presets?.length) {
    return "";
  }

  return normalizePresetId(moduleDefinition, moduleDefinition.defaultPresetId || moduleDefinition.presets[0].id);
}

export function getModuleTitle(visualizationId) {
  return getVisualizationConfig(visualizationId)?.title || getVisualizationConfig(visualizationId)?.label || visualizationId;
}

export function getModuleDescription(visualizationId) {
  return getVisualizationConfig(visualizationId)?.description || "";
}

export function getManualOperations(visualizationId) {
  const moduleDefinition = getVisualizationConfig(visualizationId);
  return Array.isArray(moduleDefinition?.manualOperations) ? moduleDefinition.manualOperations : [];
}

export function getRenderableOperation(visualizationId) {
  const entry = Object.values(MODE_OPTIONS)
    .flat()
    .find((candidate) => candidate.id === visualizationId);
  return entry || null;
}

export function buildScenario({ mode, visualizationId, presetId, operation, currentState }) {
  const entry = getVisualizationEntry(mode, visualizationId) || getRenderableOperation(visualizationId);
  const moduleDefinition = entry?.module || getVisualizationConfig(visualizationId);

  if (!moduleDefinition) {
    return null;
  }

  const normalizedPresetId = normalizePresetId(moduleDefinition, presetId);
  const safeCurrentState = cloneLike(currentState ?? moduleDefinition.initialState ?? null);
  let steps = [];
  let initialState = cloneLike(safeCurrentState);

  if (entry?.operation === "bubbleSort" || entry?.operation === "selectionSort") {
    const preset = moduleDefinition.presets?.find((candidate) => candidate.id === normalizedPresetId) ||
      moduleDefinition.presets?.[0] ||
      null;
    const loadedState =
      typeof moduleDefinition.applyOperation === "function"
        ? moduleDefinition.applyOperation(cloneLike(moduleDefinition.initialState), {
            type: "loadPreset",
            presetId: preset?.id
          })
        : cloneLike(moduleDefinition.initialState);
    steps = createScenarioStepsFromModule(moduleDefinition, { type: entry.operation }, loadedState);
    initialState = cloneLike(loadedState);
  } else if (
    operation?.type &&
    operation.type !== "loadPreset" &&
    operation.type !== "preset" &&
    typeof moduleDefinition.generateSteps === "function"
  ) {
    steps = createScenarioStepsFromModule(moduleDefinition, operation, safeCurrentState);
    initialState = cloneLike(safeCurrentState);
  } else if (entry?.operation === "preset" && typeof moduleDefinition.createScenario === "function") {
    const preset = moduleDefinition.presets?.find((candidate) => candidate.id === normalizedPresetId) ||
      moduleDefinition.presets?.[0] ||
      null;
    const scenario = moduleDefinition.createScenario(preset || undefined);
    steps = Array.isArray(scenario?.steps) ? scenario.steps : [];
    initialState = cloneLike(scenario?.initialState ?? moduleDefinition.initialState ?? null);
  } else {
    const resolvedOperation = operation || { type: "loadPreset", presetId: normalizedPresetId };
    steps = createScenarioStepsFromModule(moduleDefinition, resolvedOperation, safeCurrentState);
    initialState = cloneLike(safeCurrentState);

    if ((!steps || steps.length === 0) && typeof moduleDefinition.createScenario === "function" && resolvedOperation.type === "loadPreset") {
      const preset = moduleDefinition.presets?.find((candidate) => candidate.id === normalizedPresetId) ||
        moduleDefinition.presets?.[0] ||
        null;
      const scenario = moduleDefinition.createScenario(preset || undefined);
      steps = Array.isArray(scenario?.steps) ? scenario.steps : [];
      initialState = cloneLike(scenario?.initialState ?? moduleDefinition.initialState ?? null);
    }
  }

  const wrappedSteps = wrapSteps(moduleDefinition, steps, initialState);
  return {
    ...wrappedSteps,
    id: `${visualizationId}-${mode}-${normalizedPresetId || "default"}-${operation?.type || "load"}`,
    title: getModuleTitle(visualizationId),
    description: getModuleDescription(visualizationId),
    meta: {
      mode,
      visualizationId,
      presetId: normalizedPresetId,
      operationType: operation?.type || entry?.operation || "loadPreset"
    }
  };
}

export function getManualOperationSuggestion(visualizationId) {
  const operations = getManualOperations(visualizationId);
  const directValueOperation = operations.find((operation) =>
    Array.isArray(operation.inputs) && operation.inputs.some((input) => input.type === "number")
  );

  return directValueOperation || null;
}

export function isModeVisualization(mode, visualizationId) {
  return getVisibleVisualizationIds(mode).includes(visualizationId);
}

export { linearModules, nonlinearModules };
