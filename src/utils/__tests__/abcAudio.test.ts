import { describe, expect, it } from 'vitest';
import abcjs from 'abcjs';
import fs from 'fs';
import path from 'path';
import {
  prepareAbcForPlayback,
  sanitizeAbcForAudio,
  syncAbcTempoAcrossVoices,
} from '../abcAudio';

describe('abcAudio utilities', () => {
  const beethovenAbcPath = path.resolve(__dirname, '../../../beethoven.abc');
  const beethovenAbc = fs.readFileSync(beethovenAbcPath, 'utf-8');

  it('sanitizeAbcForAudio removes inline [Q:] markings while preserving header Q:', () => {
    const sanitized = sanitizeAbcForAudio(beethovenAbc);
    expect(sanitized).toContain('Q:1/4=68');
    expect(sanitized).not.toContain('[Q:1/4=66]');
    expect(sanitized).not.toContain('[Q:1/4=60]');
  });

  it('syncAbcTempoAcrossVoices propagates inline tempos to all voices', () => {
    const synced = syncAbcTempoAcrossVoices(beethovenAbc);
    // V:2 should now contain inline tempos matching V:1 measures
    expect(synced).toContain('[Q:1/4=66]');
    
    // Test with abcjs parse & setupAudio
    const tunes = abcjs.parseOnly(synced);
    expect(tunes).toBeDefined();
    expect(tunes.length).toBeGreaterThan(0);
    const audioEvents = tunes[0].setUpAudio();
    expect(audioEvents.tracks.length).toBe(2);

    const tr0Notes = audioEvents.tracks[0].filter((e: any) => e.cmd === 'note');
    const tr1Notes = audioEvents.tracks[1].filter((e: any) => e.cmd === 'note');

    const lastTr0 = tr0Notes[tr0Notes.length - 1];
    const lastTr1 = tr1Notes[tr1Notes.length - 1];

    // Final note start times should align within 1ms
    const timeDiffSec = Math.abs(lastTr0.start - lastTr1.start);
    expect(timeDiffSec).toBeLessThan(0.001);
  });

  it('prepareAbcForPlayback generates fully synchronized audio tracks', () => {
    const prepared = prepareAbcForPlayback(beethovenAbc, 'sync');
    const tunes = abcjs.parseOnly(prepared);
    const audioEvents = tunes[0].setUpAudio();

    const tr0Notes = audioEvents.tracks[0].filter((e: any) => e.cmd === 'note');
    const tr1Notes = audioEvents.tracks[1].filter((e: any) => e.cmd === 'note');

    const lastTr0 = tr0Notes[tr0Notes.length - 1];
    const lastTr1 = tr1Notes[tr1Notes.length - 1];

    expect(Math.abs(lastTr0.start - lastTr1.start)).toBeLessThan(0.001);
  });
});
