import { describe, it, expect } from 'vitest';
import {
  ScoreVideoTimeline,
  type ScoreSystemBBox,
  type ScoreNoteEvent,
} from '../scoreVideoTimeline';

describe('ScoreVideoTimeline', () => {
  const mockSystems: ScoreSystemBBox[] = [
    {
      systemIndex: 0,
      lineClass: 'abcjs-l0',
      minMeasure: 1,
      maxMeasure: 2,
      top: 50,
      bottom: 150,
      height: 100,
      left: 20,
      width: 600,
    },
    {
      systemIndex: 1,
      lineClass: 'abcjs-l1',
      minMeasure: 3,
      maxMeasure: 4,
      top: 200,
      bottom: 300,
      height: 100,
      left: 20,
      width: 600,
    },
  ];

  const mockNotes: ScoreNoteEvent[] = [
    {
      timeSec: 0,
      durationSec: 1,
      systemIndex: 0,
      measureNumber: 1,
      x: 50,
      y: 80,
      width: 10,
      height: 20,
    },
    {
      timeSec: 1,
      durationSec: 1,
      systemIndex: 0,
      measureNumber: 1,
      x: 150,
      y: 80,
      width: 10,
      height: 20,
    },
    {
      timeSec: 2,
      durationSec: 1,
      systemIndex: 1,
      measureNumber: 3,
      x: 50,
      y: 230,
      width: 10,
      height: 20,
    },
  ];

  it('calculates total duration and phases correctly', () => {
    const timeline = new ScoreVideoTimeline(
      {
        introDurationSec: 3,
        scoreDurationSec: 3,
        outroDurationSec: 2,
      },
      mockSystems,
      mockNotes,
    );

    expect(timeline.totalDurationSec).toBe(8);

    // Intro phase
    const tIntro = timeline.getFrameState(1.5);
    expect(tIntro.phase).toBe('intro');
    expect(tIntro.progress).toBeCloseTo(1.5 / 8);

    // Score phase
    const tScore = timeline.getFrameState(4.0); // 3s intro + 1s into score
    expect(tScore.phase).toBe('score');
    expect(tScore.scoreState?.scoreTimeSec).toBeCloseTo(1.0);
    expect(tScore.scoreState?.activeSystemIndex).toBe(0);
    expect(tScore.scoreState?.nextSystemIndex).toBe(1);

    // Outro phase
    const tOutro = timeline.getFrameState(7.0); // 6s + 1s into outro
    expect(tOutro.phase).toBe('outro');
    expect(tOutro.outroState?.fadeProgress).toBeCloseTo(0.5);
  });

  it('interpolates cursor X smoothly between notes within the same system', () => {
    const timeline = new ScoreVideoTimeline(
      {
        introDurationSec: 2,
        scoreDurationSec: 3,
        outroDurationSec: 1,
      },
      mockSystems,
      mockNotes,
    );

    // At intro + 0.5s score time: halfway between note 0 (x=50) and note 1 (x=150)
    const state = timeline.getFrameState(2.5);
    expect(state.phase).toBe('score');
    expect(state.scoreState?.cursorX).toBeCloseTo(100);
  });

  it('transitions activeSystemIndex and nextSystemIndex across lines', () => {
    const timeline = new ScoreVideoTimeline(
      {
        introDurationSec: 0,
        scoreDurationSec: 3,
        outroDurationSec: 0,
      },
      mockSystems,
      mockNotes,
    );

    const stateLine1 = timeline.getFrameState(2.2);
    expect(stateLine1.phase).toBe('score');
    expect(stateLine1.scoreState?.activeSystemIndex).toBe(1);
    expect(stateLine1.scoreState?.nextSystemIndex).toBeNull();
  });

  it('calculates count-in beats during intro phase', () => {
    const timeline = new ScoreVideoTimeline(
      {
        introDurationSec: 4,
        scoreDurationSec: 4,
        outroDurationSec: 2,
        countInBeats: 4,
        tempoBpm: 60, // 1 beat = 1s, count-in fits exactly in 4s
      },
      mockSystems,
      mockNotes,
    );

    const beat1 = timeline.getFrameState(0.5);
    expect(beat1.phase).toBe('intro');
    expect(beat1.introState?.countInBeat).toBe(1);

    const beat3 = timeline.getFrameState(2.5);
    expect(beat3.introState?.countInBeat).toBe(3);
  });
});
