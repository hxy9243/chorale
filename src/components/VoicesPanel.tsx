import { useCallback, useEffect, useId, useRef, useState } from 'react';
import abcjs from 'abcjs';
import { instrumentName, searchInstruments } from '../music/instruments';
import { isVoiceAudible, type MixerVoice, type VoiceMixSettings, type VoiceMix } from '../music/voiceMixer';

function InstrumentPicker({ voice, program, disabled, onChange, sourceMode = false }: {
  sourceMode?: boolean; voice: MixerVoice; program?: number; disabled: boolean; onChange: (program?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const options = [
    ...(!sourceMode && !query.trim() ? [{ program: undefined, name: `From score · ${instrumentName(voice.program)}`, family: 'Original sound' }] : []),
    ...searchInstruments(query),
  ];
  const choose = (value?: number) => { trigger.current?.focus(); setOpen(false); onChange(value); };
  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${highlighted}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, highlighted, id]);
  return <div className="voice-instrument-picker" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} type="button" className="voice-instrument-trigger" disabled={disabled}
      aria-label={`Instrument for ${voice.label}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { setOpen(!open); setQuery(''); setHighlighted(0); }}>
      <span>{instrumentName(program ?? voice.program)}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="voice-instrument-menu">
      <input autoFocus role="combobox" aria-label={`Search instruments for ${voice.label}`}
        aria-expanded="true" aria-controls={id} aria-autocomplete="list"
        aria-activedescendant={options.length ? `${id}-option-${highlighted}` : undefined}
        placeholder="Search instruments or families…" value={query}
        onChange={(event) => { setQuery(event.target.value); setHighlighted(0); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setHighlighted((index) => Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
          }
          if (event.key === 'Enter') { event.preventDefault(); if (options[highlighted]) choose(options[highlighted].program); }
        }} />
      <div role="listbox" id={id} aria-label={`Instruments for ${voice.label}`}>
        {options.map((option, index) => <button type="button" role="option" tabIndex={-1}
          id={`${id}-option-${index}`} key={option.program ?? 'score'}
          aria-selected={option.program === program} className={index === highlighted ? 'is-highlighted' : ''}
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option.program)}>
          <span>{option.name}</span><small>{option.family}</small>
        </button>)}
        {!options.length && <p role="status">No matching instruments.</p>}
      </div>
    </div>}
  </div>;
}

export function VoicesPanel({ voices, settings, disabled, volume, stopSignal, mainPlaying, onChange, onClose, onBeforePreview, activeStaffId, onProgramChange, visibleStaffIds, title }: {
  visibleStaffIds?: readonly string[]; title?: string;
  activeStaffId?: string; onProgramChange?: (id: string, program: number) => void;
  voices: readonly MixerVoice[]; settings: VoiceMixSettings; disabled: boolean; volume: number; stopSignal: number; mainPlaying: boolean;
  onChange: (settings: VoiceMixSettings) => void; onClose: (restoreFocus?: boolean) => void; onBeforePreview: () => void;
}) {
  const [preview, setPreview] = useState<{ id: string; playing: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!activeStaffId) return;
    const outside = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node) || panelRef.current?.contains(target)) return;
      // Let another staff label switch the popup without stealing its click.
      if (target instanceof Element && target.closest('.staff-sound-label')) return;
      closeRef.current(false);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    const dismiss = () => closeRef.current(false);
    window.addEventListener('blur', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
      window.removeEventListener('blur', dismiss);
    };
  }, [activeStaffId]);
  const previewRef = useRef<any>(null);
  const previewOperation = useRef(0);
  const stopPreview = useCallback(() => {
    previewOperation.current++;
    previewRef.current?.stop?.();
    previewRef.current = null;
    setPreview(null);
  }, []);
  useEffect(() => { panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }, []);
  useEffect(() => () => {
    previewOperation.current++;
    previewRef.current?.stop?.();
    previewRef.current = null;
  }, []);
  // Master mute/volume changes must also apply to an already-playing sample.
  useEffect(() => { stopPreview(); }, [volume, stopSignal, stopPreview]);
  useEffect(() => { if (mainPlaying) stopPreview(); }, [mainPlaying, stopPreview]);

  const previewInstrument = async (voice: MixerVoice) => {
    if (preview?.id === voice.id) { stopPreview(); return; }
    stopPreview();
    const operation = previewOperation.current;
    onBeforePreview();
    setError(null);
    setPreview({ id: voice.id, playing: false });
    try {
      const synth = (abcjs as any).synth;
      const buffer = new synth.CreateSynth();
      previewRef.current = buffer;
      const program = settings[voice.id]?.program ?? voice.program;
      const sequence = { tempo: 120, instrument: program, totalDuration: 0.75, tracks: [[
        { cmd: 'program', channel: 0, instrument: program },
        ...[60, 64, 67].map((pitch, index) => ({ cmd: 'note', pitch: program === 128 ? 38 : pitch, instrument: program, start: index * 0.25, duration: 0.2, volume: 85, gap: 0 })),
      ]] };
      const options = { soundFontVolumeMultiplier: 0.4, onEnded: () => {
        if (operation === previewOperation.current) { setPreview(null); previewRef.current = null; }
      } };
      const init = buffer.init({ sequence, millisecondsPerMeasure: 1600, options: { ...options, soundFontUrl: 'https://paulrosen.github.io/midi-js-soundfonts/abcjs/' } });
      // CreateSynth registers the audio context synchronously, within the gesture.
      const resume = synth.activeAudioContext?.()?.resume?.();
      await Promise.all([Promise.resolve(init).catch(() => {
        if (operation !== previewOperation.current) return;
        return buffer.init({ sequence, millisecondsPerMeasure: 1600, options });
      }), resume]);
      if (operation !== previewOperation.current) return;
      await buffer.prime();
      if (operation !== previewOperation.current) return;
      buffer.start();
      setPreview({ id: voice.id, playing: true });
    } catch {
      if (operation === previewOperation.current) { stopPreview(); setError('Could not load this sound. Try Preview again.'); }
    }
  };
  const update = (id: string, next: VoiceMix) => { stopPreview(); onChange({ ...settings, [id]: { ...settings[id], ...next } }); };
  return <section ref={panelRef} id={activeStaffId ? "staff-sound-dialog" : undefined} className="voices-panel" role={activeStaffId ? "dialog" : undefined} aria-label={activeStaffId ? "Staff sound" : "Voices"} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
  }}>
    <header><div><h3>{activeStaffId ? title ?? voices.find((voice) => voice.id === activeStaffId)?.label : "Voices"}</h3><p>{activeStaffId ? "Choose a sound for this staff." : "Choose sounds and listen to individual parts."}</p></div>
      <button type="button" onClick={() => onClose()} aria-label={activeStaffId ? 'Close staff sound' : 'Close Voices'}>×</button></header>
    <div className="voices-panel-body">
      {voices.filter((voice) => !activeStaffId || (visibleStaffIds ?? [activeStaffId]).includes(voice.id)).map((voice) => {
        const mix = settings[voice.id] ?? {};
        const audible = isVoiceAudible(voice, voices, settings);
        return <div className={`voice-mixer-row${audible ? '' : ' is-silent'}`} key={voice.id} role="group" aria-label={voice.label}>
          <div className="voice-mixer-heading"><strong>{voice.label}</strong><small>{mix.muted ? 'Muted' : !audible ? 'Silenced by solo' : mix.solo ? 'Solo' : 'Audible'}</small></div>
          <InstrumentPicker sourceMode={Boolean(onProgramChange)} voice={voice} program={onProgramChange ? voice.program : mix.program} disabled={disabled} onChange={(program) => { if (onProgramChange) { stopPreview(); onProgramChange(voice.id, program ?? voice.program); } else update(voice.id, { program }); }} />
          <div className="voice-mixer-actions">
            <button type="button" disabled={disabled} onClick={() => { void previewInstrument(voice); }} aria-label={`Preview ${voice.label}`} aria-pressed={preview?.id === voice.id}>
              {preview?.id === voice.id ? preview.playing ? 'Stop preview' : 'Loading…' : 'Preview'}
            </button>
            <button type="button" disabled={disabled} aria-label={`Mute ${voice.label}`} aria-pressed={Boolean(mix.muted)} onClick={(event) => { event.currentTarget.focus(); update(voice.id, { muted: !mix.muted }); }}>Mute</button>
            <button type="button" disabled={disabled} aria-label={`Solo ${voice.label}`} aria-pressed={Boolean(mix.solo)} onClick={(event) => { event.currentTarget.focus(); update(voice.id, { solo: !mix.solo }); }}>Solo</button>
          </div>
        </div>;
      })}
      {!voices.length && <p>No playable voices in this score.</p>}
    </div>
    <footer><span role="status">{error ?? (disabled ? 'Updating sounds…' : (activeStaffId ? 'Instrument saved in ABC · mute/solo are local' : 'Listening settings · score unchanged'))}</span>
      <button type="button" disabled={disabled} onClick={(event) => { event.currentTarget.focus(); stopPreview(); onChange({}); }}>{activeStaffId ? 'Reset listening' : 'Reset voices'}</button></footer>
  </section>;
}
