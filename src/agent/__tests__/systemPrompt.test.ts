// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SHEET_AGENT_SYSTEM_PROMPT } from '../../../electron/ai/systemPrompt';

describe('Music Tutor system prompt', () => {
  it('requires grounded inspection, contextual explanation, uncertainty, and safe links', () => {
    expect(SHEET_AGENT_SYSTEM_PROMPT).toContain('call select_analysis_profile');
    expect(SHEET_AGENT_SYSTEM_PROMPT).toContain('read_measure_range');
    expect(SHEET_AGENT_SYSTEM_PROMPT).toContain('Explain theory terms in concrete context');
    expect(SHEET_AGENT_SYSTEM_PROMPT).toContain('state the uncertainty');
    expect(SHEET_AGENT_SYSTEM_PROMPT).toContain('[m. N](#measure-N)');
    expect(SHEET_AGENT_SYSTEM_PROMPT).toContain('[mm. N–M](#measure-N-M)');
    expect(SHEET_AGENT_SYSTEM_PROMPT).toContain('Do not emit raw HTML');
    expect(SHEET_AGENT_SYSTEM_PROMPT).toContain('Never claim to have changed the score');
    expect(SHEET_AGENT_SYSTEM_PROMPT).toContain('ABC NOTATION GUIDE FOR MUSIC ANALYSIS');
    expect(SHEET_AGENT_SYSTEM_PROMPT).toContain('Key Signature Inheritance (CRITICAL)');
    expect(SHEET_AGENT_SYSTEM_PROMPT).toContain('MUSIC THEORY & ANALYSIS RULES');
    expect(SHEET_AGENT_SYSTEM_PROMPT).toContain('Bass Note & Inversions');
    expect(SHEET_AGENT_SYSTEM_PROMPT).toContain('Tonicization vs Modulation');
  });
});
