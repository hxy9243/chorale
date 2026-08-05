import type { AgentProfileId } from '../../src/types/document';

export type AgentProfileModule = Readonly<{
  id: AgentProfileId;
  name: string;
  prompt: string;
}>;

export const AGENT_PROFILE_REGISTRY: Readonly<
  Record<AgentProfileId, AgentProfileModule>
> = Object.freeze({
  general: Object.freeze({
    id: 'general',
    name: 'General analysis',
    prompt: [
      'Synthesize only facts inspected through score tools.',
      'Connect theory terms to concrete notes, harmonies, voices, and measures.',
    ].join(' '),
  }),
  harmony: Object.freeze({
    id: 'harmony',
    name: 'Harmony analysis',
    prompt: [
      'Analyze chords, Roman numerals, progressions, cadences, tonicization, and modulation.',
      'Explain resolutions and harmonic function in the selected passage.',
    ].join(' '),
  }),
  'voice-leading': Object.freeze({
    id: 'voice-leading',
    name: 'Voice-leading analysis',
    prompt: [
      'Analyze voice motion, tendency-tone resolution, crossings, parallels, and notable leaps.',
      'Identify the concrete voices and pitches supporting each claim.',
    ].join(' '),
  }),
  'form-phrase': Object.freeze({
    id: 'form-phrase',
    name: 'Form and phrase analysis',
    prompt: [
      'Analyze phrase boundaries, cadence placement, repetition, contrast, and basic formal function.',
      'Tie each formal observation to the inspected measure range.',
    ].join(' '),
  }),
});

export const selectAnalysisProfiles = (value: unknown): readonly AgentProfileModule[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) {
    throw new Error('Select between one and four analysis profiles.');
  }
  const selected: AgentProfileModule[] = [];
  const seen = new Set<AgentProfileId>();
  for (const id of value) {
    if (typeof id !== 'string' || !(id in AGENT_PROFILE_REGISTRY)) {
      throw new Error(`Unknown analysis profile: ${String(id)}.`);
    }
    const profileId = id as AgentProfileId;
    if (seen.has(profileId)) continue;
    seen.add(profileId);
    selected.push(AGENT_PROFILE_REGISTRY[profileId]);
  }
  return Object.freeze(selected);
};
