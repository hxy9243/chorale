from __future__ import annotations

import argparse
import csv
import json
import random
import shutil
import time
from collections import defaultdict
from fractions import Fraction
from pathlib import Path
from typing import Any

from music21 import chord as m21chord
from music21 import converter, key, meter, stream

from .bachi import QUALITY_NAMES, inversion_from_bass
from .corpus import ALLOWED_EVENT_KEYS, load_gold, prepare_case, qb_to_position, validate_sanitized_case, verify_corpus
from .deterministic import analyze
from .model_runner import run_models
from .pi_runner import run_models as run_pi_models
from .scoring import _aggregate, _pitch_tpc, score_case
from .util import fraction, fraction_text, read_json, sha256_path, write_json


PACKAGE_ROOT = Path(__file__).resolve().parents[2]
WEIGHTED_METRICS = (
    "coverage", "harmony_exact", "local_key_accuracy", "root_accuracy",
    "quality_accuracy", "inversion_accuracy", "unsupported_note_claim_rate",
)


def _as_fraction(value: Any) -> Fraction:
    if isinstance(value, Fraction):
        return value
    return Fraction(str(float(value))).limit_denominator(960)


def _measure_context(measure: stream.Measure, cls: type, fallback: Any) -> Any:
    found = measure.getContextByClass(cls)
    return found if found is not None else fallback


def _measure_windows(score: stream.Score, gold_starts: list[Fraction]) -> list[tuple[int, Fraction, Fraction]]:
    reference = max(score.parts, key=lambda part: len(list(part.getElementsByClass(stream.Measure))))
    measures = list(reference.getElementsByClass(stream.Measure))
    starts = [_as_fraction(measure.getOffsetInHierarchy(score)) for measure in measures]
    windows = []
    for index in range(0, len(measures) - 7):
        start = starts[index]
        if index + 8 < len(starts):
            end = starts[index + 8]
        else:
            last = measures[index + 7]
            duration = _as_fraction(last.barDuration.quarterLength or last.duration.quarterLength)
            end = starts[index + 7] + duration
        label_count = sum(start <= onset < end for onset in gold_starts)
        if 8 <= label_count <= 80 and end > start:
            windows.append((index, start, end))
    return windows


def _bachi_case(score: stream.Score, item: dict[str, Any], start_index: int, start_qb: Fraction, end_qb: Fraction) -> dict[str, Any]:
    reference = max(score.parts, key=lambda part: len(list(part.getElementsByClass(stream.Measure))))
    source_measures = list(reference.getElementsByClass(stream.Measure))[start_index:start_index + 8]
    source_starts = [_as_fraction(measure.getOffsetInHierarchy(score)) for measure in source_measures]
    measures = []
    prior_ts = meter.TimeSignature("4/4")
    prior_ks = key.KeySignature(0)
    for index, measure in enumerate(source_measures):
        prior_ts = _measure_context(measure, meter.TimeSignature, prior_ts)
        prior_ks = _measure_context(measure, key.KeySignature, prior_ks)
        next_start = source_starts[index + 1] if index + 1 < len(source_starts) else end_qb
        measures.append({
            "measure": index + 1,
            "offset_qb": fraction_text(source_starts[index] - start_qb),
            "duration_qb": fraction_text(next_start - source_starts[index]),
            "time_signature": prior_ts.ratioString,
            "key_signature_fifths": int(prior_ks.sharps),
        })

    events: list[dict[str, Any]] = []
    for staff, part in enumerate(score.parts, start=1):
        for element in part.recurse().notes:
            onset = _as_fraction(element.getOffsetInHierarchy(score))
            duration = _as_fraction(element.duration.quarterLength)
            element_end = onset + duration
            if element_end <= start_qb or onset >= end_qb:
                continue
            clipped_start = max(onset, start_qb)
            clipped_end = min(element_end, end_qb)
            if clipped_end <= clipped_start:
                continue
            relative = clipped_start - start_qb
            measure_index = max(i for i, row in enumerate(measures) if fraction(row["offset_qb"]) <= relative)
            measure_offset = relative - fraction(measures[measure_index]["offset_qb"])
            pitches = list(element.pitches) if isinstance(element, m21chord.Chord) else [element.pitch]
            tie = getattr(getattr(element, "tie", None), "type", None) or "none"
            if onset < start_qb:
                tie = "continue"
            for pitch_value in pitches:
                event = {
                    "measure": measure_index + 1,
                    "offset_qb": fraction_text(measure_offset),
                    "duration_qb": fraction_text(clipped_end - clipped_start),
                    "staff": staff,
                    "voice": 1,
                    "pitch": pitch_value.nameWithOctave,
                    "midi": int(pitch_value.midi),
                    "tie": tie,
                    "grace": bool(element.duration.isGrace),
                }
                if set(event) != ALLOWED_EVENT_KEYS:
                    raise AssertionError("Sanitized event allowlist changed")
                events.append(event)
    events.sort(key=lambda event: (event["measure"], fraction(event["offset_qb"]), event["staff"], event["midi"]))
    case = {
        "schema_version": 1,
        "case_id": item["case_id"],
        "position_unit": "quarter-beats; offsets are zero-based within the displayed measure",
        "measures": measures,
        "events": events,
    }
    validate_sanitized_case(case)
    return case


def _key_name(token: str) -> str:
    value = token.strip().replace("-", "b")
    if not value:
        return "unknown"
    tonic = value[0].upper() + value[1:]
    return f"{tonic} {'major' if value[0].isupper() else 'minor'}"


def _bachi_gold(rows: list[dict[str, str]], case: dict[str, Any], start_qb: Fraction, end_qb: Fraction) -> list[dict[str, Any]]:
    parsed = [{**row, "absolute_start": fraction(row["offset_qb"])} for row in rows]
    spans = []
    for index, row in enumerate(parsed):
        absolute_start = row["absolute_start"]
        absolute_end = parsed[index + 1]["absolute_start"] if index + 1 < len(parsed) else end_qb
        if absolute_end <= start_qb or absolute_start >= end_qb:
            continue
        clipped_start = max(absolute_start, start_qb) - start_qb
        clipped_end = min(absolute_end, end_qb) - start_qb
        if clipped_end <= clipped_start:
            continue
        quality_code = row["quality"].strip()
        spans.append({
            "start_qb": fraction_text(clipped_start),
            "end_qb": fraction_text(clipped_end),
            "start": qb_to_position(case, clipped_start),
            "end": qb_to_position(case, clipped_end),
            "local_key": _key_name(row["local_key"]),
            "roman": row["roman"].strip(),
            "root_tpc": _pitch_tpc(row["root"]),
            "quality": QUALITY_NAMES.get(quality_code, quality_code),
            "inversion": inversion_from_bass(row["root"], quality_code, row["bass"]),
            "source_position": {"offset_qb": row["offset_qb"]},
        })
    return spans


def prepare(args: argparse.Namespace) -> int:
    selection = read_json(args.selection)
    run_dir = args.run_dir.resolve()
    cases_dir = run_dir / "staging" / "cases"
    deterministic_dir = run_dir / "predictions" / "music21"
    private_dir = run_dir / "private"
    for directory in (cases_dir, deterministic_dir, private_dir):
        directory.mkdir(parents=True, exist_ok=True)
    verify_corpus(args.dcml_corpus, selection["dcml"]["corpus"]["commit"])
    gold_index: dict[str, Any] = {}
    coverage: list[dict[str, Any]] = []
    frozen = {"seed": selection["seed"], "dcml": [], "bachi": [], "models": selection["models"]}

    for item in selection["dcml"]["windows"]:
        case = prepare_case(args.dcml_corpus, item)
        gold = load_gold(args.dcml_corpus, item, case)
        write_json(cases_dir / f"{item['case_id']}.json", case)
        write_json(deterministic_dir / f"{item['case_id']}.json", analyze(case))
        gold_index[item["case_id"]] = {"corpus": "DCML", "selection": item, "gold": gold}
        row = {**item, "corpus": "DCML", "note_events": len(case["events"]), "gold_spans": len(gold)}
        coverage.append(row)
        frozen["dcml"].append(item)

    for item in selection["bachi"]["pieces"]:
        piece_dir = args.bachi_data / item["piece_id"]
        score_path = piece_dir / item["score_file"]
        score = converter.parse(str(score_path))
        with (piece_dir / "chord_symbol.csv").open(encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
        candidates = _measure_windows(score, [fraction(row["offset_qb"]) for row in rows])
        if not candidates:
            raise ValueError(f"No eligible eight-measure window for {item['piece_id']}")
        chooser = random.Random(f"{selection['seed']}:{item['piece_id']}")
        start_index, start_qb, end_qb = chooser.choice(candidates)
        case = _bachi_case(score, item, start_index, start_qb, end_qb)
        gold = _bachi_gold(rows, case, start_qb, end_qb)
        write_json(cases_dir / f"{item['case_id']}.json", case)
        write_json(deterministic_dir / f"{item['case_id']}.json", analyze(case))
        frozen_item = {
            **item,
            "start_measure_index": start_index,
            "start_qb": fraction_text(start_qb),
            "end_qb": fraction_text(end_qb),
            "score_sha256": sha256_path(score_path),
            "gold_sha256": sha256_path(piece_dir / "chord_symbol.csv"),
        }
        gold_index[item["case_id"]] = {"corpus": "BACHI validation", "selection": frozen_item, "gold": gold}
        coverage.append({**frozen_item, "corpus": "BACHI validation", "note_events": len(case["events"]), "gold_spans": len(gold)})
        frozen["bachi"].append(frozen_item)

    write_json(private_dir / "gold.json", gold_index)
    write_json(run_dir / "frozen-selection.json", frozen)
    write_json(run_dir / "coverage.json", coverage)
    print(json.dumps({"cases": len(coverage), "coverage": coverage}, indent=2))
    return 0


def run_model(args: argparse.Namespace) -> int:
    output_root = args.run_dir.resolve() / "predictions" / "model-runs" / f"{args.model}-{args.effort}"
    records = run_models(
        staging=args.run_dir / "staging",
        schema_path=args.schema,
        deterministic_dir=args.run_dir / "predictions" / "music21",
        skill_path=args.skill,
        models=[args.model],
        conditions=["model_skill_evidence"],
        effort=args.effort,
        output_root=output_root,
        timeout_seconds=args.timeout_seconds,
        parallelism=args.parallelism,
        resume=True,
    )
    print(json.dumps({"model": args.model, "effort": args.effort, "records": len(records), "ok": sum(row["status"] == "ok" for row in records)}, indent=2))
    return 0


def run_pi_model(args: argparse.Namespace) -> int:
    output_root = args.run_dir.resolve() / "predictions" / "model-runs"
    records = run_pi_models(
        staging=args.run_dir / "staging",
        schema_path=args.schema,
        deterministic_dir=args.run_dir / "predictions" / "music21",
        skill_path=args.skill,
        model=args.model,
        effort=args.effort,
        output_root=output_root,
        timeout_seconds=args.timeout_seconds,
        parallelism=args.parallelism,
        resume=True,
        case_ids=set(args.case_id) if args.case_id else None,
        max_output_tokens=args.max_output_tokens,
    )
    print(json.dumps({
        "transport": "pi/openrouter",
        "model": args.model,
        "effort": args.effort,
        "records": len(records),
        "ok": sum(row["status"] == "ok" for row in records),
        "cost_usd": sum(row.get("monetary_cost_usd") or 0 for row in records),
    }, indent=2))
    return 0


def _duration_weighted(rows: list[dict[str, Any]]) -> dict[str, float | None]:
    successful = [row for row in rows if row["status"] == "ok" and row.get("score")]
    output: dict[str, float | None] = {}
    for metric in WEIGHTED_METRICS:
        values = [
            (row["score"]["metrics"].get(metric), row["score"]["metrics"]["duration_qb"])
            for row in successful
            if row["score"]["metrics"].get(metric) is not None
        ]
        denominator = sum(weight for _, weight in values)
        output[metric] = sum(value * weight for value, weight in values) / denominator if denominator else None
    return output


def _bootstrap_interval(rows: list[dict[str, Any]], metric: str, seed: str, samples: int = 10000) -> dict[str, float] | None:
    successful = [row for row in rows if row["status"] == "ok" and row.get("score")]
    if not successful:
        return None
    rng = random.Random(seed)
    estimates = []
    for _ in range(samples):
        draw = [rng.choice(successful) for _ in successful]
        weighted = _duration_weighted(draw)[metric]
        if weighted is not None:
            estimates.append(weighted)
    estimates.sort()
    return {
        "low": estimates[int(0.025 * (len(estimates) - 1))],
        "high": estimates[int(0.975 * (len(estimates) - 1))],
    }


def _percent(value: float | None) -> str:
    return "n/a" if value is None else f"{100 * value:.1f}%"


def _render_report(summary: dict[str, Any], coverage: list[dict[str, Any]], manifest: dict[str, Any]) -> str:
    groups_by_corpus: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for group in summary["groups"]:
        groups_by_corpus[group["corpus"]].append(group)
    case_rows: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in summary["cases"]:
        case_rows[(row["corpus"], row["case_id"])].append(row)
    threshold_counts = defaultdict(int)
    for row in summary["cases"]:
        if row.get("score") and row["score"]["metrics"]["harmony_exact"] >= 0.85:
            threshold_counts[row["model"]] += 1
    hard_cases = []
    for (corpus, case_id), rows in sorted(case_rows.items()):
        best = max(row["score"]["metrics"]["harmony_exact"] for row in rows if row.get("score"))
        if best < 0.20:
            hard_cases.append(f"`{case_id}` ({corpus}, best model {best * 100:.1f}%)")
    lines = [
        "# Wide guided harmony benchmark",
        "",
        "Twenty frozen eight-measure passages: ten fresh DCML Mozart windows and ten previously unused pieces from the official BACHI validation partition. Every call used the same condition: model + music21 evidence + the analytical SKILL, with no few-shots and no BACHI predictions.",
        "",
        "## Results",
        "",
        "Primary label metrics below are duration-weighted. Boundary F1 is an equal-passage macro average.",
        "",
        "| Corpus | Model | Effort | Exact key+Roman (95% bootstrap) | Local key | Root | Quality | Inversion | Boundary F1 | Valid calls | Mean latency |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for group in summary["groups"]:
        weighted = group["duration_weighted"]
        interval = group["bootstrap_95"]["harmony_exact"]
        exact_interval = "n/a" if interval is None else f"{_percent(interval['low'])}--{_percent(interval['high'])}"
        exact = f"{_percent(weighted['harmony_exact'])} ({exact_interval})"
        latency = group["mean_latency_seconds"]
        lines.append(
            f"| {group['corpus']} | {group['model']} | {group['effort']} | "
            f"{exact} | {_percent(weighted['local_key_accuracy'])} | "
            f"{_percent(weighted['root_accuracy'])} | {_percent(weighted['quality_accuracy'])} | "
            f"{_percent(weighted['inversion_accuracy'])} | {_percent(group['boundary_f1'])} | "
            f"{group['cases_scored']}/{group['cases_total']} | {'n/a' if latency is None else f'{latency:.1f}s'} |"
        )
    scored_groups = [group for group in summary["groups"] if group["duration_weighted"]["harmony_exact"] is not None]
    dcml_best = max((group for group in groups_by_corpus["DCML"] if group in scored_groups), key=lambda row: row["duration_weighted"]["harmony_exact"])
    bachi_best = max((group for group in groups_by_corpus["BACHI validation"] if group in scored_groups), key=lambda row: row["duration_weighted"]["harmony_exact"])
    boundary_best = max(scored_groups, key=lambda row: row["boundary_f1"] or -1)
    fastest = min(scored_groups, key=lambda row: row["mean_latency_seconds"] if row["mean_latency_seconds"] is not None else float("inf"))
    threshold_text = ", ".join(
        f"{model} {threshold_counts[model]}/20"
        for model in sorted({group["model"] for group in summary["groups"]})
    )
    lines.extend([
        "",
        "## Findings",
        "",
        f"- **DCML leader:** {dcml_best['model']} {dcml_best['effort']} at {_percent(dcml_best['duration_weighted']['harmony_exact'])} exact.",
        f"- **BACHI-validation leader:** {bachi_best['model']} {bachi_best['effort']} at {_percent(bachi_best['duration_weighted']['harmony_exact'])} exact.",
        f"- **The 85% product target remains rare per passage:** {threshold_text}. No model reaches 85% in aggregate.",
        f"- **Fastest scoreable configuration:** {fastest['model']} {fastest['effort']} at {fastest['mean_latency_seconds']:.1f}s mean latency in its corpus group.",
        f"- **Best boundary result:** {boundary_best['model']} {boundary_best['effort']} on {boundary_best['corpus']} at {_percent(boundary_best['boundary_f1'])} F1.",
        "- **Root identification is generally easier than full functional analysis:** correct sonority recognition does not imply correct local key and Roman function.",
        f"- **Shared hard cases:** {', '.join(hard_cases) if hard_cases else 'none below the 20% best-model threshold'}.",
    ])
    lines.extend([
        "",
        "## Interpretation boundary",
        "",
        "- Compare models within each corpus. DCML and BACHI use different source repertoires and annotation conventions, so there is no pooled headline accuracy.",
        "- These are ten passages per corpus, sufficient for a direction-finding comparison but not a product-readiness estimate. Case-level variance and failure modes matter more than small rank differences.",
        "- BACHI is an official validation split, not a hidden test split. It is useful cross-corpus evidence, not a clean generalization claim.",
        "",
        "## Frozen design",
        "",
        f"- Selection seed: `{manifest['seed']}`",
        "- DCML: ten distinct movements, excluding the prior six held-out and two development movements.",
        "- BACHI: official split seed 42; prior eight cross-reference pieces excluded; ten MusicXML-backed validation pieces selected before inference.",
        f"- Calls: 20 fresh passages x {len({group['model'] for group in summary['groups']})} model/effort pairs = {len(summary['cases'])} recorded.",
        "",
        "## Coverage",
        "",
        "| Case | Corpus | Source | Note events | Gold spans |",
        "|---|---|---|---:|---:|",
    ])
    for row in coverage:
        source = row.get("movement", row.get("piece_id", ""))
        lines.append(f"| {row['case_id']} | {row['corpus']} | {source} | {row['note_events']} | {row['gold_spans']} |")
    return "\n".join(lines) + "\n"


def score(args: argparse.Namespace) -> int:
    run_dir = args.run_dir.resolve()
    results_dir = args.results_dir.resolve()
    results_dir.mkdir(parents=True, exist_ok=True)
    cases = {path.stem: read_json(path) for path in (run_dir / "staging" / "cases").glob("*.json")}
    gold_index = read_json(run_dir / "private" / "gold.json")
    records = []
    for path in sorted((run_dir / "predictions" / "model-runs").glob("*/model-run-index.json")):
        records.extend(read_json(path))
    rows = []
    for record in records:
        row = {key: record.get(key) for key in (
            "case_id", "model", "effort", "condition", "transport", "status",
            "schema_valid", "latency_seconds", "usage", "monetary_cost_usd", "error",
        )}
        row["corpus"] = gold_index[record["case_id"]]["corpus"]
        row["score"] = score_case(cases[record["case_id"]], record["prediction"], gold_index[record["case_id"]]["gold"]) if record.get("status") == "ok" and record.get("prediction") else None
        rows.append(row)
    groups: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[(row["corpus"], row["model"], row["effort"])].append(row)
    group_summaries = []
    for (corpus, model, effort), group in sorted(groups.items()):
        group_summaries.append({
            "corpus": corpus,
            "model": model,
            "effort": effort,
            **_aggregate(group),
            "duration_weighted": _duration_weighted(group),
            "bootstrap_95": {
                "harmony_exact": _bootstrap_interval(group, "harmony_exact", f"20260921:{corpus}:{model}:{effort}"),
            },
        })
    summary = {
        "boundary_tolerance_qb": "1/4",
        "groups": group_summaries,
        "cases": rows,
    }
    write_json(results_dir / "metrics.json", summary)
    write_json(results_dir / "raw-model-predictions.json", records)
    shutil.copy2(run_dir / "frozen-selection.json", results_dir / "frozen-selection.json")
    shutil.copy2(run_dir / "coverage.json", results_dir / "coverage.json")
    configurations = sorted(
        ({"model": row["model"], "effort": row["effort"], "transport": row.get("transport", "codex-cli")}
         for row in records),
        key=lambda row: (row["model"], row["effort"]),
    )
    configurations = list({(row["model"], row["effort"]): row for row in configurations}.values())
    manifest = {
        "run_id": results_dir.name,
        "created_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "selection_sha256": sha256_path(args.selection),
        "skill_sha256": sha256_path(args.skill),
        "condition": "model_skill_evidence",
        "models": configurations,
        "calls_expected": len(cases) * len(configurations),
        "calls_recorded": len(records),
    }
    write_json(results_dir / "run-manifest.json", manifest)
    coverage = read_json(run_dir / "coverage.json")
    selection = read_json(args.selection)
    (results_dir / "REPORT.md").write_text(_render_report(summary, coverage, selection), encoding="utf-8")
    print(json.dumps(summary["groups"], indent=2))
    return 0


def build_review(args: argparse.Namespace) -> int:
    run_dir = args.run_dir.resolve()
    results_dir = args.results_dir.resolve()
    review_dir = args.review_dir.resolve()
    review_dir.mkdir(parents=True, exist_ok=True)
    records = read_json(results_dir / "raw-model-predictions.json")
    metrics = read_json(results_dir / "metrics.json")
    gold_index = read_json(run_dir / "private" / "gold.json")
    score_rows = {(row["case_id"], row["model"]): row for row in metrics["cases"]}
    case_ids = sorted({record["case_id"] for record in records})
    case_number = {case_id: index for index, case_id in enumerate(case_ids, start=1)}
    benchmark_runs = []
    for record in sorted(records, key=lambda row: (row["case_id"], row["model"])):
        case_id = record["case_id"]
        eval_id = case_number[case_id]
        configuration = f"{record['model']} {record['effort']}"
        eval_dir = review_dir / f"{eval_id:03d}-{case_id}"
        outputs_dir = eval_dir / configuration.replace(" ", "-") / "outputs"
        outputs_dir.mkdir(parents=True, exist_ok=True)
        run_parent = outputs_dir.parent
        score_row = score_rows[(case_id, record["model"])]
        score_data = score_row.get("score")
        prompt = (
            f"Review {configuration} on anonymous case {case_id} from {score_row['corpus']}. "
            "The model received sanitized score facts, music21 evidence, and the frozen analytical skill."
        )
        write_json(run_parent / "eval_metadata.json", {"eval_id": eval_id, "eval_name": f"{case_id} {configuration}", "prompt": prompt, "assertions": []})
        comparison = {
            "case_id": case_id,
            "corpus": score_row["corpus"],
            "model": record["model"],
            "effort": record["effort"],
            "status": record["status"],
            "metrics": score_data["metrics"] if score_data else None,
            "representative": score_data["representative"] if score_data else None,
            "prediction": record.get("prediction"),
            "reference": gold_index[case_id]["gold"],
        }
        write_json(outputs_dir / "comparison.json", comparison)
        checks = []
        if score_data:
            values = score_data["metrics"]
            checks = [
                ("The response is schema-valid", bool(record["schema_valid"]), f"status={record['status']}"),
                ("The prediction covers at least 99% of the passage", values["coverage"] >= 0.99, f"coverage={values['coverage']:.3f}"),
                ("All cited note evidence is supported by the score", values["unsupported_note_claim_rate"] == 0, f"unsupported_note_claim_rate={values['unsupported_note_claim_rate']}"),
                ("Exact local-key plus Roman accuracy reaches the 85% product target", values["harmony_exact"] >= 0.85, f"harmony_exact={values['harmony_exact']:.3f}"),
            ]
        else:
            checks = [("The response is schema-valid", False, f"status={record['status']}; error={record.get('error')}")]
        grading = {
            "expectations": [{"text": text, "passed": passed, "evidence": evidence} for text, passed, evidence in checks],
            "summary": {
                "passed": sum(passed for _, passed, _ in checks),
                "failed": sum(not passed for _, passed, _ in checks),
                "total": len(checks),
                "pass_rate": sum(passed for _, passed, _ in checks) / len(checks),
            },
        }
        write_json(run_parent / "grading.json", grading)
        benchmark_runs.append({
            "eval_id": eval_id,
            "eval_name": f"{case_id} ({score_row['corpus']})",
            "configuration": configuration,
            "run_number": 1,
            "result": {
                "pass_rate": grading["summary"]["pass_rate"],
                "passed": grading["summary"]["passed"],
                "failed": grading["summary"]["failed"],
                "total": grading["summary"]["total"],
                "time_seconds": record.get("latency_seconds") or 0,
                "tokens": sum(value for value in (record.get("usage") or {}).values() if isinstance(value, int)),
                "tool_calls": 0,
                "errors": int(record["status"] != "ok"),
            },
            "expectations": grading["expectations"],
            "notes": [f"exact key+Roman={score_data['metrics']['harmony_exact']:.3f}"] if score_data else [record.get("error") or "execution failure"],
        })
    benchmark = {
        "metadata": {
            "skill_name": "chorale-harmony-analysis",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "evals_run": list(range(1, len(case_ids) + 1)),
            "runs_per_configuration": 1,
        },
        "runs": benchmark_runs,
    }
    write_json(review_dir / "benchmark.json", benchmark)
    print(json.dumps({"review_runs": len(benchmark_runs), "review_dir": str(review_dir)}, indent=2))
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="Run the frozen 10-DCML plus 10-BACHI guided benchmark")
    sub = root.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare")
    prep.add_argument("--selection", type=Path, default=PACKAGE_ROOT / "wide-benchmark-selection.json")
    prep.add_argument("--dcml-corpus", type=Path, required=True)
    prep.add_argument("--bachi-data", type=Path, required=True)
    prep.add_argument("--run-dir", type=Path, required=True)
    prep.set_defaults(func=prepare)
    model = sub.add_parser("run-model")
    model.add_argument("--run-dir", type=Path, required=True)
    model.add_argument("--model", required=True)
    model.add_argument("--effort", choices=["low", "medium", "high", "xhigh", "max"], required=True)
    model.add_argument("--schema", type=Path, default=PACKAGE_ROOT / "schemas" / "prediction.schema.json")
    model.add_argument("--skill", type=Path, default=PACKAGE_ROOT / "SKILL.md")
    model.add_argument("--timeout-seconds", type=int, default=600)
    model.add_argument("--parallelism", type=int, default=1)
    model.set_defaults(func=run_model)
    pi_model = sub.add_parser("run-pi-model")
    pi_model.add_argument("--run-dir", type=Path, required=True)
    pi_model.add_argument("--model", required=True)
    pi_model.add_argument("--effort", choices=["low", "medium", "high", "xhigh", "max"], required=True)
    pi_model.add_argument("--schema", type=Path, default=PACKAGE_ROOT / "schemas" / "prediction.schema.json")
    pi_model.add_argument("--skill", type=Path, default=PACKAGE_ROOT / "SKILL.md")
    pi_model.add_argument("--timeout-seconds", type=int, default=600)
    pi_model.add_argument("--parallelism", type=int, default=1)
    pi_model.add_argument("--case-id", action="append")
    pi_model.add_argument("--max-output-tokens", type=int)
    pi_model.set_defaults(func=run_pi_model)
    scoring = sub.add_parser("score")
    scoring.add_argument("--selection", type=Path, default=PACKAGE_ROOT / "wide-benchmark-selection.json")
    scoring.add_argument("--skill", type=Path, default=PACKAGE_ROOT / "SKILL.md")
    scoring.add_argument("--run-dir", type=Path, required=True)
    scoring.add_argument("--results-dir", type=Path, required=True)
    scoring.set_defaults(func=score)
    review = sub.add_parser("build-review")
    review.add_argument("--run-dir", type=Path, required=True)
    review.add_argument("--results-dir", type=Path, required=True)
    review.add_argument("--review-dir", type=Path, required=True)
    review.set_defaults(func=build_review)
    return root


def main() -> None:
    args = parser().parse_args()
    raise SystemExit(args.func(args))


if __name__ == "__main__":
    main()
