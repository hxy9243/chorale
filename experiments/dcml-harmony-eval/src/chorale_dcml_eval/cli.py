from __future__ import annotations

import argparse
import json
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from .corpus import prepare_all
from .deterministic import analyze
from .model_runner import run_models
from .report import render_report
from .scoring import score_run
from .util import read_json, sha256_path, write_json


PACKAGE_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SELECTION = PACKAGE_ROOT / "corpus-selection.json"
DEFAULT_SCHEMA = PACKAGE_ROOT / "schemas" / "prediction.schema.json"
DEFAULT_SKILL = PACKAGE_ROOT / "SKILL.md"
DEFAULT_FEW_SHOT = PACKAGE_ROOT / "CONTRASTIVE_FEW_SHOTS.md"


def _version(command: list[str]) -> str | None:
    try:
        return subprocess.run(command, capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def _run_id() -> str:
    return time.strftime("pilot-%Y%m%dT%H%M%SZ", time.gmtime())


def _deterministic(staging: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    for case_path in sorted((staging / "cases").glob("*.json")):
        write_json(output_dir / case_path.name, analyze(read_json(case_path)))


def _merge_records(*record_sets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[tuple[str, str, str], dict[str, Any]] = {}
    for records in record_sets:
        for record in records:
            key = (record["model"], record["condition"], record["case_id"])
            merged[key] = record
    return [merged[key] for key in sorted(merged)]


def run(args: argparse.Namespace) -> int:
    corpus = args.corpus.resolve()
    run_dir = args.run_dir.resolve()
    results_dir = args.results_dir.resolve()
    staging = run_dir / "staging"
    private_dir = run_dir / "private"
    deterministic_dir = run_dir / "predictions" / "music21"
    model_output = run_dir / "predictions" / "models"
    run_dir.mkdir(parents=True, exist_ok=True)
    selection = read_json(args.selection)
    prepared = prepare_all(corpus, args.selection, staging, private_dir)
    _deterministic(staging, deterministic_dir)
    reused = [
        record
        for path in args.reuse_model_results
        for record in read_json(path)
    ]
    generated: list[dict[str, Any]] = []
    if not args.skip_models and args.models:
        generated = run_models(
            staging=staging,
            schema_path=args.schema,
            deterministic_dir=deterministic_dir,
            skill_path=args.skill,
            models=args.models,
            conditions=args.conditions,
            effort=args.effort,
            output_root=model_output,
            bachi_prediction_dir=args.bachi_prediction_dir,
            few_shot_path=args.few_shot,
            timeout_seconds=args.timeout_seconds,
            parallelism=args.parallelism,
        )
    write_json(model_output / "model-run-index.json", _merge_records(reused, generated))
    summary = score_run(
        staging=staging,
        private_dir=private_dir,
        deterministic_dir=deterministic_dir,
        model_output=model_output,
        results_dir=results_dir,
    )
    run_manifest = {
        "run_id": results_dir.name,
        "created_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "corpus_commit": selection["corpus"]["commit"],
        "selection_sha256": sha256_path(args.selection),
        "schema_sha256": sha256_path(args.schema),
        "skill_sha256": sha256_path(args.skill),
        "few_shot_sha256": sha256_path(args.few_shot) if any(
            record["condition"] in {"model_skill_evidence_fewshot", "model_skill_bachi_fewshot"}
            for record in reused + generated
        ) else None,
        "python": platform.python_version(),
        "music21": _version([sys.executable, "-c", "import music21; print(music21.__version__)"]),
        "codex": _version(["codex", "--version"]),
        "models": sorted({record["model"] for record in reused + generated}),
        "new_models": args.models,
        "conditions": sorted({record["condition"] for record in reused + generated}),
        "effort": args.effort,
        "timeout_seconds": args.timeout_seconds,
        "parallelism": args.parallelism,
        "monetary_cost_usd": None,
        "cost_note": "ChatGPT-authenticated Codex JSONL does not expose an actual monetary charge.",
        "exploratory_rerun": args.exploratory,
    }
    write_json(results_dir / "run-manifest.json", run_manifest)
    write_json(results_dir / "corpus-coverage.json", prepared["coverage"])
    deterministic_predictions = {
        path.stem: read_json(path) for path in sorted(deterministic_dir.glob("*.json"))
    }
    write_json(results_dir / "raw-deterministic-predictions.json", deterministic_predictions)
    if (model_output / "model-run-index.json").exists():
        shutil.copy2(model_output / "model-run-index.json", results_dir / "raw-model-predictions.json")
    if args.bachi_validation_metrics:
        shutil.copy2(args.bachi_validation_metrics, results_dir / "bachi-validation-metrics.json")
    report = render_report(
        summary=summary,
        prepared=prepared,
        manifest=selection,
        run_manifest=run_manifest,
        bachi_validation=read_json(args.bachi_validation_metrics) if args.bachi_validation_metrics else None,
    )
    (results_dir / "REPORT.md").write_text(report, encoding="utf-8")
    print(json.dumps({"results_dir": str(results_dir), "groups": summary["groups"]}, indent=2))
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="Run the Chorale DCML harmony-analysis pilot")
    subparsers = root.add_subparsers(dest="command", required=True)
    command = subparsers.add_parser("run", help="prepare, infer, score, and report")
    command.add_argument("--corpus", type=Path, required=True)
    command.add_argument("--run-dir", type=Path, required=True)
    command.add_argument("--results-dir", type=Path, default=PACKAGE_ROOT / "results" / _run_id())
    command.add_argument("--selection", type=Path, default=DEFAULT_SELECTION)
    command.add_argument("--schema", type=Path, default=DEFAULT_SCHEMA)
    command.add_argument("--skill", type=Path, default=DEFAULT_SKILL)
    command.add_argument("--models", nargs="+", default=["gpt-5.6-terra", "gpt-5.6-luna"])
    command.add_argument(
        "--conditions", nargs="+",
        choices=["model_score_only", "model_skill_evidence", "model_skill_evidence_fewshot", "model_skill_bachi", "model_skill_bachi_fewshot"],
        default=["model_score_only", "model_skill_evidence"],
    )
    command.add_argument("--bachi-prediction-dir", type=Path)
    command.add_argument("--few-shot", type=Path, default=DEFAULT_FEW_SHOT)
    command.add_argument(
        "--reuse-model-results", type=Path, action="append", default=[],
        help="merge a prior model-run-index.json without rerunning those calls",
    )
    command.add_argument("--bachi-validation-metrics", type=Path)
    command.add_argument("--effort", choices=["low", "medium", "high", "xhigh", "max"], default="medium")
    command.add_argument("--timeout-seconds", type=int, default=300)
    command.add_argument("--parallelism", type=int, default=2)
    command.add_argument("--skip-models", action="store_true")
    command.add_argument("--exploratory", action="store_true", help="mark a rerun after held-out inspection")
    command.set_defaults(func=run)
    return root


def main() -> None:
    args = parser().parse_args()
    raise SystemExit(args.func(args))


if __name__ == "__main__":
    main()
