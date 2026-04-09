import {
  PLAYBACK_STATUS,
  cloneValue,
  createScenario,
  resolveScenarioInitialState
} from "./module-contract.js";

function toSpeedMs(value, fallback = 650) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }

  return Math.floor(number);
}

function defaultSetTimeoutFn(callback, delay) {
  return globalThis.setTimeout(callback, delay);
}

function defaultClearTimeoutFn(handle) {
  globalThis.clearTimeout(handle);
}

function createSnapshot(controller) {
  const scenario = controller._scenario;
  const stepCount = scenario?.steps.length ?? 0;
  const currentIndex = controller._currentIndex;
  const currentStep = currentIndex > 0 && scenario ? scenario.steps[currentIndex - 1] : null;
  const nextStep = currentIndex < stepCount && scenario ? scenario.steps[currentIndex] : null;

  return {
    status: controller._status,
    speedMs: controller._speedMs,
    currentIndex,
    stepCount,
    currentStep,
    nextStep,
    currentState: cloneValue(controller._history[currentIndex] ?? null),
    historyLength: controller._history.length,
    scenario: scenario
      ? {
          id: scenario.id,
          title: scenario.title,
          description: scenario.description,
          stepCount: scenario.stepCount
        }
      : null,
    canStepForward: Boolean(scenario && currentIndex < stepCount),
    canStepBackward: currentIndex > 0,
    progress: stepCount > 0 ? currentIndex / stepCount : 0
  };
}

export class PlaybackController {
  constructor(options = {}) {
    this._scenario = null;
    this._status = PLAYBACK_STATUS.IDLE;
    this._speedMs = toSpeedMs(options.speedMs, 650);
    this._currentIndex = 0;
    this._history = [];
    this._timer = null;
    this._listeners = new Set();
    this._setTimeout = typeof options.setTimeout === "function" ? options.setTimeout : defaultSetTimeoutFn;
    this._clearTimeout = typeof options.clearTimeout === "function" ? options.clearTimeout : defaultClearTimeoutFn;
    this._lastError = null;
    this._onChange = typeof options.onChange === "function" ? options.onChange : null;

    if (options.scenario) {
      this.loadScenario(options.scenario, { autoplay: Boolean(options.autoplay) });
    }
  }

  get status() {
    return this._status;
  }

  get speedMs() {
    return this._speedMs;
  }

  get scenario() {
    return this._scenario;
  }

  get currentIndex() {
    return this._currentIndex;
  }

  get stepCount() {
    return this._scenario?.steps.length ?? 0;
  }

  get isPlaying() {
    return this._status === PLAYBACK_STATUS.PLAYING;
  }

  get hasScenario() {
    return Boolean(this._scenario);
  }

  getState() {
    return cloneValue(this._history[this._currentIndex] ?? null);
  }

  getHistory() {
    return cloneValue(this._history);
  }

  getSnapshot() {
    return createSnapshot(this);
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Subscribers must be functions.");
    }

    this._listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.unsubscribe(listener);
  }

  unsubscribe(listener) {
    this._listeners.delete(listener);
  }

  setSpeed(speedMs) {
    this._speedMs = toSpeedMs(speedMs, this._speedMs);
    this._emit("speed-change");
    return this.getSnapshot();
  }

  loadScenario(scenario, options = {}) {
    const normalizedScenario = createScenario(scenario);
    const autoplay = Boolean(options.autoplay);

    this.pause();
    this._scenario = normalizedScenario;
    this._history = [];
    this._currentIndex = 0;
    this._lastError = null;

    const initialState = resolveScenarioInitialState(normalizedScenario);
    this._history[0] = cloneValue(initialState);
    this._status = normalizedScenario.steps.length > 0 ? PLAYBACK_STATUS.READY : PLAYBACK_STATUS.READY;

    this._emit("scenario-loaded");

    if (autoplay) {
      this.play();
    }

    return this.getSnapshot();
  }

  clearScenario() {
    this.pause();
    this._scenario = null;
    this._history = [];
    this._currentIndex = 0;
    this._lastError = null;
    this._status = PLAYBACK_STATUS.IDLE;
    this._emit("scenario-cleared");
    return this.getSnapshot();
  }

  reset() {
    this.pause();

    if (!this._scenario) {
      this._currentIndex = 0;
      this._status = PLAYBACK_STATUS.IDLE;
      this._emit("reset");
      return this.getSnapshot();
    }

    const initialState = resolveScenarioInitialState(this._scenario);
    this._history = [cloneValue(initialState)];
    this._currentIndex = 0;
    this._status = PLAYBACK_STATUS.READY;
    this._lastError = null;
    this._emit("reset");
    return this.getSnapshot();
  }

  play() {
    if (!this._scenario) {
      return this.getSnapshot();
    }

    if (this._currentIndex >= this.stepCount) {
      this._status = PLAYBACK_STATUS.COMPLETED;
      this._emit("play-at-end");
      return this.getSnapshot();
    }

    if (this._status === PLAYBACK_STATUS.PLAYING) {
      return this.getSnapshot();
    }

    this._status = PLAYBACK_STATUS.PLAYING;
    this._emit("play");
    this._scheduleNextTick();
    return this.getSnapshot();
  }

  pause() {
    if (this._timer !== null) {
      this._clearTimeout(this._timer);
      this._timer = null;
    }

    if (this._status === PLAYBACK_STATUS.PLAYING) {
      this._status = this._currentIndex >= this.stepCount ? PLAYBACK_STATUS.COMPLETED : PLAYBACK_STATUS.PAUSED;
      this._emit("pause");
    }

    return this.getSnapshot();
  }

  toggle() {
    return this.isPlaying ? this.pause() : this.play();
  }

  seek(targetIndex) {
    if (!this._scenario) {
      return this.getSnapshot();
    }

    const nextIndex = this._clampIndex(targetIndex);
    if (nextIndex === this._currentIndex) {
      return this.getSnapshot();
    }

    this.pause();
    this._currentIndex = nextIndex;
    this._status = nextIndex >= this.stepCount ? PLAYBACK_STATUS.COMPLETED : PLAYBACK_STATUS.READY;
    this._emit("seek");
    return this.getSnapshot();
  }

  stepForward() {
    if (!this._scenario) {
      return false;
    }

    this.pause();
    return this._stepForwardAndEmit(PLAYBACK_STATUS.READY);
  }

  stepBackward() {
    if (!this._scenario || this._currentIndex <= 0) {
      return false;
    }

    this.pause();
    this._currentIndex -= 1;
    this._status = PLAYBACK_STATUS.READY;
    this._lastError = null;
    this._emit("step-backward");
    return true;
  }

  advance() {
    return this.stepForward();
  }

  rewind() {
    return this.stepBackward();
  }

  destroy() {
    this.pause();
    this._listeners.clear();
    this._scenario = null;
    this._history = [];
    this._currentIndex = 0;
    this._lastError = null;
    this._status = PLAYBACK_STATUS.IDLE;
  }

  _scheduleNextTick() {
    if (!this._scenario || this._status !== PLAYBACK_STATUS.PLAYING) {
      return;
    }

    if (this._currentIndex >= this.stepCount) {
      this._status = PLAYBACK_STATUS.COMPLETED;
      this._emit("completed");
      return;
    }

    const nextStep = this._scenario.steps[this._currentIndex];
    const stepDelay = Number.isFinite(nextStep?.durationMs) ? nextStep.durationMs : 0;
    const baseDelay = Math.max(this._speedMs, stepDelay);
    const delay = Math.round(baseDelay * 1.35);

    this._timer = this._setTimeout(() => {
      this._timer = null;

      if (this._status !== PLAYBACK_STATUS.PLAYING) {
        return;
      }

      try {
        const advanced = this._stepForwardAndEmit(PLAYBACK_STATUS.PLAYING);

        if (!advanced || this._currentIndex >= this.stepCount) {
          this._status = PLAYBACK_STATUS.COMPLETED;
          this._emit("completed");
          return;
        }

        this._scheduleNextTick();
      } catch (error) {
        this._lastError = error;
        this.pause();
        this._emit("error");
      }
    }, delay);
  }

  _advanceOneStep() {
    if (!this._scenario || this._currentIndex >= this.stepCount) {
      return false;
    }

    const step = this._scenario.steps[this._currentIndex];
    const currentState = cloneValue(this._history[this._currentIndex] ?? null);
    const context = {
      controller: this,
      scenario: this._scenario,
      step,
      stepIndex: this._currentIndex,
      speedMs: this._speedMs,
      currentState: cloneValue(currentState),
      currentSnapshot: this.getSnapshot()
    };

    const result = step.apply(currentState, context);
    const nextState = cloneValue(result === undefined ? currentState : result);

    this._history[this._currentIndex + 1] = nextState;
    this._currentIndex += 1;
    this._lastError = null;
    return true;
  }

  _stepForwardAndEmit(statusWhenIncomplete) {
    const advanced = this._advanceOneStep();

    if (advanced && this._currentIndex < this.stepCount) {
      this._status = statusWhenIncomplete;
    }

    if (advanced && this._currentIndex >= this.stepCount) {
      this._status = PLAYBACK_STATUS.COMPLETED;
    }

    this._emit("step-forward");
    return advanced;
  }

  _clampIndex(targetIndex) {
    const number = Number(targetIndex);
    if (!Number.isFinite(number)) {
      return this._currentIndex;
    }

    return Math.min(Math.max(Math.floor(number), 0), this.stepCount);
  }

  _emit(changeType) {
    const snapshot = Object.freeze({
      ...this.getSnapshot(),
      changeType,
      lastError: this._lastError
    });

    for (const listener of this._listeners) {
      listener(snapshot);
    }

    if (this._onChange) {
      this._onChange(snapshot);
    }
  }
}

export { PLAYBACK_STATUS };
