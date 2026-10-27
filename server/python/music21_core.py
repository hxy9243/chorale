"""Located interval facts over Chorale's authoritative, tie-merged events."""
from fractions import Fraction
from hashlib import sha256
import json
import re

import music21


CHECKS = ('parallels', 'crossing', 'overlap', 'spacing', 'ranges', 'melodic')
SATB = (('C4', 'A5'), ('G3', 'D5'), ('C3', 'G4'), ('E2', 'D4'))


def _pitch(text):
    step, accidental, octave = re.fullmatch(r'([A-G])([#b]*)(-?\d+)', text).groups()
    value = music21.pitch.Pitch()
    value.step = step
    value.accidental = accidental.count('#') - accidental.count('b')
    value.octave = int(octave)
    return value


def build_analyzer(events, measures, boundaries):
    # User snippets can mutate their own score/events; evidence uses a private copy.
    captured = json.loads(json.dumps({'events': events, 'measures': measures, 'boundaries': boundaries}))

    def analyze(checks=None, voice_order=None, profile='free', max_findings=100):
        if checks is None:
            checks = list(CHECKS)
        if (not isinstance(checks, (list, tuple)) or not checks
                or any(not isinstance(c, str) or c not in CHECKS for c in checks)
                or len(set(checks)) != len(checks)):
            raise ValueError('checks must be a nonempty unique subset of ' + ', '.join(CHECKS))
        if profile not in ('free', 'chorale'):
            raise ValueError('profile must be free or chorale')
        if type(max_findings) is not int or not 1 <= max_findings <= 500:
            raise ValueError('max_findings must be an integer from 1 to 500')
        requested = [c for c in CHECKS if c in checks]
        rows = []
        for event in captured['events']:
            rows.append({**event, '_start': Fraction(event['offsetQuarterLength']),
                         '_end': Fraction(event['offsetQuarterLength']) + Fraction(event['durationQuarterLength']),
                         '_pitch': _pitch(event['pitch'])})
        ids = list(dict.fromkeys(e['voiceId'] for e in rows))
        if len(ids) > 16:
            raise ValueError('Core line analysis supports at most 16 pitched voices')
        if voice_order is not None and (not isinstance(voice_order, (list, tuple))
                or any(not isinstance(v, str) for v in voice_order)
                or len(set(voice_order)) != len(voice_order) or set(voice_order) != set(ids)):
            raise ValueError('voice_order must list every selected pitched voice exactly once, high to low')
        order = list(voice_order) if voice_order is not None else sorted(ids)
        bars = captured['measures']
        boundary_times = sorted({Fraction(b['offsetQuarterLength']) for b in captured['boundaries']})
        diagnostics = []
        if not rows:
            diagnostics.append({'code': 'NO_PITCHED_EVENTS', 'message': 'No pitched events occur in the selected measures.'})

        def position(at):
            bar = next((m for m in reversed(bars) if Fraction(m['offsetQuarterLength']) <= at), bars[0])
            return {'measure': bar['number'], 'offsetQuarterLength': str(at - Fraction(bar['offsetQuarterLength']))}

        for at in boundary_times:
            diagnostics.append({'code': 'REPEAT_BOUNDARY', 'position': position(at),
                                'message': 'Written-order analysis skips successions across this repeat/ending boundary.'})
        by_voice = {v: sorted((e for e in rows if e['voiceId'] == v), key=lambda e: (e['_start'], e['id'])) for v in order}
        excluded = []
        for voice, notes in by_voice.items():
            if any(a['_end'] > b['_start'] for a, b in zip(notes, notes[1:])):
                excluded.append(voice)
                diagnostics.append({'code': 'POLYPHONIC_VOICE', 'voices': [voice],
                                    'message': 'Overlapping/chordal events do not establish independent melodic lines; this voice is excluded.'})
        supported = [v for v in order if v not in excluded]
        executed = list(requested)
        if voice_order is None:
            skipped = [c for c in ('crossing', 'overlap', 'spacing', 'ranges') if c in executed]
            if skipped:
                diagnostics.append({'code': 'VOICE_ORDER_REQUIRED', 'checks': skipped,
                                    'message': 'Supply explicit high-to-low voice_order; musical roles are never inferred.'})
                executed = [c for c in executed if c not in skipped]
        if profile != 'chorale' or len(order) != 4:
            skipped = [c for c in ('spacing', 'ranges') if c in executed]
            if skipped:
                diagnostics.append({'code': 'SATB_PROFILE_REQUIRED', 'checks': skipped,
                                    'message': 'SATB spacing/ranges require the chorale profile and four explicitly ordered voices.'})
                executed = [c for c in executed if c not in skipped]
        findings = {}
        skipped_transitions = 0

        def blocked(start, end):
            return any(start < b <= end for b in boundary_times)

        def emit(rule, voices, at, involved, end=None, intervals=None, motion=None):
            value = {'rule': rule, 'voices': voices, 'from': position(at),
                     'to': position(at if end is None else end),
                     'pitches': [e['pitch'] for e in involved],
                     'intervals': intervals or [], 'motion': motion,
                     'sourceEventIds': list(dict.fromkeys(s for e in involved for s in e['sourceEventIds']))}
            # Event identity deduplicates sustained vertical facts across unrelated onsets.
            key = (rule, tuple(voices), tuple(e['id'] for e in involved))
            if key not in findings:
                value['id'] = 'vl-' + sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()[:24]
                value['severity'] = 'warning' if profile == 'chorale' else 'info'
                findings[key] = value

        for voice in supported:
            notes = by_voice[voice]
            if 'ranges' in executed:
                low, high = (_pitch(p).midi for p in SATB[order.index(voice)])
                for note in notes:
                    if note['_pitch'].midi < low or note['_pitch'].midi > high:
                        emit('range', [voice], note['_start'], [note])
            if 'melodic' in executed:
                for a, b in zip(notes, notes[1:]):
                    if a['_end'] != b['_start']:
                        continue
                    if blocked(a['_start'], b['_start']):
                        skipped_transitions += 1
                        continue
                    interval = music21.interval.Interval(a['_pitch'], b['_pitch'])
                    if interval.name.startswith(('A', 'd')):
                        emit('melodic-altered-interval', [voice], a['_start'], [a, b], b['_start'], [interval.directedName])
                    if abs(interval.semitones) > 12:
                        emit('melodic-large-leap', [voice], a['_start'], [a, b], b['_start'], [interval.directedName])

        pair_checks = set(executed) & {'parallels', 'crossing', 'overlap', 'spacing'}
        if pair_checks:
            for i, upper in enumerate(supported):
                for lower in supported[i + 1:]:
                    first, second = by_voice[upper], by_voice[lower]
                    times = sorted({e[t] for e in first + second for t in ('_start', '_end')})
                    previous = None
                    # Sweep each pair once, preserving held pitches and explicit rest gaps.
                    cursors = [0, 0]
                    for at in times:
                        active = []
                        for index, notes in enumerate((first, second)):
                            while cursors[index] < len(notes) and notes[cursors[index]]['_end'] <= at:
                                cursors[index] += 1
                            note = notes[cursors[index]] if cursors[index] < len(notes) else None
                            active.append(note if note and note['_start'] <= at < note['_end'] else None)
                        a, b = active
                        if a is None or b is None:
                            previous = None
                            continue
                        vertical = music21.interval.Interval(b['_pitch'], a['_pitch'])
                        if 'crossing' in executed and a['_pitch'].midi < b['_pitch'].midi:
                            emit('crossing', [upper, lower], at, [a, b], intervals=[vertical.directedName])
                        if ('spacing' in executed and order.index(upper) < 2
                                and order.index(lower) == order.index(upper) + 1
                                and a['_pitch'].midi - b['_pitch'].midi > 12):
                            emit('spacing', [upper, lower], at, [a, b], intervals=[vertical.directedName])
                        if previous is not None:
                            then, old_a, old_b = previous
                            if blocked(then, at):
                                skipped_transitions += 1
                            else:
                                old_interval = music21.interval.Interval(old_b['_pitch'], old_a['_pitch'])
                                quartet = music21.voiceLeading.VoiceLeadingQuartet(old_a['_pitch'], a['_pitch'], old_b['_pitch'], b['_pitch'])
                                intervals = [old_interval.directedName, vertical.directedName]
                                if 'parallels' in executed and quartet.similarMotion():
                                    if quartet.parallelFifth():
                                        emit('parallel-fifth', [upper, lower], then, [old_a, old_b, a, b], at, intervals, 'similar')
                                    if (quartet.parallelOctave() and old_interval.semitones != 0 and vertical.semitones != 0):
                                        emit('parallel-octave', [upper, lower], then, [old_a, old_b, a, b], at, intervals, 'similar')
                                if ('overlap' in executed and order.index(lower) == order.index(upper) + 1
                                        and (b['_pitch'].midi > old_a['_pitch'].midi or a['_pitch'].midi < old_b['_pitch'].midi)):
                                    emit('overlap', [upper, lower], then, [old_a, old_b, a, b], at, intervals)
                        previous = (at, a, b)

        values = sorted(findings.values(), key=lambda f: (f['from']['measure'], Fraction(f['from']['offsetQuarterLength']),
                                                        f['to']['measure'], Fraction(f['to']['offsetQuarterLength']), f['rule'], f['voices'], f['id']))
        truncated = len(values) > max_findings
        return {'schemaVersion': 1, 'profile': profile, 'findings': values[:max_findings],
                'diagnostics': diagnostics, 'totalFindings': len(values), 'truncated': truncated,
                'coverage': {'requestedChecks': requested, 'executedChecks': executed,
                             'analyzedVoices': supported, 'excludedVoices': excluded,
                             'skippedTransitions': skipped_transitions,
                             'complete': bool(rows) and not excluded and requested == executed and not boundary_times and not truncated,
                             'limitations': ['Selected written measures only; no playback unfolding or outside-range successions.',
                                             'Interval facts and profile conventions do not establish overall musical correctness.']}}

    return analyze
