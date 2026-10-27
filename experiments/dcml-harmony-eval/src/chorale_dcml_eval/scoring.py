from __future__ import annotations

import math
from collections import defaultdict
from functools import lru_cache
from fractions import Fraction
from pathlib import Path
from typing import Any

from music21 import key as m21key
from music21 import pitch

from .corpus import active_events, position_to_qb, qb_to_position
from .util import fraction, mean, pitch_token, read_json, roman_token, write_json


QUALITY_ALIASES = {
    "major triad": "major", "minor triad": "minor", "dominant 7th": "dominant-seventh",
    "dominant seventh": "dominant-seventh", "major seventh": "major-seventh",
    "minor seventh": "minor-seventh", "half diminished seventh": "half-diminished-seventh",
    "half-diminished seventh": "half-diminished-seventh", "diminished seventh": "diminished-seventh",
}


def _pitch_tpc(value: str) -> int | None:
    text = value.strip().replace("♭", "b").replace("-", "b").replace("♯", "#")
    if not text:
        return None
    letter = text[0].upper()
    if letter not in "ABCDEFG":
        return None
    base = {"C": 0, "D": 2, "E": 4, "F": -1, "G": 1, "A": 3, "B": 5}[letter]
    accidental = "".join(char for char in text[1:] if char in "#b")
    return base + 7 * (accidental.count("#") - accidental.count("b"))


def _key_token(value: str) -> str:
    text = value.strip().replace("♭", "-").replace("b", "-").replace("♯", "#")
    words = text.split()
    if not words:
        return "unknown"
    tonic = words[0]
    mode = words[1].lower() if len(words) > 1 else "major"
    tonic_tpc = _pitch_tpc(tonic)
    return f"{tonic_tpc}:{mode}" if tonic_tpc is not None else text.lower()


def _root_tpc(value: str) -> int | None:
    if value.strip().lower() in {"", "unknown"}:
        return None
    return _pitch_tpc(value)


def _quality(value: str) -> str:
    token = value.strip().lower().replace("_", "-")
    return QUALITY_ALIASES.get(token, token)


def _prediction_spans(case: dict[str, Any], prediction: dict[str, Any]) -> list[dict[str, Any]]:
    spans = []
    for span in prediction.get("spans", []):
        try:
            start = position_to_qb(case, span["start"]["measure"], span["start"]["offset_qb"])
            end = position_to_qb(case, span["end"]["measure"], span["end"]["offset_qb"])
        except (KeyError, TypeError, ValueError, ZeroDivisionError):
            continue
        if end <= start:
            continue
        spans.append({**span, "start_qb": start, "end_qb": end})
    spans.sort(key=lambda item: (item["start_qb"], item["end_qb"]))
    return spans


def _active_span(spans: list[dict[str, Any]], qb: Fraction) -> dict[str, Any] | None:
    matches = [span for span in spans if span["start_qb"] <= qb < span["end_qb"]]
    return matches[-1] if matches else None


def _boundary_metrics(predicted: list[dict[str, Any]], gold: list[dict[str, Any]], tolerance: Fraction) -> dict[str, float]:
    pred_boundaries = [span["start_qb"] for span in predicted[1:]]
    gold_boundaries = [fraction(span["start_qb"]) for span in gold[1:]]
    @lru_cache(maxsize=None)
    def align(pred_index: int, gold_index: int) -> tuple[int, Fraction]:
        if pred_index >= len(pred_boundaries) or gold_index >= len(gold_boundaries):
            return 0, Fraction(0)
        options = [align(pred_index + 1, gold_index), align(pred_index, gold_index + 1)]
        distance = abs(pred_boundaries[pred_index] - gold_boundaries[gold_index])
        if distance <= tolerance:
            count, error = align(pred_index + 1, gold_index + 1)
            options.append((count + 1, error + distance))
        return max(options, key=lambda result: (result[0], -result[1]))

    matches, _ = align(0, 0)
    precision = matches / len(pred_boundaries) if pred_boundaries else (1.0 if not gold_boundaries else 0.0)
    recall = matches / len(gold_boundaries) if gold_boundaries else (1.0 if not pred_boundaries else 0.0)
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"boundary_precision": precision, "boundary_recall": recall, "boundary_f1": f1}


def _unsupported_evidence(case: dict[str, Any], spans: list[dict[str, Any]]) -> tuple[int, int, list[dict[str, Any]]]:
    unsupported = 0
    total = 0
    details = []
    for span_index, span in enumerate(spans):
        for claim in span.get("evidence", []):
            total += 1
            try:
                qb = position_to_qb(case, claim["measure"], claim["offset_qb"])
            except (KeyError, ValueError, ZeroDivisionError):
                unsupported += 1
                details.append({"span": span_index, "reason": "invalid-position"})
                continue
            sounding = active_events(case, qb)
            actual = {pitch_token(event["pitch"]) for event in sounding}
            claimed = {pitch_token(item) for item in claim.get("pitches", [])}
            bass = min(sounding, key=lambda event: event["midi"])["pitch"] if sounding else None
            reasons = []
            if not claimed or not claimed.issubset(actual):
                reasons.append("unsupported-pitch")
            if bass is None or pitch_token(claim.get("bass", "")) != pitch_token(bass):
                reasons.append("incorrect-literal-bass")
            if reasons:
                unsupported += 1
                details.append({"span": span_index, "position_qb": str(qb), "reason": ",".join(reasons)})
    return unsupported, total, details


def score_case(case: dict[str, Any], prediction: dict[str, Any], gold: list[dict[str, Any]], tolerance: Fraction = Fraction(1, 4)) -> dict[str, Any]:
    predicted = _prediction_spans(case, prediction)
    gold_spans = [{**span, "start_qb": fraction(span["start_qb"]), "end_qb": fraction(span["end_qb"])} for span in gold]
    boundaries = {Fraction(0)}
    for span in predicted + gold_spans:
        boundaries.update((span["start_qb"], span["end_qb"]))
    points = sorted(boundaries)
    totals = defaultdict(Fraction)
    examples: dict[str, Any] = {"correct": None, "incorrect": None}
    for start, end in zip(points, points[1:]):
        if end <= start:
            continue
        duration = end - start
        midpoint = start + duration / 2
        reference = _active_span(gold_spans, midpoint)
        candidate = _active_span(predicted, midpoint)
        if reference is None:
            continue
        totals["reference"] += duration
        if candidate is None:
            continue
        totals["covered"] += duration
        local_match = _key_token(candidate.get("local_key", "")) == _key_token(reference["local_key"])
        roman_match = roman_token(candidate.get("roman", "")) == roman_token(reference["roman"])
        root_match = _root_tpc(candidate.get("root", "")) == reference.get("root_tpc")
        quality_match = _quality(candidate.get("quality", "")) == _quality(reference["quality"])
        inversion_match = candidate.get("inversion") == reference["inversion"]
        example = {
            "start": qb_to_position(case, start),
            "end": qb_to_position(case, end),
            "reference": {
                "local_key": reference["local_key"], "roman": reference["roman"],
                "quality": reference["quality"], "inversion": reference["inversion"],
            },
            "prediction": {
                "local_key": candidate.get("local_key"), "roman": candidate.get("roman"),
                "quality": candidate.get("quality"), "inversion": candidate.get("inversion"),
            },
        }
        if local_match and roman_match and examples["correct"] is None:
            examples["correct"] = example
        elif (not local_match or not roman_match) and examples["incorrect"] is None:
            examples["incorrect"] = example
        if local_match:
            totals["local_key"] += duration
        if root_match:
            totals["root"] += duration
        if quality_match:
            totals["quality"] += duration
        if inversion_match:
            totals["inversion"] += duration
        if local_match and roman_match:
            totals["exact"] += duration
    denominator = float(totals["reference"])
    metrics = {
        "duration_qb": denominator,
        "coverage": float(totals["covered"]) / denominator if denominator else 0.0,
        "harmony_exact": float(totals["exact"]) / denominator if denominator else 0.0,
        "local_key_accuracy": float(totals["local_key"]) / denominator if denominator else 0.0,
        "root_accuracy": float(totals["root"]) / denominator if denominator else 0.0,
        "quality_accuracy": float(totals["quality"]) / denominator if denominator else 0.0,
        "inversion_accuracy": float(totals["inversion"]) / denominator if denominator else 0.0,
        **_boundary_metrics(predicted, gold_spans, tolerance),
    }
    unsupported, claim_count, claim_details = _unsupported_evidence(case, predicted)
    metrics["unsupported_note_claim_rate"] = unsupported / claim_count if claim_count else None
    metrics["evidence_claims"] = claim_count
    return {
        "metrics": metrics,
        "predicted_span_count": len(predicted),
        "gold_span_count": len(gold_spans),
        "unsupported_claims": claim_details,
        "representative": examples,
    }


def _aggregate(rows: list[dict[str, Any]]) -> dict[str, Any]:
    metric_names = (
        "coverage", "harmony_exact", "local_key_accuracy", "root_accuracy", "quality_accuracy",
        "inversion_accuracy", "boundary_precision", "boundary_recall", "boundary_f1",
        "unsupported_note_claim_rate",
    )
    successful = [row for row in rows if row["status"] == "ok"]
    aggregate = {
        "cases_total": len(rows),
        "cases_scored": len(successful),
        "execution_failures": len(rows) - len(successful),
        "schema_valid_rate": sum(bool(row.get("schema_valid")) for row in rows) / len(rows) if rows else 0.0,
        "mean_latency_seconds": mean(row["latency_seconds"] for row in rows if row.get("latency_seconds") is not None),
        "monetary_cost_usd": None,
    }
    for name in metric_names:
        aggregate[name] = mean(
            row["score"]["metrics"][name]
            for row in successful
            if row["score"]["metrics"].get(name) is not None
        )
    usage = defaultdict(int)
    saw_usage = False
    for row in rows:
        if row.get("usage"):
            saw_usage = True
            for key, value in row["usage"].items():
                if isinstance(value, int):
                    usage[key] += value
    aggregate["usage"] = dict(usage) if saw_usage else None
    costs = [row["monetary_cost_usd"] for row in rows if isinstance(row.get("monetary_cost_usd"), (int, float))]
    aggregate["monetary_cost_usd"] = sum(costs) if costs else None
    return aggregate


def score_run(
    *,
    staging: Path,
    private_dir: Path,
    deterministic_dir: Path,
    model_output: Path,
    results_dir: Path,
) -> dict[str, Any]:
    gold_index = read_json(private_dir / "gold.json")
    cases = {path.stem: read_json(path) for path in (staging / "cases").glob("*.json")}
    rows: list[dict[str, Any]] = []
    for case_id, case in sorted(cases.items()):
        prediction = read_json(deterministic_dir / f"{case_id}.json")
        rows.append({
            "case_id": case_id, "model": "music21-9.9.1", "condition": "music21",
            "status": "ok", "schema_valid": True, "latency_seconds": 0.0, "usage": None,
            "score": score_case(case, prediction, gold_index[case_id]["gold"]),
        })
    model_index = read_json(model_output / "model-run-index.json") if (model_output / "model-run-index.json").exists() else []
    for record in model_index:
        row = {key: record.get(key) for key in (
            "case_id", "model", "condition", "status", "schema_valid", "latency_seconds", "usage", "error",
        )}
        if record.get("status") == "ok" and record.get("prediction"):
            row["score"] = score_case(cases[record["case_id"]], record["prediction"], gold_index[record["case_id"]]["gold"])
        else:
            row["score"] = None
        rows.append(row)
    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[(row["model"], row["condition"])].append(row)
    summary = {
        "boundary_tolerance_qb": "1/4",
        "groups": [],
        "cases": rows,
    }
    for (model, condition), group_rows in sorted(groups.items()):
        aggregate = {"model": model, "condition": condition, **_aggregate(group_rows)}
        if condition == "bachi":
            aggregate["harmony_exact"] = None
            aggregate["local_key_accuracy"] = None
        summary["groups"].append(aggregate)
    results_dir.mkdir(parents=True, exist_ok=True)
    write_json(results_dir / "metrics.json", summary)
    return summary
