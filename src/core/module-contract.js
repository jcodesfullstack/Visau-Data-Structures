const hasStructuredClone = typeof globalThis.structuredClone === "function";

export const PLAYBACK_STATUS = Object.freeze({
  IDLE: "idle",
  READY: "ready",
  PLAYING: "playing",
  PAUSED: "paused",
  COMPLETED: "completed"
});

export function cloneValue(value) {
  if (value == null || typeof value !== "object") {
    return value;
  }

  if (hasStructuredClone) {
    return globalThis.structuredClone(value);
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

export function isPlainObject(value) {
  if (value == null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function deepFreeze(value, seen = new WeakSet()) {
  if (value == null || typeof value !== "object" || seen.has(value)) {
    return value;
  }

  seen.add(value);

  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(value[key], seen);
  }

  return Object.freeze(value);
}

function toStringValue(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toDurationMs(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }

  return Math.floor(number);
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) {
    return Object.freeze([]);
  }

  return Object.freeze(
    value
      .filter((entry) => typeof entry === "string" && entry.length > 0)
      .map((entry) => entry.trim())
  );
}

function normalizeAnnotationList(value) {
  if (!Array.isArray(value)) {
    return Object.freeze([]);
  }

  return Object.freeze(value.map((patch) => deepFreeze(cloneValue(patch))));
}

export function normalizeView(view = {}) {
  const safeView = isPlainObject(view) ? view : {};
  const highlights = isPlainObject(safeView.highlights) ? safeView.highlights : {};

  return deepFreeze({
    message: toStringValue(safeView.message, ""),
    explanation: toStringValue(safeView.explanation, ""),
    annotations: normalizeAnnotationList(safeView.annotations),
    patches: normalizeAnnotationList(safeView.patches),
    highlights: {
      activeIds: normalizeIdList(highlights.activeIds),
      freshIds: normalizeIdList(highlights.freshIds),
      selectedIds: normalizeIdList(highlights.selectedIds),
      visitedIds: normalizeIdList(highlights.visitedIds),
      frontierIds: normalizeIdList(highlights.frontierIds),
      mutedIds: normalizeIdList(highlights.mutedIds)
    },
    focus: isPlainObject(safeView.focus) ? deepFreeze(cloneValue(safeView.focus)) : null
  });
}

export function normalizeAnimationStep(step, index = 0) {
  if (!isPlainObject(step)) {
    throw new TypeError("Animation steps must be plain objects.");
  }

  const id = toStringValue(step.id, `step-${index}`);
  const type = toStringValue(step.type, "step");
  const label = toStringValue(step.label ?? step.title, id);
  const description = toStringValue(step.description ?? step.explanation, "");
  const explanation = toStringValue(step.explanation ?? step.description, description);
  const durationMs = toDurationMs(step.durationMs, 0);
  const view = normalizeView(step.view ?? step.render ?? {});
  const state = "state" in step ? cloneValue(step.state) : null;
  const apply =
    typeof step.apply === "function"
      ? step.apply
      : state !== null
        ? () => cloneValue(state)
        : null;

  if (typeof apply !== "function") {
    throw new TypeError(`Animation step "${step.id ?? index}" is missing an apply(state, context) function.`);
  }

  return deepFreeze({
    id,
    type,
    label,
    description,
    explanation,
    durationMs,
    apply,
    state,
    view,
    meta: isPlainObject(step.meta) ? deepFreeze(cloneValue(step.meta)) : null
  });
}

export function resolveScenarioInitialState(scenario) {
  if (!isPlainObject(scenario)) {
    return undefined;
  }

  if (typeof scenario.createInitialState === "function") {
    return cloneValue(scenario.createInitialState());
  }

  if ("initialState" in scenario) {
    return cloneValue(scenario.initialState);
  }

  return undefined;
}

function normalizeScenarioSteps(steps = []) {
  if (!Array.isArray(steps)) {
    throw new TypeError("Scenario steps must be provided as an array.");
  }

  return Object.freeze(steps.map((step, index) => normalizeAnimationStep(step, index)));
}

export function createScenario(definition) {
  if (!isPlainObject(definition)) {
    throw new TypeError("Scenario definitions must be plain objects.");
  }

  const id = toStringValue(definition.id, "");
  if (!id) {
    throw new TypeError("Scenario definitions need a stable id.");
  }

  const title = toStringValue(definition.title, id);
  const description = toStringValue(definition.description, "");
  const steps = normalizeScenarioSteps(definition.steps ?? []);
  const initialState = resolveScenarioInitialState(definition);
  const cloneState = typeof definition.cloneState === "function" ? definition.cloneState : cloneValue;

  return deepFreeze({
    id,
    title,
    description,
    steps,
    stepCount: steps.length,
    initialState,
    cloneState,
    meta: isPlainObject(definition.meta) ? deepFreeze(cloneValue(definition.meta)) : null
  });
}

export function normalizeScenario(definition) {
  return createScenario(definition);
}

function normalizeScenarioCollection(scenarios) {
  if (Array.isArray(scenarios)) {
    return scenarios.map((scenario, index) => {
      if (isPlainObject(scenario) && scenario.id) {
        return createScenario(scenario);
      }

      const safeScenario = isPlainObject(scenario) ? scenario : {};
      return createScenario({
        ...safeScenario,
        id: `scenario-${index}`
      });
    });
  }

  if (isPlainObject(scenarios)) {
    return Object.entries(scenarios).map(([id, scenario]) =>
      createScenario({
        ...(isPlainObject(scenario) ? scenario : {}),
        id
      })
    );
  }

  throw new TypeError("Module scenarios must be an array or a plain object map.");
}

export function createVisualizationModule(definition) {
  if (!isPlainObject(definition)) {
    throw new TypeError("Module definitions must be plain objects.");
  }

  const id = toStringValue(definition.id, "");
  if (!id) {
    throw new TypeError("Module definitions need a stable id.");
  }

  const title = toStringValue(definition.title, id);
  const description = toStringValue(definition.description, "");
  const scenarios = normalizeScenarioCollection(definition.scenarios ?? []);
  const scenarioMap = Object.freeze(
    scenarios.reduce((accumulator, scenario) => {
      accumulator[scenario.id] = scenario;
      return accumulator;
    }, {})
  );
  const defaultScenarioId =
    toStringValue(definition.defaultScenarioId, "") || scenarios[0]?.id || "";

  return deepFreeze({
    id,
    title,
    description,
    scenarios,
    scenarioMap,
    defaultScenarioId,
    meta: isPlainObject(definition.meta) ? deepFreeze(cloneValue(definition.meta)) : null
  });
}

export function normalizeVisualizationModule(definition) {
  return createVisualizationModule(definition);
}

export function getModuleScenario(moduleDefinition, scenarioId = "") {
  if (!isPlainObject(moduleDefinition) || !isPlainObject(moduleDefinition.scenarioMap)) {
    return null;
  }

  if (scenarioId && moduleDefinition.scenarioMap[scenarioId]) {
    return moduleDefinition.scenarioMap[scenarioId];
  }

  if (moduleDefinition.defaultScenarioId && moduleDefinition.scenarioMap[moduleDefinition.defaultScenarioId]) {
    return moduleDefinition.scenarioMap[moduleDefinition.defaultScenarioId];
  }

  return moduleDefinition.scenarios?.[0] ?? null;
}

export function getDefaultScenario(moduleDefinition) {
  return getModuleScenario(moduleDefinition);
}
