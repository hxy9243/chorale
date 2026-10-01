#!/usr/bin/env python3
"""Produce bounded, fallible harmony evidence from ABC on stdin."""

from __future__ import annotations

import json
import re
import sys
import warnings
from fractions import Fraction
from importlib.metadata import version
from typing import Any

from music21 import abcFormat, bar, chord, key, roman, stream


WARNING = (
    "Fallible deterministic evidence: chordification treats every sounding pitch "
    "literally, so ornaments and suspensions may distort roots, qualities, "
    "inversions, Roman numerals, and boundaries. The passage-wide key estimate "
    "may miss tonicizations or modulations. Verify every candidate against the score."
)

_ORIGINAL_PARSE_ABC_NOTE = abcFormat.translate.parseABCNote


def _patched_parse_abc_note(token: abcFormat.ABCNote, dst: stream.Measure | stream.Part) -> None:
    _ORIGINAL_PARSE_ABC_NOTE(token, dst)
    active_ks = getattr(token, "activeKeySignature", None)
    if active_ks is not None and isinstance(dst, stream.Measure):
        if dst.keySignature is None or dst.keySignature.sharps != active_ks.sharps:
            dst.keySignature = active_ks


abcFormat.translate.parseABCNote = _patched_parse_abc_note


def rational_text(value: Any) -> str:
    fraction = Fraction(value).limit_denominator(4096)
    return str(fraction.numerator) if fraction.denominator == 1 else f"{fraction.numerator}/{fraction.denominator}"


def quality(item: chord.Chord) -> str:
    common = item.commonName.lower()
    seventh_names = {
        "dominant seventh chord": "dominant-seventh",
        "major seventh chord": "major-seventh",
        "minor seventh chord": "minor-seventh",
        "half-diminished seventh chord": "half-diminished-seventh",
        "diminished seventh chord": "diminished-seventh",
    }
    if common in seventh_names:
        return seventh_names[common]
    if item.isMajorTriad():
        return "major"
    if item.isMinorTriad():
        return "minor"
    if item.isDiminishedTriad():
        return "diminished"
    if item.isAugmentedTriad():
        return "augmented"
    return common or "unknown"


def inversion(item: chord.Chord) -> str:
    try:
        return {0: "root", 1: "first", 2: "second", 3: "third"}.get(item.inversion(), "unknown")
    except Exception:
        return "unknown"


def estimate_key(score: stream.Stream) -> key.Key:
    try:
        return score.analyze("key")
    except Exception:
        signature = next(iter(score.recurse().getElementsByClass(key.KeySignature)), None)
        if signature is not None:
            return signature.asKey("major")
        return key.Key("C")


def measures_in_order(chordified: stream.Stream) -> list[stream.Measure]:
    measures: list[stream.Measure] = []
    seen: set[int] = set()
    for measure in chordified.recurse().getElementsByClass(stream.Measure):
        identity = id(measure)
        if identity not in seen:
            seen.add(identity)
            measures.append(measure)
    return measures


def normalize_abc_voices(abc_source: str) -> str:
    voice_map: dict[str, str] = {}

    def get_num_id(vid: str) -> str:
        if vid not in voice_map:
            voice_map[vid] = str(len(voice_map) + 1)
        return voice_map[vid]

    lines = abc_source.splitlines()
    output_lines: list[str] = []
    for raw_line in lines:
        line = raw_line
        if "%" in line:
            line = line[:line.find("%")]
        if not line.strip():
            continue

        # Expand inline bracketed directives [K:...], [M:...], [L:...], [clef=...]
        expanded = re.sub(r"\[([KML]:[^\]]+)\]", r"\n\1\n", line)
        expanded = re.sub(r"\[clef=([^\]]+)\]", r"\nK:clef=\1\n", expanded)

        for subline in expanded.splitlines():
            sline = subline.strip()
            if not sline:
                continue

            match_bracket = re.match(r"^\s*\[V:\s*([^\s\]]+)(.*?)\](.*)$", sline)
            if match_bracket:
                vid = match_bracket.group(1).strip()
                props = match_bracket.group(2).strip()
                rest_notation = match_bracket.group(3).strip()
                num_id = get_num_id(vid)
                name_attr = ""
                if not re.search(r"\b(name|nm)=", props) and not vid.isdigit():
                    name_attr = f' name="{vid}"'
                prop_str = f"{name_attr} {props}".strip()
                header_line = f"V:{num_id} {prop_str}".strip()
                output_lines.append(header_line)
                if rest_notation:
                    output_lines.append(rest_notation)
                continue

            match_plain = re.match(r"^\s*V:\s*([^\s]+)(.*)$", sline)
            if match_plain:
                vid = match_plain.group(1).strip()
                props = match_plain.group(2)
                num_id = get_num_id(vid)
                name_attr = ""
                if not re.search(r"\b(name|nm)=", props) and not vid.isdigit():
                    name_attr = f' name="{vid}"'
                output_lines.append(f"V:{num_id}{name_attr}{props}")
                continue

            output_lines.append(sline)

    return "\n".join(output_lines)


def parse_abc_score(normalized_abc: str) -> stream.Score:
    ah = abcFormat.ABCHandler()
    ah.parseHeaderForVersionInformation(normalized_abc[:100])
    ah.tokens = []
    ah.tokenize(normalized_abc)
    for t in ah.tokens:
        t.preParse()

    voice_colls = ah.splitByVoice()
    if len(voice_colls) > 1:
        header_ah = voice_colls[0]
        part_handlers = []
        for v in voice_colls[1:]:
            p_ah = header_ah + v
            p_ah.tokenProcess()
            part_handlers.append(p_ah)
    else:
        ah.tokenProcess()
        part_handlers = [ah]

    score = stream.Score()
    for ph in part_handlers:
        p = abcFormat.translate.abcToStreamPart(ph)
        score.coreInsert(0, p)
    score.coreElementsChanged()
    return score


def analyze(payload: dict[str, Any]) -> dict[str, Any]:
    abc_source = payload.get("abcSource")
    start_measure = payload.get("startMeasure", 1)
    if not isinstance(abc_source, str) or not abc_source.strip():
        raise ValueError("abcSource must be a non-empty string")
    if not isinstance(start_measure, int) or start_measure < 0:
        raise ValueError("startMeasure must be a non-negative integer")

    normalized_abc = normalize_abc_voices(abc_source)

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        score = parse_abc_score(normalized_abc)
        estimated_key = estimate_key(score)
        chordified = score.chordify()

    measures = measures_in_order(chordified)
    if not measures:
        try:
            chordified_with_measures = chordified.makeMeasures()
            measures = measures_in_order(chordified_with_measures)
        except Exception:
            measures = []

    key_label = f"{estimated_key.tonic.name} {estimated_key.mode}"
    slices: list[dict[str, Any]] = []

    if measures:
        current_measure = start_measure
        prev_bar_incomplete = False
        prev_bar_repeat = False
        prev_bar_duration = Fraction(0)
        active_local_key = estimated_key

        for measure_index, measure in enumerate(measures):
            if measure.keySignature is not None:
                ks = measure.keySignature
                active_local_key = ks.asKey("major") if hasattr(ks, "asKey") else ks

            meter_ql = Fraction(measure.barDuration.quarterLength)
            m_ql = Fraction(measure.quarterLength)

            is_continuation = (
                prev_bar_incomplete
                and prev_bar_repeat
                and m_ql < meter_ql
                and (prev_bar_duration + m_ql == meter_ql)
            )

            if is_continuation:
                output_measure = current_measure
                offset_base = prev_bar_duration
                prev_bar_incomplete = False
                prev_bar_repeat = False
                prev_bar_duration = Fraction(0)
            else:
                if measure_index > 0:
                    current_measure += 1
                output_measure = current_measure
                offset_base = Fraction(0)

                has_repeat = any(
                    isinstance(b, bar.Repeat) and b.direction == "end"
                    for b in measure.recurse().getElementsByClass(bar.Repeat)
                )
                if measure.rightBarline and "repeat" in str(measure.rightBarline).lower():
                    has_repeat = True

                if m_ql < meter_ql and has_repeat:
                    prev_bar_incomplete = True
                    prev_bar_repeat = True
                    prev_bar_duration = m_ql
                else:
                    prev_bar_incomplete = False
                    prev_bar_repeat = False
                    prev_bar_duration = Fraction(0)

            measure_local_label = (
                f"{active_local_key.tonic.name} {active_local_key.mode}"
                if hasattr(active_local_key, "tonic") and hasattr(active_local_key, "mode")
                else key_label
            )

            for sonority in measure.recurse().getElementsByClass(chord.Chord):
                ordered = sorted(sonority.pitches, key=lambda item: item.ps)
                if not ordered:
                    continue
                try:
                    root = sonority.root().name
                except Exception:
                    root = "unknown"
                try:
                    figure = roman.romanNumeralFromChord(sonority, active_local_key).figure
                except Exception:
                    try:
                        figure = roman.romanNumeralFromChord(sonority, estimated_key).figure
                    except Exception:
                        figure = "unknown"
                slices.append({
                    "position": {
                        "measure": output_measure,
                        "offsetQuarterLength": rational_text(offset_base + Fraction(sonority.offset)),
                    },
                    "durationQuarterLength": rational_text(sonority.quarterLength),
                    "soundingPitches": [item.nameWithOctave for item in ordered],
                    "literalBass": ordered[0].nameWithOctave,
                    "candidate": {
                        "localKey": measure_local_label,
                        "romanNumeral": figure,
                        "root": root,
                        "quality": quality(sonority),
                        "inversion": inversion(sonority),
                        "confidence": 0.35,
                    },
                })
    else:
        for sonority in chordified.recurse().getElementsByClass(chord.Chord):
            ordered = sorted(sonority.pitches, key=lambda item: item.ps)
            if not ordered:
                continue
            try:
                root = sonority.root().name
            except Exception:
                root = "unknown"
            try:
                figure = roman.romanNumeralFromChord(sonority, estimated_key).figure
            except Exception:
                figure = "unknown"
            slices.append({
                "position": {
                    "measure": start_measure,
                    "offsetQuarterLength": rational_text(sonority.offset),
                },
                "durationQuarterLength": rational_text(sonority.quarterLength),
                "soundingPitches": [item.nameWithOctave for item in ordered],
                "literalBass": ordered[0].nameWithOctave,
                "candidate": {
                    "localKey": key_label,
                    "romanNumeral": figure,
                    "root": root,
                    "quality": quality(sonority),
                    "inversion": inversion(sonority),
                    "confidence": 0.35,
                },
            })

    return {
        "engine": {
            "name": "music21",
            "version": version("music21"),
        },
        "estimatedPassageKey": key_label,
        "warning": WARNING,
        "slices": slices,
    }


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        json.dump(analyze(payload), sys.stdout, separators=(",", ":"))
        sys.stdout.write("\n")
        return 0
    except Exception as error:
        print(f"music21 analysis failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
