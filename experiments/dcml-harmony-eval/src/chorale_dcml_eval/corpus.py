from __future__ import annotations

import json
import re
from fractions import Fraction
from pathlib import Path
from typing import Any

from music21 import key as m21key
from music21 import pitch, roman

from .util import fraction, fraction_text, load_tsv, pitch_token, read_json, write_json


ALLOWED_EVENT_KEYS = {
    "measure",
    "offset_qb",
    "duration_qb",
    "staff",
    "voice",
    "pitch",
    "midi",
    "tie",
    "grace",
}
FORBIDDEN_SERIALIZED_PATTERNS = (
    r"harmon(?:y|ies)",
    r"cadence",
    r"phraseend",
    r"annotator",
    r"reviewer",
    r"globalkey",
    r"localkey",
    r"figbass",
    r"mozart",
    r"K(?:279|280|281|282|283|284|309|310|311|330|331|332|333|457|533|545|570|576)",
    r"DCML",
)


def verify_corpus(corpus: Path, expected_commit: str) -> None:
    import subprocess

    actual = subprocess.run(
        ["git", "-C", str(corpus), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    if actual != expected_commit:
        raise ValueError(f"Corpus revision mismatch: expected {expected_commit}, got {actual}")


def _measure_rows(corpus: Path, movement: str) -> list[dict[str, str]]:
    return load_tsv(corpus / "measures" / f"{movement}.measures.tsv")


def _measure_map(
    rows: list[dict[str, str]],
    note_rows: list[dict[str, str]],
    start_mc: int,
    end_mc: int,
) -> tuple[list[dict[str, Any]], Fraction, Fraction, dict[int, Fraction]]:
    selected = [row for row in rows if start_mc <= int(row["mc"]) <= end_mc]
    if len(selected) != end_mc - start_mc + 1:
        raise ValueError(f"Missing measures in requested range {start_mc}-{end_mc}")
    all_endings_starts: dict[int, Fraction] = {}
    for note in note_rows:
        if not note.get("quarterbeats_all_endings"):
            continue
        mc = int(note["mc"])
        candidate = fraction(note["quarterbeats_all_endings"]) - 4 * fraction(note["mc_onset"])
        previous = all_endings_starts.get(mc)
        if previous is not None and previous != candidate:
            raise ValueError(f"Inconsistent all-endings start for mc {mc}: {previous} != {candidate}")
        all_endings_starts[mc] = candidate
    passage_start = all_endings_starts[start_mc]
    next_start = all_endings_starts.get(end_mc + 1)
    passage_end = next_start if next_start is not None else all_endings_starts[end_mc] + fraction(selected[-1]["duration_qb"])
    measures = [
        {
            "measure": index + 1,
            "offset_qb": fraction_text(all_endings_starts[int(row["mc"])] - passage_start),
            "duration_qb": fraction_text(
                all_endings_starts.get(int(row["mc"]) + 1, all_endings_starts[int(row["mc"])] + fraction(row["duration_qb"]))
                - all_endings_starts[int(row["mc"])]
            ),
            "time_signature": row["timesig"],
            "key_signature_fifths": int(row["keysig"]),
        }
        for index, row in enumerate(selected)
    ]
    return measures, passage_start, passage_end, all_endings_starts


def prepare_case(corpus: Path, selection: dict[str, Any]) -> dict[str, Any]:
    movement = selection["movement"]
    notes = load_tsv(corpus / "notes" / f"{movement}.notes.tsv")
    measures, passage_start, passage_end, all_endings_starts = _measure_map(
        _measure_rows(corpus, movement), notes, selection["start_mc"], selection["end_mc"]
    )
    source_measures = {
        int(row["mc"]): row for row in _measure_rows(corpus, movement)
        if selection["start_mc"] <= int(row["mc"]) <= selection["end_mc"]
    }
    events: list[dict[str, Any]] = []
    for note in notes:
        if not note.get("quarterbeats_all_endings"):
            continue
        onset = fraction(note["quarterbeats_all_endings"])
        duration = 4 * fraction(note["duration"])
        end = onset + duration
        is_grace = duration == 0 or bool(note.get("gracenote", "").strip())
        if (not is_grace and end <= passage_start) or onset >= passage_end or (is_grace and onset < passage_start):
            continue
        clipped_start = max(onset, passage_start)
        clipped_end = min(end, passage_end)
        mc = int(note["mc"])
        if onset < passage_start:
            mc = selection["start_mc"]
        measure_start = all_endings_starts[mc]
        event = {
            "measure": mc - selection["start_mc"] + 1,
            "offset_qb": fraction_text(clipped_start - measure_start),
            "duration_qb": fraction_text(clipped_end - clipped_start),
            "staff": int(note["staff"]),
            "voice": int(note["voice"]),
            "pitch": note["name"],
            "midi": int(note["midi"]),
            "tie": "continue" if onset < passage_start else ({"1": "start", "0": "continue", "-1": "stop"}.get(note["tied"], "none")),
            "grace": is_grace,
        }
        if set(event) != ALLOWED_EVENT_KEYS:
            raise AssertionError("Sanitized event allowlist changed")
        events.append(event)
    events.sort(key=lambda event: (
        position_to_qb({"measures": measures}, event["measure"], event["offset_qb"]),
        event["staff"], event["voice"], event["midi"],
    ))
    case = {
        "schema_version": 1,
        "case_id": selection["case_id"],
        "position_unit": "quarter-beats; offsets are zero-based within the displayed measure",
        "measures": measures,
        "events": events,
    }
    validate_sanitized_case(case)
    return case


def validate_sanitized_case(case: dict[str, Any]) -> None:
    if set(case) != {"schema_version", "case_id", "position_unit", "measures", "events"}:
        raise ValueError("Sanitized case has non-allowlisted top-level fields")
    for event in case["events"]:
        if set(event) != ALLOWED_EVENT_KEYS:
            raise ValueError("Sanitized event has non-allowlisted fields")
    serialized = json.dumps(case, sort_keys=True)
    for pattern in FORBIDDEN_SERIALIZED_PATTERNS:
        if re.search(pattern, serialized, flags=re.IGNORECASE):
            raise ValueError(f"Sanitation failed: forbidden pattern {pattern!r}")


def position_to_qb(case: dict[str, Any], measure: int, offset_qb: str | Fraction) -> Fraction:
    match = next((row for row in case["measures"] if row["measure"] == int(measure)), None)
    if match is None:
        if int(measure) == len(case["measures"]) + 1 and fraction(offset_qb) == 0:
            last = case["measures"][-1]
            return fraction(last["offset_qb"]) + fraction(last["duration_qb"])
        raise ValueError(f"Unknown measure {measure}")
    return fraction(match["offset_qb"]) + fraction(offset_qb)


def qb_to_position(case: dict[str, Any], qb: Fraction) -> dict[str, Any]:
    for measure in reversed(case["measures"]):
        start = fraction(measure["offset_qb"])
        if qb >= start:
            return {"measure": measure["measure"], "offset_qb": fraction_text(qb - start)}
    return {"measure": 1, "offset_qb": "0"}


def active_events(case: dict[str, Any], qb: Fraction) -> list[dict[str, Any]]:
    active = []
    for event in case["events"]:
        start = position_to_qb(case, event["measure"], event["offset_qb"])
        if start <= qb < start + fraction(event["duration_qb"]):
            active.append(event)
    return active


QUALITY_MAP = {
    "M": "major",
    "m": "minor",
    "d": "diminished",
    "a": "augmented",
    "Mm7": "dominant-seventh",
    "M7": "major-seventh",
    "m7": "minor-seventh",
    "d7": "diminished-seventh",
    "hd7": "half-diminished-seventh",
}


def _global_key(value: str) -> m21key.Key:
    value = value.strip()
    tonic = value[0].upper() + value[1:]
    mode = "major" if value[0].isupper() else "minor"
    return m21key.Key(tonic, mode)


def _local_key_name(global_key: str, local_key: str) -> str:
    base = _global_key(global_key)
    try:
        rn = roman.RomanNumeral(local_key, base)
        mode = "major" if re.search(r"[IVX]", local_key.replace("Ger", "")) else "minor"
        return f"{rn.root().name} {mode}"
    except Exception:
        return "unknown"


def _inversion(figbass: str) -> str:
    token = figbass.strip()
    if token in {"", "7"}:
        return "root"
    if token in {"6", "65"}:
        return "first"
    if token in {"64", "43"}:
        return "second"
    if token in {"2", "42"}:
        return "third"
    return "unknown"


def _note_tpc(name: str) -> int:
    match = re.match(r"^([A-Ga-g])([#b-]*)(?:-?[0-9]+)?$", name.strip())
    if not match:
        raise ValueError(f"Unsupported pitch spelling {name!r}")
    base = {"C": 0, "D": 2, "E": 4, "F": -1, "G": 1, "A": 3, "B": 5}[match.group(1).upper()]
    accidental = match.group(2).replace("-", "b")
    return base + 7 * (accidental.count("#") - accidental.count("b"))


def _local_tonic_tpc(global_key: str, local_key: str) -> int | None:
    match = re.match(r"^([#b]*)([ivIV]+)$", local_key.strip())
    if not match:
        return None
    accidental, numeral = match.groups()
    global_tpc = _note_tpc(global_key[0].upper() + global_key[1:])
    major_offsets = {"I": 0, "II": 2, "III": 4, "IV": -1, "V": 1, "VI": 3, "VII": 5}
    minor_offsets = {"I": 0, "II": 2, "III": -3, "IV": -1, "V": 1, "VI": -4, "VII": -2}
    offsets = major_offsets if global_key[0].isupper() else minor_offsets
    return global_tpc + offsets[numeral.upper()] + 7 * (accidental.count("#") - accidental.count("b"))


def load_gold(corpus: Path, selection: dict[str, Any], case: dict[str, Any]) -> list[dict[str, Any]]:
    movement = selection["movement"]
    notes = load_tsv(corpus / "notes" / f"{movement}.notes.tsv")
    _, passage_start, passage_end, _ = _measure_map(
        _measure_rows(corpus, movement), notes, selection["start_mc"], selection["end_mc"]
    )
    labels = [
        row for row in load_tsv(corpus / "harmonies" / f"{movement}.harmonies.tsv")
        if row.get("chord", "").strip() and row.get("quarterbeats_all_endings", "").strip()
    ]
    label_starts = [fraction(row["quarterbeats_all_endings"]) for row in labels]
    spans = []
    for index, row in enumerate(labels):
        start = label_starts[index]
        end = label_starts[index + 1] if index + 1 < len(labels) else passage_end
        if end <= passage_start or start >= passage_end:
            continue
        clipped_start = max(start, passage_start) - passage_start
        clipped_end = min(end, passage_end) - passage_start
        local_tonic_tpc = _local_tonic_tpc(row["globalkey"], row["localkey"])
        try:
            root_tpc = local_tonic_tpc + int(row["root"]) if local_tonic_tpc is not None else None
        except (ValueError, TypeError):
            root_tpc = None
        spans.append({
            "start_qb": fraction_text(clipped_start),
            "end_qb": fraction_text(clipped_end),
            "start": qb_to_position(case, clipped_start),
            "end": qb_to_position(case, clipped_end),
            "local_key": _local_key_name(row["globalkey"], row["localkey"]),
            "roman": row["chord"].strip(),
            "root_tpc": root_tpc,
            "quality": QUALITY_MAP.get(row["chord_type"].strip(), row["chord_type"].strip() or "unknown"),
            "inversion": _inversion(row["figbass"]),
            "source_position": {"mc": int(row["mc"]), "mn": row["mn"], "mc_onset": row["mc_onset"]},
        })
    return spans


def prepare_all(corpus: Path, selection_path: Path, staging: Path, private_dir: Path) -> dict[str, Any]:
    manifest = read_json(selection_path)
    verify_corpus(corpus, manifest["corpus"]["commit"])
    cases_dir = staging / "cases"
    cases_dir.mkdir(parents=True, exist_ok=True)
    private_dir.mkdir(parents=True, exist_ok=True)
    coverage = []
    private_index: dict[str, Any] = {}
    for selection in manifest["held_out"]:
        case = prepare_case(corpus, selection)
        write_json(cases_dir / f"{selection['case_id']}.json", case)
        gold = load_gold(corpus, selection, case)
        private_index[selection["case_id"]] = {"selection": selection, "gold": gold}
        duration = sum((fraction(row["duration_qb"]) for row in case["measures"]), Fraction(0))
        coverage.append({
            "case_id": selection["case_id"],
            "movement": selection["movement"],
            "measures": len(case["measures"]),
            "duration_qb": fraction_text(duration),
            "note_events": len(case["events"]),
            "gold_spans": len(gold),
            "rationale": selection["rationale"],
        })
    write_json(private_dir / "gold.json", private_index)
    prepared = {"corpus": manifest["corpus"], "coverage": coverage}
    write_json(staging / "prepared.json", prepared)
    return prepared
