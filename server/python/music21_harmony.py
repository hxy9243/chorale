#!/usr/bin/env python3
"""Produce bounded, fallible harmony interpretations from structured chord slices on stdin."""

from __future__ import annotations

import json
import sys
import warnings
from importlib.metadata import version
from typing import Any

from music21 import chord, key, roman

WARNING = (
    "Fallible deterministic evidence: chordification treats every sounding pitch "
    "literally, so ornaments and suspensions may distort roots, qualities, "
    "inversions, Roman numerals, and boundaries. The passage-wide key estimate "
    "may miss tonicizations or modulations. Verify every candidate against the score."
)


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


def parse_key_object(key_str: str) -> key.Key:
    if not key_str:
        return key.Key("C", "major")
    parts = key_str.strip().split()
    if len(parts) >= 2:
        mode = parts[1].lower()
        if mode.startswith("min") or mode == "m":
            mode = "minor"
        elif mode.startswith("maj"):
            mode = "major"
        return key.Key(parts[0], mode)
    tonic = parts[0]
    if tonic.endswith("m") and len(tonic) > 1 and not tonic.endswith("dim"):
        return key.Key(tonic[:-1], "minor")
    if tonic.islower():
        return key.Key(tonic.capitalize(), "minor")
    return key.Key(tonic, "major")


def analyze(payload: dict[str, Any]) -> dict[str, Any]:
    passage_key_str = payload.get("passageKey", "C major")
    try:
        passage_key = parse_key_object(passage_key_str)
    except Exception:
        passage_key = key.Key("C", "major")

    input_slices = payload.get("slices", [])
    results: list[dict[str, Any]] = []

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for item in input_slices:
            slice_id = item.get("sliceId", "")
            pitches = item.get("soundingPitches", [])
            if not pitches:
                continue

            c = chord.Chord(pitches)
            local_key_str = item.get("localKey")
            try:
                local_key = parse_key_object(local_key_str) if local_key_str else passage_key
            except Exception:
                local_key = passage_key

            try:
                root_name = c.root().name
            except Exception:
                root_name = "unknown"

            try:
                figure = roman.romanNumeralFromChord(c, local_key).figure
            except Exception:
                try:
                    figure = roman.romanNumeralFromChord(c, passage_key).figure
                except Exception:
                    figure = "unknown"

            results.append({
                "sliceId": slice_id,
                "candidate": {
                    "localKey": f"{local_key.tonic.name} {local_key.mode}",
                    "romanNumeral": figure,
                    "root": root_name,
                    "quality": quality(c),
                    "inversion": inversion(c),
                    "confidence": 0.35,
                },
            })

    passage_key_label = f"{passage_key.tonic.name} {passage_key.mode}"

    return {
        "engine": {
            "name": "music21",
            "version": version("music21"),
        },
        "estimatedPassageKey": passage_key_label,
        "warning": WARNING,
        "slices": results,
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
