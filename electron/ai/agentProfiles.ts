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
      'Connect theory terms to concrete notes, harmonies, voices, and measures with valid measure links.',
    ].join(' '),
  }),
  harmony: Object.freeze({
    id: 'harmony',
    name: 'Harmony analysis',
    prompt: [
      'Analyze chords, Roman numerals in the active key, and inversions by identifying the bass note (I, I6, I6/4, V7, V6/5, V4/3, V4/2).',
      'Distinguish temporary tonicization (e.g. V7/V) from true modulation (pivot chord, secondary dominant, confirming cadence).',
      'Identify cadence types (PAC, IAC, HC, Phrygian HC, Deceptive), minor-key raised leading tones, and chromatic harmonies (N6, It/Fr/Ger+6).',
    ].join(' '),
  }),
  'voice-leading': Object.freeze({
    id: 'voice-leading',
    name: 'Voice-leading analysis',
    prompt: [
      'Analyze multi-voice motion across [V:voiceId] lines: detect parallel 5ths/8ves, contrary/oblique motion, voice crossings, and spacing.',
      'Track tendency-tone resolutions (7->1, chordal 7th 4->3) and suspensions (4-3, 7-6, 9-8) citing concrete voices and pitches.',
    ].join(' '),
  }),
  'form-phrase': Object.freeze({
    id: 'form-phrase',
    name: 'Form and phrase analysis',
    prompt: [
      'Analyze phrase boundaries, cadence placement, antecedent-consequent periods, sentence structures, repetition, and contrast.',
      'Tie each formal observation directly to the inspected measure range.',
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
