from __future__ import annotations

from fractions import Fraction
from typing import Any

from music21 import chord, key, note, pitch, roman, stream

from .corpus import active_events, position_to_qb, qb_to_position
from .util import fraction, fraction_text


def _estimate_key(case: dict[str, Any]) -> key.Key:
    score = stream.Stream()
    for event in case["events"]:
        if event.get("grace") or fraction(event["duration_qb"]) <= 0:
            continue
        item = note.Note(event["pitch"])
        item.quarterLength = float(fraction(event["duration_qb"]))
        score.insert(float(position_to_qb(case, event["measure"], event["offset_qb"])), item)
    try:
        return score.analyze("key")
    except Exception:
        fifths = case["measures"][0]["key_signature_fifths"]
        return key.KeySignature(fifths).asKey("major")


def _quality(item: chord.Chord) -> str:
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


def _inversion(item: chord.Chord) -> str:
    try:
        return {0: "root", 1: "first", 2: "second", 3: "third"}.get(item.inversion(), "unknown")
    except Exception:
        return "unknown"


def analyze(case: dict[str, Any]) -> dict[str, Any]:
    estimated_key = _estimate_key(case)
    end_qb = max(
        fraction(row["offset_qb"]) + fraction(row["duration_qb"])
        for row in case["measures"]
    )
    onsets = {Fraction(0), end_qb}
    onsets.update(position_to_qb(case, event["measure"], event["offset_qb"]) for event in case["events"])
    boundaries = sorted(onsets)
    raw: list[dict[str, Any]] = []
    for start, end in zip(boundaries, boundaries[1:]):
        if end <= start:
            continue
        sounding = active_events(case, start)
        if not sounding:
            continue
        ordered = sorted(sounding, key=lambda event: event["midi"])
        pitches = [event["pitch"] for event in ordered]
        sonority = chord.Chord(pitches)
        try:
            root = sonority.root().name
        except Exception:
            root = "unknown"
        try:
            label = roman.romanNumeralFromChord(sonority, estimated_key).figure
        except Exception:
            label = "unknown"
        raw.append({
            "start_qb": start,
            "end_qb": end,
            "local_key": f"{estimated_key.tonic.name} {estimated_key.mode}",
            "roman": label,
            "root": root,
            "quality": _quality(sonority),
            "inversion": _inversion(sonority),
            "confidence": 0.35,
            "evidence": [{
                **qb_to_position(case, start),
                "pitches": pitches,
                "bass": ordered[0]["pitch"],
            }],
        })
    merged: list[dict[str, Any]] = []
    identity = ("local_key", "roman", "root", "quality", "inversion")
    for span in raw:
        if merged and all(merged[-1][field] == span[field] for field in identity):
            merged[-1]["end_qb"] = span["end_qb"]
        else:
            merged.append(span)
    output_spans = []
    for span in merged:
        output_spans.append({
            "start": qb_to_position(case, span.pop("start_qb")),
            "end": qb_to_position(case, span.pop("end_qb")),
            **span,
        })
    return {
        "case_id": case["case_id"],
        "estimated_key": f"{estimated_key.tonic.name} {estimated_key.mode}",
        "spans": output_spans,
    }


def evidence_for_prompt(case: dict[str, Any], prediction: dict[str, Any]) -> dict[str, Any]:
    slices = []
    for span in prediction["spans"]:
        evidence = span["evidence"][0]
        slices.append({
            "position": {"measure": evidence["measure"], "offset_qb": evidence["offset_qb"]},
            "sounding_pitches": evidence["pitches"],
            "literal_bass": evidence["bass"],
            "candidate": {
                "local_key": span["local_key"],
                "roman": span["roman"],
                "root": span["root"],
                "quality": span["quality"],
                "inversion": span["inversion"],
            },
        })
    return {
        "warning": "Fallible deterministic evidence; ornaments may distort chordification and the passage-wide key estimate may miss tonicizations.",
        "estimated_passage_key": prediction["estimated_key"],
        "slices": slices,
    }
