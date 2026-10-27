from __future__ import annotations

import argparse
import csv
import json
import shutil
from collections import defaultdict
from pathlib import Path
from typing import Any

from .util import read_json, write_json


DISPLAY = {
    "gpt-5.6-luna": "Luna xhigh",
    "gpt-5.6-terra": "Terra xhigh",
    "gpt-5.6-sol": "Sol high",
    "gpt-6-astra": "Astra medium",
    "openrouter/deepseek/deepseek-v4.1-flash": "DeepSeek V4.1 Flash high",
    "openrouter/z-ai/glm-5.2": "GLM 5.2 high",
    "openrouter/moonshotai/kimi-k3": "Kimi K3 high",
}


def pct(value: float | None) -> str:
    return "n/a" if value is None else f"{100 * value:.1f}%"


def seconds(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.1f}s"


def money(value: float | None) -> str:
    return "n/a" if value is None else f"${value:.3f}"


def model_name(group: dict[str, Any]) -> str:
    return DISPLAY.get(group["model"], f"{group['model']} {group['effort']}")


def _historic_rows(historic_dir: Path) -> list[dict[str, Any]]:
    metrics = read_json(historic_dir / "exploratory-20260920-sol-music21" / "metrics.json")
    lookup = {(row["model"], row["condition"]): row for row in metrics["groups"]}
    order = [
        ("music21-9.9.1", "music21", "music21 only"),
        ("gpt-5.6-luna", "model_score_only", "Luna medium + score"),
        ("gpt-5.6-luna", "model_skill_evidence", "Luna medium + SKILL + music21"),
        ("gpt-5.6-terra", "model_score_only", "Terra medium + score"),
        ("gpt-5.6-terra", "model_skill_evidence", "Terra medium + SKILL + music21"),
        ("gpt-5.6-terra", "model_skill_bachi", "Terra medium + SKILL + BACHI"),
        ("gpt-5.6-sol", "model_skill_evidence", "Sol medium + SKILL + music21"),
        ("gpt-6-astra", "model_score_only", "Astra medium + score"),
        ("gpt-6-astra", "model_skill_evidence", "Astra medium + SKILL + music21"),
        ("gpt-6-astra", "model_skill_bachi", "Astra medium + SKILL + BACHI"),
        ("gpt-6-astra", "model_skill_bachi_fewshot", "Astra medium + SKILL + BACHI + tuned few-shot"),
        ("gpt-6-astra", "model_skill_evidence_fewshot", "Astra medium + SKILL + music21 + tuned few-shot"),
    ]
    return [{"label": label, **lookup[(model, condition)]} for model, condition, label in order]


def _bachi_summary(historic_dir: Path) -> dict[str, Any]:
    result_dir = historic_dir / "exploratory-20260920-astra-bachi-fewshot"
    metrics = read_json(result_dir / "metrics.json")
    direct = next(row for row in metrics["groups"] if row["condition"] == "bachi")
    validation = read_json(result_dir / "bachi-validation-metrics.json")
    return {"direct": direct, "validation": validation}


def _group_rows(metrics: dict[str, Any]) -> list[dict[str, Any]]:
    corpus_order = {"DCML": 0, "BACHI validation": 1}
    return sorted(
        metrics["groups"],
        key=lambda row: (
            corpus_order.get(row["corpus"], 9),
            -(row["duration_weighted"]["harmony_exact"] or -1),
            model_name(row),
        ),
    )


def _case_analysis(metrics: dict[str, Any]) -> dict[str, Any]:
    by_model: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_case: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in metrics["cases"]:
        by_model[row["model"]].append(row)
        by_case[(row["corpus"], row["case_id"])].append(row)
    target_counts = {}
    for model, rows in by_model.items():
        target_counts[model] = sum(
            row.get("score") is not None and row["score"]["metrics"]["harmony_exact"] >= 0.85
            for row in rows
        )
    ranked_cases = []
    for (corpus, case_id), rows in by_case.items():
        scored = [row for row in rows if row.get("score")]
        if not scored:
            continue
        best = max(scored, key=lambda row: row["score"]["metrics"]["harmony_exact"])
        ranked_cases.append({
            "corpus": corpus,
            "case_id": case_id,
            "best_exact": best["score"]["metrics"]["harmony_exact"],
            "best_model": best["model"],
        })
    ranked_cases.sort(key=lambda row: row["best_exact"])
    return {"target_counts": target_counts, "hardest_cases": ranked_cases[:8]}


def _failure_analysis(metrics: dict[str, Any]) -> list[dict[str, Any]]:
    counts: dict[tuple[str, str], int] = defaultdict(int)
    for row in metrics["cases"]:
        if row["status"] == "ok":
            continue
        error = (row.get("error") or "").lower()
        if "credit" in error or "402:" in error:
            category = "OpenRouter credit rejection"
        elif row["status"] == "timeout":
            category = "Timeout"
        elif "inappropriate content" in error:
            category = "Upstream content filter"
        elif row["status"] == "schema_error":
            category = "Malformed structured output"
        else:
            category = "Other execution error"
        counts[(row["model"], category)] += 1
    return [
        {"model": model, "category": category, "count": count}
        for (model, category), count in sorted(counts.items())
    ]


def _write_csv(path: Path, metrics: dict[str, Any]) -> None:
    fields = [
        "corpus", "model", "display_name", "effort", "cases_scored", "cases_total",
        "schema_valid_rate", "exact_key_roman", "ci95_low", "ci95_high", "local_key",
        "root", "quality", "inversion", "boundary_f1", "coverage", "unsupported_claim_rate",
        "mean_latency_seconds", "input_tokens", "output_tokens", "reasoning_tokens", "cost_usd",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for group in _group_rows(metrics):
            weighted = group["duration_weighted"]
            interval = group["bootstrap_95"]["harmony_exact"] or {}
            usage = group.get("usage") or {}
            writer.writerow({
                "corpus": group["corpus"],
                "model": group["model"],
                "display_name": model_name(group),
                "effort": group["effort"],
                "cases_scored": group["cases_scored"],
                "cases_total": group["cases_total"],
                "schema_valid_rate": group["schema_valid_rate"],
                "exact_key_roman": weighted["harmony_exact"],
                "ci95_low": interval.get("low"),
                "ci95_high": interval.get("high"),
                "local_key": weighted["local_key_accuracy"],
                "root": weighted["root_accuracy"],
                "quality": weighted["quality_accuracy"],
                "inversion": weighted["inversion_accuracy"],
                "boundary_f1": group["boundary_f1"],
                "coverage": weighted["coverage"],
                "unsupported_claim_rate": weighted["unsupported_note_claim_rate"],
                "mean_latency_seconds": group["mean_latency_seconds"],
                "input_tokens": usage.get("input", usage.get("input_tokens")),
                "output_tokens": usage.get("output", usage.get("output_tokens")),
                "reasoning_tokens": usage.get("reasoning", usage.get("reasoning_output_tokens")),
                "cost_usd": group.get("monetary_cost_usd"),
            })


def render_report(metrics: dict[str, Any], historic: list[dict[str, Any]], bachi: dict[str, Any], manifest: dict[str, Any]) -> str:
    groups = _group_rows(metrics)
    cases = _case_analysis(metrics)
    by_corpus: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for group in groups:
        by_corpus[group["corpus"]].append(group)
    complete_dcml = [row for row in by_corpus["DCML"] if row["cases_scored"] == row["cases_total"]]
    complete_bachi = [row for row in by_corpus["BACHI validation"] if row["cases_scored"] == row["cases_total"]]
    best_dcml = max(complete_dcml, key=lambda row: row["duration_weighted"]["harmony_exact"])
    best_bachi = max(complete_bachi, key=lambda row: row["duration_weighted"]["harmony_exact"])
    astra_dcml = next(row for row in by_corpus["DCML"] if row["model"] == "gpt-6-astra")
    astra_bachi = next(row for row in by_corpus["BACHI validation"] if row["model"] == "gpt-6-astra")
    external = [
        row for row in groups
        if row["model"].startswith("openrouter/") and row["cases_scored"] == row["cases_total"]
    ]
    external_best = max(external, key=lambda row: row["duration_weighted"]["harmony_exact"]) if external else None
    total_cost = sum(row.get("monetary_cost_usd") or 0 for row in groups)
    total_recorded = sum(1 for _ in metrics["cases"])
    total_scored = sum(row["cases_scored"] for row in groups)
    failures = _failure_analysis(metrics)

    lines = [
        "# Final report: evidence-assisted chord analysis",
        "",
        "## Executive conclusion",
        "",
        f"The product signal is real but not release-ready. On the fresh twenty-passage benchmark, **{model_name(best_dcml)}** led DCML at **{pct(best_dcml['duration_weighted']['harmony_exact'])}** exact local-key-plus-Roman agreement, while **{model_name(best_bachi)}** led BACHI validation at **{pct(best_bachi['duration_weighted']['harmony_exact'])}**. The 85% target was not reached by any configuration.",
        "",
        f"For the dependency-light product path, Astra medium + SKILL + music21 remains the best-supported choice: {pct(astra_dcml['duration_weighted']['harmony_exact'])} exact on DCML and {pct(astra_bachi['duration_weighted']['harmony_exact'])} on BACHI validation, with DCML root accuracy of {pct(astra_dcml['duration_weighted']['root_accuracy'])}. That is useful for an evidence-linked, editable assistant, but not for silent automatic annotation.",
        "",
    ]
    if external_best:
        lines.append(
            f"The best complete external-model corpus result was **{model_name(external_best)}** on {external_best['corpus']} at {pct(external_best['duration_weighted']['harmony_exact'])}. Provider reliability is part of the result: only {total_scored}/{total_recorded} recorded calls produced scoreable outputs."
        )
        lines.append("")
    lines.extend([
        "## Fresh wide benchmark",
        "",
        "All rows use the same frozen condition: model + SKILL + music21 evidence; no few-shots and no BACHI predictions. Accuracy metrics are duration-weighted. Boundary F1 is an equal-passage macro average. Corpora are reported separately.",
        "",
        "| Corpus | Configuration | Exact key+Roman (95% bootstrap) | Key | Root | Quality | Inversion | Boundary F1 | Valid | Mean latency | Cost reported |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ])
    for group in groups:
        weighted = group["duration_weighted"]
        interval = group["bootstrap_95"]["harmony_exact"]
        ci = "n/a" if interval is None else f"{pct(interval['low'])}--{pct(interval['high'])}"
        lines.append(
            f"| {group['corpus']} | {model_name(group)} | {pct(weighted['harmony_exact'])} ({ci}) | "
            f"{pct(weighted['local_key_accuracy'])} | {pct(weighted['root_accuracy'])} | "
            f"{pct(weighted['quality_accuracy'])} | {pct(weighted['inversion_accuracy'])} | "
            f"{pct(group['boundary_f1'])} | {group['cases_scored']}/{group['cases_total']} | "
            f"{seconds(group['mean_latency_seconds'])} | {money(group.get('monetary_cost_usd'))} |"
        )
    lines.extend([
        "",
        "Cost is available only when the execution interface supplied it. Pi/OpenRouter reported billed cost; the Codex CLI did not, so `n/a` is not zero.",
        "Rows with fewer than 10 valid calls are partial samples and are not used for headline model ranking.",
        "",
        "## What the errors say",
        "",
        "The dominant gap is functional interpretation, not merely pitch-class recognition. Across the strongest rows, root accuracy is materially higher than exact local-key-plus-Roman accuracy. Models often identify the sonority yet miss tonicization versus modulation, applied function, or the precise inversion/seventh spelling.",
        "",
        "The observed failure taxonomy is:",
        "",
        "1. **Local-key framing:** temporary tonicization is promoted to a modulation, or a real local-key change is missed.",
        "2. **Function after root:** the literal root is plausible but the Roman function or applied target is wrong.",
        "3. **Ornament versus chord tone:** accented non-chord tones create spurious roots, sevenths, or boundaries.",
        "4. **Inversion and chromatic spelling:** the bass is visible but is not carried through to the correct figured-bass label.",
        "5. **Boundary granularity:** some models over-segment note onsets while others merge genuine harmonic changes.",
        "6. **Rare chromatic vocabulary:** augmented-sixth and altered predominant sonorities remain unstable.",
        "7. **Provider validity:** timeout, upstream filtering, or malformed JSON can prevent scoring before musical quality is considered.",
        "",
        "Hardest cases by the best score achieved by any valid model:",
        "",
        "| Case | Corpus | Best exact | Best model |",
        "|---|---|---:|---|",
    ])
    for row in cases["hardest_cases"]:
        lines.append(f"| `{row['case_id']}` | {row['corpus']} | {pct(row['best_exact'])} | {DISPLAY.get(row['best_model'], row['best_model'])} |")
    if failures:
        lines.extend([
            "",
            "Execution failures:",
            "",
            "| Configuration | Failure category | Calls |",
            "|---|---|---:|",
        ])
        for failure in failures:
            lines.append(f"| {DISPLAY.get(failure['model'], failure['model'])} | {failure['category']} | {failure['count']} |")
    lines.extend([
        "",
        "Passages reaching the 85% exact target, out of 20:",
        "",
        "| Configuration | Passages >=85% |",
        "|---|---:|",
    ])
    for model, count in sorted(cases["target_counts"].items(), key=lambda item: (-item[1], DISPLAY.get(item[0], item[0]))):
        lines.append(f"| {DISPLAY.get(model, model)} | {count}/20 |")
    lines.extend([
        "",
        "## Earlier six-passage ablations",
        "",
        "These exploratory rows explain why the wide benchmark used SKILL + music21, but they are not generalization estimates. The few-shot prompt was derived from errors on the same six passages and is therefore tuned evidence.",
        "",
        "| Configuration | Exact key+Roman | Root | Boundary F1 |",
        "|---|---:|---:|---:|",
    ])
    for row in historic:
        lines.append(f"| {row['label']} | {pct(row.get('harmony_exact'))} | {pct(row.get('root_accuracy'))} | {pct(row.get('boundary_f1'))} |")
    direct = bachi["direct"]
    validation = bachi["validation"]["duration_weighted"]
    lines.extend([
        "",
        "The ablations show three important non-monotonic effects: guidance can hurt a weaker model (Luna), tuned few-shots can help with BACHI proposals but hurt the music21 path, and more reasoning effort does not guarantee more accuracy. This makes model-and-prompt evaluation necessary; a generic 'more context' or 'more thinking' policy is not sufficient.",
        "",
        "## BACHI cross-reference",
        "",
        f"BACHI itself is useful as a fallible candidate generator, not a solved analyzer. On the six Mozart passages it reached {pct(direct['root_accuracy'])} root, {pct(direct['quality_accuracy'])} quality, {pct(direct['inversion_accuracy'])} inversion, and {pct(direct['boundary_f1'])} boundary F1; it does not predict local key or Roman function. On eight sampled pieces from its official validation partition, duration-weighted performance was {pct(validation['root'])} root, {pct(validation['quality'])} quality, {pct(validation['bass'])} bass, {pct(validation['chord'])} full root-quality-bass, and {pct(validation['boundary_f1'])} boundary F1. Large piece-to-piece variance means the much higher equal-piece macro scores are dominated by short, easy chorales.",
        "",
        "The hybrid result is mixed: BACHI proposals improved Terra on the tuned six-passage set (21.5% to 26.6% exact), but plain Astra + music21 (42.8%) beat plain Astra + BACHI (35.0%). BACHI + tuned few-shots reached 44.0%, too small a gain—and too tuned—to justify the extra production dependency yet.",
        "",
        "## Product recommendation",
        "",
        "1. Keep **Astra medium + SKILL + music21** as the default research candidate because it is the strongest dependency-light configuration on the fresh DCML benchmark.",
        "2. Ship it only as an **assistive draft**: show aligned evidence, per-span confidence, and editable alternatives; abstain or flag low-confidence/local-key-change regions.",
        "3. Make the next accuracy experiment more constrained: generate a deterministic candidate lattice, then have the model rank candidates and segment local keys rather than freely invent every field.",
        "4. Train or retrieve few-shots only from a separate development set, selected by detected error type. The current static few-shot result is useful for ideation but contaminated for validation.",
        "5. Expand to at least 100 passages with stratification by texture, chromaticism, local-key change, and annotation vocabulary; keep DCML and BACHI metrics separate and add human adjudication for convention-sensitive disagreements.",
        "6. Treat the 85% threshold as a gated product metric: require both aggregate exactness and a high rate of individual passages above threshold, plus provider-validity and latency targets.",
        "",
        "## Experimental design and limitations",
        "",
        "- Fresh benchmark: 10 DCML Mozart windows and 10 previously unused BACHI validation pieces, each eight measures, frozen with seed `20260921` before inference.",
        f"- Recorded calls: {manifest['calls_recorded']} of {manifest['calls_expected']} expected across {len(manifest['models'])} configurations; scoreable calls: {total_scored}.",
        "- BACHI validation is not a hidden test set and may have influenced BACHI model selection; it is cross-corpus evidence only.",
        "- The two corpora differ in repertoire and annotation conventions. No pooled headline accuracy is reported.",
        "- The benchmark has one sample per model/case. Bootstrap intervals reflect passage variation, not inference-repeat variance.",
        "- Public repertoire may exist in model training data. Sanitization prevents direct answer access during the run but cannot prove absence of memorization.",
        f"- Pi/OpenRouter cost attached to the retained final call records: {money(total_cost)}. Replaced timeout/schema-error attempts may have incurred additional provider charges that the interrupted interface did not return, so this is not a complete billing total.",
        "",
        "## Reproducibility bundle",
        "",
        "The accompanying archive contains frozen selection and coverage manifests, sanitized cases, music21 evidence, private reference labels, every raw model record and event stream, machine-readable metrics, source prompt assets, schemas, tests, and the experiment specification. It excludes credentials and temporary runtime homes.",
    ])
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results-dir", type=Path, required=True)
    parser.add_argument("--historic-dir", type=Path, required=True)
    parser.add_argument("--outputs-dir", type=Path, required=True)
    args = parser.parse_args()
    args.outputs_dir.mkdir(parents=True, exist_ok=True)
    metrics = read_json(args.results_dir / "metrics.json")
    manifest = read_json(args.results_dir / "run-manifest.json")
    historic = _historic_rows(args.historic_dir)
    bachi = _bachi_summary(args.historic_dir)
    analysis = {**_case_analysis(metrics), "execution_failures": _failure_analysis(metrics)}
    report_path = args.outputs_dir / "final-harmony-analysis-report.md"
    report_path.write_text(render_report(metrics, historic, bachi, manifest), encoding="utf-8")
    _write_csv(args.outputs_dir / "final-harmony-analysis-summary.csv", metrics)
    write_json(args.outputs_dir / "final-harmony-analysis-error-analysis.json", analysis)
    shutil.copy2(args.results_dir / "metrics.json", args.outputs_dir / "final-harmony-analysis-metrics.json")
    shutil.copy2(args.results_dir / "run-manifest.json", args.outputs_dir / "final-harmony-analysis-run-manifest.json")


if __name__ == "__main__":
    main()
