from __future__ import annotations

from pathlib import Path
from typing import Any


def _pct(value: float | None) -> str:
    return "n/a" if value is None else f"{100 * value:.1f}%"


def _num(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.1f}"


def render_report(
    *,
    summary: dict[str, Any],
    prepared: dict[str, Any],
    manifest: dict[str, Any],
    run_manifest: dict[str, Any],
    bachi_validation: dict[str, Any] | None = None,
) -> str:
    lines = [
        "# DCML Mozart harmony-analysis pilot results",
        "",
        f"Run ID: `{run_manifest['run_id']}`  ",
        f"Corpus: `DCMLab/mozart_piano_sonatas` at `{prepared['corpus']['commit']}` (`{prepared['corpus']['release']}`)  ",
        f"License: {prepared['corpus']['license']} (noncommercial pilot; attribution retained)  ",
        f"Models: {', '.join(f'`{model}`' for model in run_manifest['models'])}, reasoning `{run_manifest['effort']}`  ",
        "Actual monetary cost: unavailable from ChatGPT-authenticated Codex JSONL; token usage and latency are reported where supplied.",
        "",
        "## Result",
        "",
        "| Model | Condition | Scored | Reduced harmony | Local key | Root | Quality | Inversion | Boundary F1 (≤¼ qb) | Unsupported evidence | Mean latency |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for group in summary["groups"]:
        lines.append(
            f"| {group['model']} | {group['condition']} | {group['cases_scored']}/{group['cases_total']} | "
            f"{_pct(group['harmony_exact'])} | {_pct(group['local_key_accuracy'])} | {_pct(group['root_accuracy'])} | "
            f"{_pct(group['quality_accuracy'])} | {_pct(group['inversion_accuracy'])} | {_pct(group['boundary_f1'])} | "
            f"{_pct(group['unsupported_note_claim_rate'])} | {_num(group['mean_latency_seconds'])} s |"
        )
    lines.extend([
        "",
        "“Reduced harmony” is duration-weighted exact agreement on normalized local key plus the full DCML chord token. "
        "Root spelling, chord quality, inversion, and boundaries remain separate so one normalization choice cannot hide another error.",
        "BACHI does not predict local key or Roman numeral, so those two cells are intentionally `n/a`; its inversion is derived from predicted root, quality, and bass.",
        "",
        "## Corpus selection",
        "",
        "Development-only movements were `K279-1` and `K280-2`; no held-out labels or passages were used as prompt examples. "
        "The six scored passages come from six other complete movements/works, reducing direct prompt tuning leakage.",
        "",
        "| Opaque case | Auditable source passage | Measures | Quarter-beats | Note heads | Gold spans | Why selected |",
        "|---|---|---:|---:|---:|---:|---|",
    ])
    selection_by_id = {item["case_id"]: item for item in manifest["held_out"]}
    for row in prepared["coverage"]:
        selected = selection_by_id[row["case_id"]]
        lines.append(
            f"| {row['case_id']} | {row['movement']} mc {selected['start_mc']}–{selected['end_mc']} | "
            f"{row['measures']} | {row['duration_qb']} | {row['note_events']} | {row['gold_spans']} | {row['rationale']} |"
        )
    total_qb = sum(float(row["duration_qb"]) for row in prepared["coverage"])
    total_spans = sum(row["gold_spans"] for row in prepared["coverage"])
    lines.extend([
        "",
        f"Coverage: {len(prepared['coverage']) * 8} written measures, {total_qb:g} quarter-beats, and {total_spans} chord-bearing reference spans.",
        "",
        "## Execution and usage",
        "",
    ])
    for group in summary["groups"]:
        usage = group.get("usage")
        usage_text = ", ".join(f"{key}={value}" for key, value in sorted(usage.items())) if usage else "not reported"
        lines.append(
            f"- `{group['model']}` / `{group['condition']}`: {group['execution_failures']} execution failures; "
            f"schema-valid rate {_pct(group['schema_valid_rate'])}; usage {usage_text}."
        )
    lines.extend([
        "",
        "Each model call ran in a fresh bubblewrap namespace. Only one opaque sanitized case, the output schema, and—in a guided condition—the "
        "task skill plus either deterministic evidence or BACHI proposals were mounted. Shell, code execution, apps, plugins, browser/computer use, skill search, recommendations, "
        "image generation, and multi-agent features were disabled. The corpus clone, gold TSVs, repository, prior predictions, and scoring outputs were not mounted. "
        "Predictions were saved before the evaluator joined them to gold.",
        "",
        "## Representative aligned cases",
        "",
    ])
    for group in summary["groups"]:
        group_rows = [row for row in summary["cases"] if row["model"] == group["model"] and row["condition"] == group["condition"] and row["status"] == "ok"]
        if not group_rows:
            continue
        lines.append(f"### {group['model']} / {group['condition']}")
        for label in ("correct", "incorrect"):
            candidates = [
                (row, row["score"]["representative"].get(label))
                for row in group_rows
                if row["score"]["representative"].get(label)
            ]
            if not candidates:
                continue
            row, example = candidates[0]
            start = example["start"]
            end = example["end"]
            lines.append(
                f"- {label.title()} in {row['case_id']} at displayed m. {start['measure']} + {start['offset_qb']} qb to m. {end['measure']} + {end['offset_qb']} qb: "
                f"reference `{example['reference']['local_key']} {example['reference']['roman']}`; "
                f"prediction `{example['prediction']['local_key']} {example['prediction']['roman']}`."
            )
        lines.append("")
    lines.extend([
        "## Interpretation and recommendation",
        "",
    ])
    guided_deltas = []
    by_model = {(row["model"], row["condition"]): row for row in summary["groups"]}
    for model in run_manifest["models"]:
        score_only = by_model.get((model, "model_score_only"))
        guided = by_model.get((model, "model_skill_evidence"))
        if score_only and guided and score_only["harmony_exact"] is not None and guided["harmony_exact"] is not None:
            guided_deltas.append((model, guided["harmony_exact"] - score_only["harmony_exact"]))
    if guided_deltas:
        lines.append("Observed guided-minus-score-only reduced-harmony deltas: " + "; ".join(f"`{model}` {delta:+.1%}" for model, delta in guided_deltas) + ".")
    terra_hybrid = by_model.get(("gpt-5.6-terra", "model_skill_bachi"))
    terra_score = by_model.get(("gpt-5.6-terra", "model_score_only"))
    terra_guided = by_model.get(("gpt-5.6-terra", "model_skill_evidence"))
    astra_score = by_model.get(("gpt-6-astra", "model_score_only"))
    astra_guided = by_model.get(("gpt-6-astra", "model_skill_evidence"))
    astra_guided_fewshot = by_model.get(("gpt-6-astra", "model_skill_evidence_fewshot"))
    astra_bachi = by_model.get(("gpt-6-astra", "model_skill_bachi"))
    astra_bachi_fewshot = by_model.get(("gpt-6-astra", "model_skill_bachi_fewshot"))
    sol_guided = by_model.get(("gpt-5.6-sol", "model_skill_evidence"))
    luna_score = by_model.get(("gpt-5.6-luna", "model_score_only"))
    luna_guided = by_model.get(("gpt-5.6-luna", "model_skill_evidence"))
    if terra_score and terra_guided and luna_score and luna_guided:
        hybrid_text = ""
        if terra_hybrid and terra_hybrid["harmony_exact"] is not None:
            hybrid_text = (
                f" Terra+BACHI reached {_pct(terra_hybrid['harmony_exact'])}, "
                f"{terra_hybrid['harmony_exact'] - terra_score['harmony_exact']:+.1%} vs score-only and "
                f"{terra_hybrid['harmony_exact'] - terra_guided['harmony_exact']:+.1%} vs skill+music21."
            )
        astra_text = ""
        if astra_score and astra_guided:
            astra_text = (
                f" Astra+skill+music21 reached {_pct(astra_guided['harmony_exact'])}, "
                f"{astra_guided['harmony_exact'] - astra_score['harmony_exact']:+.1%} vs Astra score-only, "
                "but remains far below an 85% product threshold."
            )
        astra_guided_fewshot_text = ""
        if astra_guided and astra_guided_fewshot:
            astra_guided_cases = {
                row["case_id"]: row for row in summary["cases"]
                if row["model"] == "gpt-6-astra" and row["condition"] == "model_skill_evidence" and row["status"] == "ok"
            }
            astra_guided_fewshot_cases = {
                row["case_id"]: row for row in summary["cases"]
                if row["model"] == "gpt-6-astra" and row["condition"] == "model_skill_evidence_fewshot" and row["status"] == "ok"
            }
            guided_regressed = sum(
                astra_guided_fewshot_cases[case_id]["score"]["metrics"]["harmony_exact"]
                < row["score"]["metrics"]["harmony_exact"]
                for case_id, row in astra_guided_cases.items()
                if case_id in astra_guided_fewshot_cases
            )
            astra_guided_fewshot_text = (
                f" Adding the same static contrastive block to Astra+skill+music21 reached "
                f"{_pct(astra_guided_fewshot['harmony_exact'])}, a "
                f"{astra_guided_fewshot['harmony_exact'] - astra_guided['harmony_exact']:+.1%} change, "
                f"with regressions on {guided_regressed}/{len(astra_guided_cases)} passages. "
                "This is tuned exploratory evidence because the error classes came from this benchmark."
            )
        astra_hybrid_text = ""
        if astra_bachi and astra_bachi_fewshot:
            astra_bachi_cases = {
                row["case_id"]: row for row in summary["cases"]
                if row["model"] == "gpt-6-astra" and row["condition"] == "model_skill_bachi" and row["status"] == "ok"
            }
            astra_fewshot_cases = {
                row["case_id"]: row for row in summary["cases"]
                if row["model"] == "gpt-6-astra" and row["condition"] == "model_skill_bachi_fewshot" and row["status"] == "ok"
            }
            regressed = sum(
                astra_fewshot_cases[case_id]["score"]["metrics"]["harmony_exact"]
                < row["score"]["metrics"]["harmony_exact"]
                for case_id, row in astra_bachi_cases.items()
                if case_id in astra_fewshot_cases
            )
            astra_hybrid_text = (
                f" Astra+skill+BACHI reached {_pct(astra_bachi['harmony_exact'])}; adding the static contrastive block reached "
                f"{_pct(astra_bachi_fewshot['harmony_exact'])}, a {astra_bachi_fewshot['harmony_exact'] - astra_bachi['harmony_exact']:+.1%} change. "
                f"It nevertheless regressed on {regressed}/{len(astra_bachi_cases)} individual passages. "
                "Because the error classes were selected from this benchmark, that few-shot delta is tuned exploratory evidence."
            )
        sol_text = ""
        if sol_guided and astra_guided and terra_guided:
            sol_text = (
                f" Sol+skill+music21 reached {_pct(sol_guided['harmony_exact'])}, "
                f"{sol_guided['harmony_exact'] - terra_guided['harmony_exact']:+.1%} vs Terra and "
                f"{sol_guided['harmony_exact'] - astra_guided['harmony_exact']:+.1%} vs Astra on the same guided condition."
            )
        recommendation = (
            "**Next-release recommendation: no-ship for authoritative or default model analysis.** "
            f"Terra with skill/evidence changed reduced harmony by {terra_guided['harmony_exact'] - terra_score['harmony_exact']:+.1%} "
            f"and reached {_pct(terra_guided['harmony_exact'])}, but its inversion and boundary results remain mixed. "
            f"{hybrid_text} "
            f"{astra_text} "
            f"{astra_guided_fewshot_text} "
            f"{astra_hybrid_text} "
            f"{sol_text} "
            f"Luna changed reduced harmony by {luna_guided['harmony_exact'] - luna_score['harmony_exact']:+.1%}. "
            "Keep Astra+skill+music21 as the untuned reference and evaluate the contrastive/key-segmentation idea on a fresh blinded split before selecting it; keep any product exposure experimental, "
            "reviewable, and clearly separated from deterministic facts."
        )
    else:
        recommendation = (
            "**Next-release recommendation: no-ship for authoritative or default model analysis.** "
            "Run a larger blinded, repeated-sample benchmark before product exposure."
        )
    lines.extend([
        "",
        recommendation,
        "",
        "Do not treat this pilot as general Mozart accuracy or ship model-authored harmony as authoritative. "
        "Use the result to decide whether evidence-assisted analysis merits a larger, blinded benchmark with more works, multiple samples, "
        "human adjudication, and explicit special-chord coverage. Even a positive delta supports only an experimental, reviewable analysis path; "
        "deterministic note/time facts should remain visibly distinct from heuristic harmonic interpretation.",
        "",
        "## Limitations",
        "",
        "- Six passages are a small, deliberately varied pilot; confidence intervals and repeated-sample variance are not estimated.",
        "- Public, famous repertoire may be memorized even when filenames and annotations are hidden. The mid-movement selection lowers but cannot remove that risk.",
        "- `music21` chordification treats every sounding pitch literally; ornaments and suspensions can produce analytically implausible candidates.",
        "- The reduced exact metric does not yet fully decompose DCML changes, relative-root chains, pedals, or augmented-sixth special encodings.",
        "- Cadence and phrase-boundary accuracy is intentionally not reported; voice-leading has no complete DCML gold standard here.",
        "- The note facet contains note heads, not explicit rests. Silence is inferred only from the absence of active note segments.",
    ])
    if astra_bachi_fewshot or astra_guided_fewshot:
        lines.append(
            "- The contrastive few-shot categories were chosen after inspecting errors on these same six passages. The examples are synthetic, but the resulting score is tuned-on-benchmark and not held-out accuracy."
        )
    if bachi_validation:
        lines.extend([
            "- BACHI's eight-piece sample comes from its official validation partition, which may have influenced checkpoint selection; it is not a pristine external test.",
            "",
            "## BACHI official-validation sample",
            "",
            "Eight piece identifiers were randomly selected with seed 20260920 after reproducing BACHI's seed-42 piece split. "
            "Equal-piece macro prevents long works from dominating; duration-weighted values expose that duration imbalance.",
            "",
            "| Aggregate | Root | Quality | Bass | Full chord | Boundary F1 (≤¼ qb) |",
            "|---|---:|---:|---:|---:|---:|",
            f"| Equal-piece macro | {_pct(bachi_validation['macro']['root'])} | {_pct(bachi_validation['macro']['quality'])} | {_pct(bachi_validation['macro']['bass'])} | {_pct(bachi_validation['macro']['chord'])} | {_pct(bachi_validation['macro']['boundary_f1'])} |",
            f"| Duration-weighted | {_pct(bachi_validation['duration_weighted']['root'])} | {_pct(bachi_validation['duration_weighted']['quality'])} | {_pct(bachi_validation['duration_weighted']['bass'])} | {_pct(bachi_validation['duration_weighted']['chord'])} | {_pct(bachi_validation['duration_weighted']['boundary_f1'])} |",
            "",
            "| Piece | Root | Quality | Bass | Full chord | Boundary F1 |",
            "|---|---:|---:|---:|---:|---:|",
        ])
        for piece in bachi_validation["pieces"]:
            metrics = piece["metrics"]
            lines.append(
                f"| `{piece['piece_id']}` | {_pct(metrics['root'])} | {_pct(metrics['quality'])} | "
                f"{_pct(metrics['bass'])} | {_pct(metrics['chord'])} | {_pct(metrics['boundary_f1'])} |"
            )
    lines.extend([
        "",
        "## Reproduce",
        "",
        "```bash",
        "cd experiments/dcml-harmony-eval",
        "uv sync --extra dev --frozen",
        "uv run chorale-dcml-eval run \\",
        f"  --corpus /path/to/mozart_piano_sonatas-at-{prepared['corpus']['commit'][:8]} \\",
        "  --run-dir /tmp/chorale-dcml-eval-run \\",
        f"  --results-dir results/{run_manifest['run_id']} \\",
        "  --models gpt-5.6-sol --conditions model_skill_evidence \\",
        "  --effort medium --exploratory",
        "```",
        "",
        "The corpus checkout must be at the exact pinned commit. The run directory contains private gold joins and must stay outside model-visible staging and version control.",
        "",
    ])
    return "\n".join(lines)
