#!/usr/bin/env python3
"""Produce bounded, fallible harmony evidence from ABC on stdin."""

from __future__ import annotations

import json
import sys
import warnings
from fractions import Fraction
from importlib.metadata import version
from typing import Any

from music21 import chord, converter, key, roman, stream


WARNING = (
    "Fallible deterministic evidence: chordification treats every sounding pitch "
    "literally, so ornaments and suspensions may distort roots, qualities, "
    "inversions, Roman numerals, and boundaries. The passage-wide key estimate "
    "may miss tonicizations or modulations. Verify every candidate against the score."
)


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


def analyze(payload: dict[str, Any]) -> dict[str, Any]:
    abc_source = payload.get("abcSource")
    start_measure = payload.get("startMeasure", 1)
    if not isinstance(abc_source, str) or not abc_source.strip():
        raise ValueError("abcSource must be a non-empty string")
    if not isinstance(start_measure, int) or start_measure < 0:
        raise ValueError("startMeasure must be a non-negative integer")

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        score = converter.parseData(abc_source, format="abc")
        estimated_key = estimate_key(score)
        chordified = score.chordify()

    key_label = f"{estimated_key.tonic.name} {estimated_key.mode}"
    slices: list[dict[str, Any]] = []
    for measure_index, measure in enumerate(measures_in_order(chordified)):
        output_measure = start_measure + measure_index
        for sonority in measure.recurse().getElementsByClass(chord.Chord):
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
                    "measure": output_measure,
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
