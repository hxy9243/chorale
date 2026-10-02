#!/usr/bin/env python3
"""Produce bounded, fallible harmony interpretations from structured chord slices on stdin."""

from __future__ import annotations

import json
import re
import sys
import warnings
from importlib.metadata import version
from typing import Any

from music21 import chord, key, pitch, roman

WARNING = (
    "Fallible deterministic evidence: chordification treats every sounding pitch "
    "literally, so ornaments and suspensions may distort roots, qualities, "
    "inversions, Roman numerals, and boundaries. The passage key is written context, "
    "not a statistical estimate, and may miss tonicizations or modulations. "
    "Ambiguous local context has no Roman-numeral interpretation. "
    "Verify every candidate against the score."
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


SCHEMA_VERSION = 1
MODES = {"major", "minor", "ionian", "dorian", "phrygian", "lydian", "mixolydian", "aeolian", "locrian"}


def parse_key_object(key_str: str | None) -> key.Key | None:
    """Use only explicit written context; unknown or polytonal context stays unknown."""
    if key_str is None:
        return None
    parts = key_str.split()
    if len(parts) != 2 or parts[1] not in MODES or not re.fullmatch(r"[A-G](?:#{1,2}|b{1,2})?", parts[0]):
        return None
    try:
        return key.Key(parts[0].replace("b", "-"), parts[1])
    except Exception:
        return None


def key_label(item: key.Key | None) -> str | None:
    return f"{item.tonic.name.replace('-', 'b')} {item.mode}" if item is not None else None


def validate_payload(payload: Any) -> None:
    if not isinstance(payload, dict) or set(payload) != {"schemaVersion", "passageKey", "slices"}:
        raise ValueError("Expected a versioned structured slice payload.")
    if type(payload["schemaVersion"]) is not int or payload["schemaVersion"] != SCHEMA_VERSION:
        raise ValueError("Unsupported harmony schema version.")
    if payload["passageKey"] is not None and not isinstance(payload["passageKey"], str):
        raise ValueError("passageKey must be a written key or null.")
    if not isinstance(payload["slices"], list):
        raise ValueError("slices must be an array.")
    seen: set[str] = set()
    for item in payload["slices"]:
        if not isinstance(item, dict) or set(item) != {
            "sliceId", "position", "durationQuarterLength", "soundingPitches", "literalBass", "localKey"
        }:
            raise ValueError("Invalid structured slice fields.")
        slice_id = item["sliceId"]
        if not isinstance(slice_id, str) or not slice_id or slice_id in seen:
            raise ValueError("Missing or duplicate slice ID.")
        seen.add(slice_id)
        position = item["position"]
        if not isinstance(position, dict) or set(position) != {"measure", "offsetQuarterLength"}:
            raise ValueError("Invalid written position.")
        if type(position["measure"]) is not int or position["measure"] < 0:
            raise ValueError("Invalid written measure.")
        for value, positive in [(position["offsetQuarterLength"], False), (item["durationQuarterLength"], True)]:
            if not isinstance(value, str) or not re.fullmatch(r"(?:0|[1-9]\d*)(?:/[1-9]\d*)?", value):
                raise ValueError("Invalid exact quarter length.")
            if positive and value.startswith("0"):
                raise ValueError("Slice duration must be positive.")
        pitches = item["soundingPitches"]
        if not isinstance(pitches, list) or not pitches or any(
            not isinstance(pitch, str) or not re.fullmatch(r"[A-G](?:#{1,2}|b{1,2})?-?\d+", pitch)
            for pitch in pitches
        ):
            raise ValueError("Invalid sounding pitches.")
        if item["literalBass"] not in pitches:
            raise ValueError("Literal bass must be a sounding pitch.")
        if item["localKey"] is not None and not isinstance(item["localKey"], str):
            raise ValueError("localKey must be a written key or null.")


def analyze(payload: dict[str, Any]) -> dict[str, Any]:
    validate_payload(payload)
    passage_key = parse_key_object(payload["passageKey"])
    results: list[dict[str, Any]] = []

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for item in payload["slices"]:
            # A music21 string like C-1 means C-flat in octave 1, not C in
            # octave -1. Construct Pitch fields explicitly from Node's spelling.
            sounding = []
            for name in item["soundingPitches"]:
                match = re.fullmatch(r"([A-G])([#b]*)(-?\d+)", name)
                resolved = pitch.Pitch()
                resolved.step = match.group(1)
                resolved.accidental = pitch.Accidental(match.group(2).count("#") - match.group(2).count("b"))
                resolved.octave = int(match.group(3))
                sounding.append(resolved)
            c = chord.Chord(sounding)
            local_key = parse_key_object(item["localKey"])
            try:
                root_name = c.root().name.replace("-", "b")
            except Exception:
                root_name = "unknown"

            figure = "unknown"
            if local_key is not None:
                try:
                    figure = roman.romanNumeralFromChord(c, local_key).figure
                except Exception:
                    pass

            results.append({
                "sliceId": item["sliceId"],
                "candidate": {
                    "localKey": key_label(local_key) or "unknown",
                    "romanNumeral": figure,
                    "root": root_name,
                    "quality": quality(c),
                    "inversion": inversion(c),
                    "confidence": 0.35,
                },
            })

    return {
        "schemaVersion": SCHEMA_VERSION,
        "engine": {"name": "music21", "version": version("music21")},
        # Retained for API compatibility; keySource discloses that this is not estimation.
        "estimatedPassageKey": key_label(passage_key),
        "keySource": "written" if passage_key is not None else "ambiguous",
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
