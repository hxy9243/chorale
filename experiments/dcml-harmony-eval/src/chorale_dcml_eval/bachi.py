from __future__ import annotations

import csv
import json
import subprocess
import urllib.request
from collections import defaultdict
from fractions import Fraction
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable

from music21 import note, stream

from .corpus import active_events, position_to_qb, qb_to_position
from .util import fraction, fraction_text, mean, read_json, write_json


QUALITY_NAMES = {
    "M": "major",
    "m": "minor",
    "o": "diminished",
    "+": "augmented",
    "D7": "dominant-seventh",
    "M7": "major-seventh",
    "m7": "minor-seventh",
    "o7": "diminished-seventh",
    "/o7": "half-diminished-seventh",
    "N": "unknown",
}
QUALITY_INTERVALS = {
    "M": (0, 4, 7),
    "m": (0, 3, 7),
    "o": (0, 3, 6),
    "+": (0, 4, 8),
    "D7": (0, 4, 7, 10),
    "M7": (0, 4, 7, 11),
    "m7": (0, 3, 7, 10),
    "o7": (0, 3, 6, 9),
    "/o7": (0, 3, 6, 10),
}


def _pitch_class(value: str) -> int | None:
    token = value.strip().replace("-", "b")
    if not token or token in {"N", "None", "PAD"}:
        return None
    letter = token[0].upper()
    if letter not in "ABCDEFG":
        return None
    pc = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}[letter]
    return (pc + token[1:].count("#") - token[1:].count("b")) % 12


def inversion_from_bass(root: str, quality: str, bass: str) -> str:
    root_pc = _pitch_class(root)
    bass_pc = _pitch_class(bass)
    intervals = QUALITY_INTERVALS.get(quality)
    if root_pc is None or bass_pc is None or intervals is None:
        return "unknown"
    try:
        index = intervals.index((bass_pc - root_pc) % 12)
    except ValueError:
        return "unknown"
    return ("root", "first", "second", "third")[index]


def parse_prediction(path: Path, end_qb: Fraction | None = None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        offset, label = line.split(maxsplit=1)
        root, quality, bass = label.rsplit("_", 2)
        rows.append({
            "start_qb": fraction(offset),
            "root": root,
            "quality_code": quality,
            "quality": QUALITY_NAMES.get(quality, quality),
            "bass": bass,
            "inversion": inversion_from_bass(root, quality, bass),
        })
    rows.sort(key=lambda row: row["start_qb"])
    for index, row in enumerate(rows):
        row["end_qb"] = rows[index + 1]["start_qb"] if index + 1 < len(rows) else end_qb
    return [row for row in rows if row["end_qb"] is None or row["end_qb"] > row["start_qb"]]


def case_duration(case: dict[str, Any]) -> Fraction:
    last = case["measures"][-1]
    return fraction(last["offset_qb"]) + fraction(last["duration_qb"])


def export_case_musicxml(case: dict[str, Any], path: Path) -> None:
    score = stream.Score()
    parts: dict[tuple[int, int], stream.Part] = {}
    for event in case["events"]:
        if event.get("grace") or fraction(event["duration_qb"]) <= 0:
            continue
        group = (event["staff"], event["voice"])
        part = parts.setdefault(group, stream.Part(id=f"staff{group[0]}-voice{group[1]}"))
        item = note.Note(event["pitch"])
        item.duration.quarterLength = fraction(event["duration_qb"])
        onset = position_to_qb(case, event["measure"], event["offset_qb"])
        part.insert(onset, item)
    for part in parts.values():
        score.insert(0, part)
    path.parent.mkdir(parents=True, exist_ok=True)
    score.write("musicxml", fp=str(path))


def prediction_contract(case: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    spans = []
    total = case_duration(case)
    for row in rows:
        start = max(Fraction(0), row["start_qb"])
        end = min(total, row["end_qb"] if row["end_qb"] is not None else total)
        if end <= start:
            continue
        sounding = active_events(case, start)
        if not sounding and end > start:
            sounding = active_events(case, start + min(Fraction(1, 100), (end - start) / 2))
        pitches = [event["pitch"] for event in sounding]
        bass = min(sounding, key=lambda event: event["midi"])["pitch"] if sounding else "unknown"
        spans.append({
            "start": qb_to_position(case, start),
            "end": qb_to_position(case, end),
            "local_key": "unknown",
            "roman": "unknown",
            "root": row["root"],
            "quality": row["quality"],
            "inversion": row["inversion"],
            "confidence": 0.5,
            "evidence": [{
                **qb_to_position(case, start),
                "pitches": pitches,
                "bass": bass,
            }],
        })
    return {"case_id": case["case_id"], "spans": spans}


def proposals_for_prompt(prediction: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": "BACHI classical checkpoint",
        "warning": "Fallible chord-boundary/root/quality/bass proposals; no key or Roman numeral is predicted.",
        "spans": [{
            "start": span["start"],
            "end": span["end"],
            "root": span["root"],
            "quality": span["quality"],
            "inversion_from_predicted_bass": span["inversion"],
        } for span in prediction["spans"]],
    }


def run_inference(
    *, python: Path, repository: Path, checkpoint: Path, inputs: Path,
    outputs: Path, num_workers: int = 0,
) -> None:
    subprocess.run([
        str(python), str(repository / "inference.py"),
        "--input", str(inputs), "--output", str(outputs),
        "--checkpoint_dir", str(checkpoint), "--device", "cpu",
        "--num_workers", str(num_workers),
    ], cwd=repository, check=True)


def prepare_six_case_bachi(
    *, staging: Path, prediction_text_dir: Path, output_dir: Path,
) -> list[dict[str, Any]]:
    records = []
    contracts = output_dir / "contracts"
    contracts.mkdir(parents=True, exist_ok=True)
    for case_path in sorted((staging / "cases").glob("*.json")):
        case = read_json(case_path)
        rows = parse_prediction(prediction_text_dir / f"{case['case_id']}.txt", case_duration(case))
        prediction = prediction_contract(case, rows)
        write_json(contracts / f"{case['case_id']}.json", prediction)
        records.append({
            "case_id": case["case_id"], "model": "BACHI-classical_film_kdec",
            "effort": None, "condition": "bachi", "status": "ok",
            "schema_valid": True, "latency_seconds": None, "usage": None,
            "monetary_cost_usd": None, "error": None, "prediction": prediction,
        })
    write_json(output_dir / "model-run-index.json", records)
    return records


def download_validation_sample(selection_path: Path, destination: Path) -> None:
    manifest = read_json(selection_path)
    repo = manifest["source"]["repository"]
    revision = manifest["source"]["revision"]
    base = f"https://huggingface.co/datasets/{repo}/resolve/{revision}/unique_data_collection"
    for item in manifest["sample"]["pieces"]:
        piece_dir = destination / item["piece_id"]
        piece_dir.mkdir(parents=True, exist_ok=True)
        for name in (item["score_file"], "chord_symbol.csv"):
            url = f"{base}/{item['piece_id']}/{name}?download=true"
            target = piece_dir / name
            if not target.exists():
                urllib.request.urlretrieve(url, target)


def _gold_rows(path: Path, end_qb: Fraction) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    parsed = [{**row, "start_qb": fraction(row["offset_qb"])} for row in rows]
    for index, row in enumerate(parsed):
        row["end_qb"] = parsed[index + 1]["start_qb"] if index + 1 < len(parsed) else end_qb
    return parsed


def _active(rows: list[dict[str, Any]], point: Fraction) -> dict[str, Any] | None:
    matches = [row for row in rows if row["start_qb"] <= point < row["end_qb"]]
    return matches[-1] if matches else None


def _boundary_scores(predicted: list[dict[str, Any]], gold: list[dict[str, Any]], tolerance: Fraction) -> dict[str, float]:
    predicted_boundaries = [row["start_qb"] for row in predicted[1:]]
    gold_boundaries = [row["start_qb"] for row in gold[1:]]

    @lru_cache(maxsize=None)
    def align(pred_index: int, gold_index: int) -> tuple[int, Fraction]:
        if pred_index >= len(predicted_boundaries) or gold_index >= len(gold_boundaries):
            return 0, Fraction(0)
        options = [align(pred_index + 1, gold_index), align(pred_index, gold_index + 1)]
        distance = abs(predicted_boundaries[pred_index] - gold_boundaries[gold_index])
        if distance <= tolerance:
            count, error = align(pred_index + 1, gold_index + 1)
            options.append((count + 1, error + distance))
        return max(options, key=lambda result: (result[0], -result[1]))

    matches, _ = align(0, 0)
    pred_count = len(predicted_boundaries)
    gold_count = len(gold_boundaries)
    precision = matches / pred_count if pred_count else float(not gold_count)
    recall = matches / gold_count if gold_count else float(not pred_count)
    return {"precision": precision, "recall": recall, "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0.0}


def score_validation_piece(score_path: Path, gold_path: Path, prediction_path: Path) -> dict[str, Any]:
    from music21 import converter

    score = converter.parse(str(score_path))
    end_qb = Fraction(str(float(score.highestTime)))
    predicted = parse_prediction(prediction_path, end_qb)
    gold = _gold_rows(gold_path, end_qb)
    points = sorted({Fraction(0), end_qb, *[row["start_qb"] for row in predicted + gold], *[row["end_qb"] for row in predicted + gold]})
    totals = defaultdict(Fraction)
    for start, end in zip(points, points[1:]):
        if end <= start:
            continue
        reference = _active(gold, start + (end - start) / 2)
        candidate = _active(predicted, start + (end - start) / 2)
        if reference is None:
            continue
        duration = end - start
        totals["duration"] += duration
        if candidate is None:
            continue
        totals["covered"] += duration
        root = _pitch_class(candidate["root"]) == _pitch_class(reference["root"])
        quality = candidate["quality_code"] == reference["quality"]
        bass = _pitch_class(candidate["bass"]) == _pitch_class(reference["bass"])
        totals["root"] += duration * root
        totals["quality"] += duration * quality
        totals["bass"] += duration * bass
        totals["chord"] += duration * (root and quality and bass)
    denominator = float(totals["duration"])
    metrics = {name: float(totals[name]) / denominator if denominator else 0.0 for name in ("covered", "root", "quality", "bass", "chord")}
    metrics.update({f"boundary_{key}": value for key, value in _boundary_scores(predicted, gold, Fraction(1, 4)).items()})
    return {"duration_qb": denominator, "predicted_spans": len(predicted), "gold_spans": len(gold), "metrics": metrics}


def score_validation_sample(selection_path: Path, data_dir: Path, prediction_dir: Path, output_path: Path) -> dict[str, Any]:
    manifest = read_json(selection_path)
    pieces = []
    for item in manifest["sample"]["pieces"]:
        piece_dir = data_dir / item["piece_id"]
        pieces.append({
            **item,
            **score_validation_piece(piece_dir / item["score_file"], piece_dir / "chord_symbol.csv", prediction_dir / f"{Path(item['score_file']).stem}.txt"),
        })
    metric_names = ("covered", "root", "quality", "bass", "chord", "boundary_precision", "boundary_recall", "boundary_f1")
    total_duration = sum(piece["duration_qb"] for piece in pieces)
    summary = {
        "sample": manifest["sample"],
        "official_split": manifest["official_split"],
        "pieces": pieces,
        "macro": {name: mean(piece["metrics"][name] for piece in pieces) for name in metric_names},
        "duration_weighted": {
            name: sum(piece["metrics"][name] * piece["duration_qb"] for piece in pieces) / total_duration
            for name in metric_names
        },
    }
    write_json(output_path, summary)
    return summary
