// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  AGENT_PROFILE_REGISTRY,
  selectAnalysisProfiles,
} from '../../../electron/ai/agentProfiles';

describe('analysis profile registry', () => {
  it('defines the four approved prompt modules and visible names', () => {
    expect(Object.keys(AGENT_PROFILE_REGISTRY)).toEqual([
      'general',
      'harmony',
      'voice-leading',
      'form-phrase',
    ]);
    expect(Object.values(AGENT_PROFILE_REGISTRY).map(({ name }) => name)).toEqual([
      'General analysis',
      'Harmony analysis',
      'Voice-leading analysis',
      'Form and phrase analysis',
    ]);
    expect(Object.values(AGENT_PROFILE_REGISTRY).every(({ prompt }) => prompt.length > 80))
      .toBe(true);
  });

  it('validates and deduplicates mixed profile selections in request order', () => {
    const selected = selectAnalysisProfiles(['harmony', 'voice-leading', 'harmony']);

    expect(selected.map(({ id }) => id)).toEqual(['harmony', 'voice-leading']);
    expect(Object.isFrozen(selected)).toBe(true);
    expect(() => selectAnalysisProfiles([])).toThrow(/one and four/);
    expect(() => selectAnalysisProfiles(['harmony', 'unknown'])).toThrow(/Unknown/);
    expect(() => selectAnalysisProfiles(['general', 'harmony', 'voice-leading', 'form-phrase', 'general']))
      .toThrow(/one and four/);
  });
});
