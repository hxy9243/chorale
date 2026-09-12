/**
 * Pure timeline calculation engine for sheet music video generation.
 * Maps video timestamp t to phase (intro/score/outro), system line indices,
 * active measure, count-in beat, and interpolated cursor coordinates.
 */

export type ScoreVideoPhase = 'intro' | 'score' | 'outro';

export interface ScoreSystemBBox {
  systemIndex: number;
  lineClass: string;
  minMeasure: number;
  maxMeasure: number;
  top: number;
  bottom: number;
  height: number;
  left: number;
  width: number;
}

export interface ScoreNoteEvent {
  timeSec: number;
  durationSec: number;
  systemIndex: number;
  measureNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScoreVideoConfig {
  introDurationSec: number;
  outroDurationSec: number;
  scoreDurationSec: number;
  beatsPerMeasure?: number;
  tempoBpm?: number;
  countInBeats?: number;
}

export interface IntroState {
  countInBeat: number; // 0 (inactive), or 1..total
  countInTotalBeats: number;
  beatFraction: number; // 0..1 within the current beat
}

export interface ScoreState {
  scoreTimeSec: number;
  activeSystemIndex: number;
  nextSystemIndex: number | null;
  cursorX: number;
  cursorY: number;
  cursorHeight: number;
  measureNumber: number;
}

export interface OutroState {
  fadeProgress: number; // 0..1
}

export interface ScoreVideoFrameState {
  timestampSec: number;
  totalDurationSec: number;
  phase: ScoreVideoPhase;
  progress: number; // 0..1
  introState?: IntroState;
  scoreState?: ScoreState;
  outroState?: OutroState;
}

export class ScoreVideoTimeline {
  readonly config: Required<ScoreVideoConfig>;
  readonly systems: ScoreSystemBBox[];
  readonly noteEvents: ScoreNoteEvent[];
  readonly totalDurationSec: number;

  constructor(
    config: ScoreVideoConfig,
    systems: ScoreSystemBBox[] = [],
    noteEvents: ScoreNoteEvent[] = [],
  ) {
    this.config = {
      introDurationSec: Math.max(0, config.introDurationSec ?? 3),
      outroDurationSec: Math.max(0, config.outroDurationSec ?? 3),
      scoreDurationSec: Math.max(0.1, config.scoreDurationSec ?? 1),
      beatsPerMeasure: Math.max(1, config.beatsPerMeasure ?? 4),
      tempoBpm: Math.max(20, config.tempoBpm ?? 120),
      countInBeats: Math.max(0, config.countInBeats ?? 4),
    };

    this.systems = [...systems].sort((a, b) => a.systemIndex - b.systemIndex);
    this.noteEvents = [...noteEvents].sort((a, b) => a.timeSec - b.timeSec);

    this.totalDurationSec =
      this.config.introDurationSec +
      this.config.scoreDurationSec +
      this.config.outroDurationSec;
  }

  getFrameState(timestampSec: number): ScoreVideoFrameState {
    const clampedTime = Math.max(0, Math.min(timestampSec, this.totalDurationSec));
    const progress = this.totalDurationSec > 0 ? clampedTime / this.totalDurationSec : 1;

    const { introDurationSec, scoreDurationSec } = this.config;
    const scoreStartTime = introDurationSec;
    const outroStartTime = introDurationSec + scoreDurationSec;

    if (clampedTime < scoreStartTime) {
      return {
        timestampSec: clampedTime,
        totalDurationSec: this.totalDurationSec,
        phase: 'intro',
        progress,
        introState: this.calculateIntroState(clampedTime),
      };
    }

    if (clampedTime >= outroStartTime) {
      const outroElapsed = clampedTime - outroStartTime;
      const outroDuration = this.config.outroDurationSec;
      const fadeProgress = outroDuration > 0 ? Math.min(1, outroElapsed / outroDuration) : 1;
      return {
        timestampSec: clampedTime,
        totalDurationSec: this.totalDurationSec,
        phase: 'outro',
        progress,
        outroState: { fadeProgress },
      };
    }

    const scoreTimeSec = clampedTime - scoreStartTime;
    return {
      timestampSec: clampedTime,
      totalDurationSec: this.totalDurationSec,
      phase: 'score',
      progress,
      scoreState: this.calculateScoreState(scoreTimeSec),
    };
  }

  private calculateIntroState(timeSec: number): IntroState {
    const { introDurationSec, countInBeats } = this.config;
    if (countInBeats <= 0 || introDurationSec <= 0) {
      return { countInBeat: 0, countInTotalBeats: 0, beatFraction: 0 };
    }

    // Allocate count-in across the final portion of intro, or whole intro
    const countInDuration = Math.min(introDurationSec, (60 / this.config.tempoBpm) * countInBeats);
    const countInStartTime = introDurationSec - countInDuration;

    if (timeSec < countInStartTime) {
      return { countInBeat: 0, countInTotalBeats: countInBeats, beatFraction: 0 };
    }

    const elapsed = timeSec - countInStartTime;
    const beatDuration = countInDuration / countInBeats;
    const beatIndex = Math.min(countInBeats - 1, Math.floor(elapsed / beatDuration));
    const beatFraction = (elapsed % beatDuration) / beatDuration;

    return {
      countInBeat: beatIndex + 1,
      countInTotalBeats: countInBeats,
      beatFraction,
    };
  }

  private calculateScoreState(scoreTimeSec: number): ScoreState {
    if (this.systems.length === 0) {
      return {
        scoreTimeSec,
        activeSystemIndex: 0,
        nextSystemIndex: null,
        cursorX: 0,
        cursorY: 0,
        cursorHeight: 50,
        measureNumber: 1,
      };
    }

    if (this.noteEvents.length === 0) {
      const activeSystem = this.systems[0];
      return {
        scoreTimeSec,
        activeSystemIndex: activeSystem.systemIndex,
        nextSystemIndex: this.systems.length > 1 ? this.systems[1].systemIndex : null,
        cursorX: activeSystem.left,
        cursorY: activeSystem.top,
        cursorHeight: activeSystem.height,
        measureNumber: activeSystem.minMeasure,
      };
    }

    // Find the note events surrounding scoreTimeSec
    const events = this.noteEvents;
    let currIdx = 0;

    for (let i = 0; i < events.length; i++) {
      if (events[i].timeSec <= scoreTimeSec) {
        currIdx = i;
      } else {
        break;
      }
    }

    const currentEvent = events[currIdx];
    const nextEvent = currIdx + 1 < events.length ? events[currIdx + 1] : null;

    const activeSysIdx = currentEvent.systemIndex;
    const activeSystem = this.systems.find((s) => s.systemIndex === activeSysIdx) || this.systems[0];
    const activeSystemArrIdx = this.systems.findIndex((s) => s.systemIndex === activeSysIdx);
    const nextSystem =
      activeSystemArrIdx >= 0 && activeSystemArrIdx + 1 < this.systems.length
        ? this.systems[activeSystemArrIdx + 1]
        : null;

    let cursorX = currentEvent.x;
    const cursorY = activeSystem.top;
    const cursorHeight = activeSystem.height > 0 ? activeSystem.height : 50;
    const measureNumber = currentEvent.measureNumber;

    if (nextEvent && nextEvent.systemIndex === activeSysIdx) {
      const deltaT = nextEvent.timeSec - currentEvent.timeSec;
      if (deltaT > 0 && scoreTimeSec >= currentEvent.timeSec) {
        const factor = Math.max(0, Math.min(1, (scoreTimeSec - currentEvent.timeSec) / deltaT));
        cursorX = currentEvent.x + factor * (nextEvent.x - currentEvent.x);
      }
    } else {
      // In the final note of the system, glide toward the end of the measure/system
      const noteEnd = currentEvent.timeSec + Math.max(0.1, currentEvent.durationSec);
      if (scoreTimeSec > currentEvent.timeSec) {
        const factor = Math.min(1, (scoreTimeSec - currentEvent.timeSec) / (noteEnd - currentEvent.timeSec));
        const targetX = Math.min(activeSystem.left + activeSystem.width, currentEvent.x + 40);
        cursorX = currentEvent.x + factor * (targetX - currentEvent.x);
      }
    }

    return {
      scoreTimeSec,
      activeSystemIndex: activeSystem.systemIndex,
      nextSystemIndex: nextSystem ? nextSystem.systemIndex : null,
      cursorX,
      cursorY,
      cursorHeight,
      measureNumber,
    };
  }
}
