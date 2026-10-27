from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from .bachi import proposals_for_prompt
from .deterministic import evidence_for_prompt
from .util import read_json, sha256_path, write_json


COMMON_INSTRUCTIONS = """Analyze the supplied anonymous symbolic piano passage into non-overlapping harmonic spans.
Use only the supplied file content. Do not use tools, search, identify the composition, retrieve an analysis,
or infer from a remembered edition. Offsets are exact zero-based quarter-beats within each displayed measure.
Every span must cite at least one exact sounding slice. Copy only pitches that really sound at that slice and
give the literal lowest pitch as bass. Cover the complete passage from measure 1 offset 0 through the final
measure's full duration, with ordered adjacent spans and no gaps or overlaps. Use conventional Roman numerals,
preserve applied targets and figured-bass inversions, and emit only JSON matching the supplied schema.
"""


def build_prompt(
    case: dict[str, Any],
    condition: str,
    deterministic: dict[str, Any],
    skill_text: str,
    bachi_prediction: dict[str, Any] | None = None,
    few_shot_text: str | None = None,
) -> str:
    parts = [COMMON_INSTRUCTIONS]
    if condition in {"model_skill_evidence", "model_skill_evidence_fewshot"}:
        parts.extend([
            "\nANALYTICAL SKILL (follow this procedure):\n",
            skill_text,
            "\nDETERMINISTIC EVIDENCE:\n",
            json.dumps(evidence_for_prompt(case, deterministic), separators=(",", ":")),
        ])
        if condition == "model_skill_evidence_fewshot":
            if not few_shot_text:
                raise ValueError("Static contrastive examples are required for model_skill_evidence_fewshot")
            parts.extend([
                "\nSTATIC CONTRASTIVE EXAMPLES (apply the distinctions, not the literal answers):\n",
                few_shot_text,
            ])
    elif condition in {"model_skill_bachi", "model_skill_bachi_fewshot"}:
        if bachi_prediction is None:
            raise ValueError(f"BACHI prediction is required for {condition}")
        parts.extend([
            "\nANALYTICAL SKILL (follow this procedure):\n",
            skill_text,
            "\nFALLIBLE BACHI PROPOSALS:\n",
            "BACHI does not predict local key or Roman numeral. Verify every proposal against the score. "
            "Correct wrong roots, qualities, inversions, or boundaries; merge or split spans when needed; never copy blindly.\n",
            json.dumps(proposals_for_prompt(bachi_prediction), separators=(",", ":")),
        ])
        if condition == "model_skill_bachi_fewshot":
            if not few_shot_text:
                raise ValueError("Static contrastive examples are required for model_skill_bachi_fewshot")
            parts.extend([
                "\nSTATIC CONTRASTIVE EXAMPLES (apply the distinctions, not the literal answers):\n",
                few_shot_text,
            ])
    elif condition != "model_score_only":
        raise ValueError(f"Unknown model condition {condition}")
    parts.extend(["\nSANITIZED SCORE FACTS:\n", json.dumps(case, separators=(",", ":"))])
    return "".join(parts)


def _auth_path() -> Path:
    codex_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    auth = codex_home / "auth.json"
    if not auth.is_file():
        raise FileNotFoundError(f"Codex auth file is unavailable at {auth}")
    return auth


def _runtime_roots() -> list[Path]:
    codex = Path(shutil.which("codex") or "")
    if not codex:
        raise FileNotFoundError("codex CLI not found")
    roots = [Path("/usr"), Path("/bin"), Path("/lib"), Path("/lib64"), Path("/etc")]
    # The installed CLI and Node runtime live under the same version-manager root.
    for parent in codex.parents:
        if parent.name == ".nvm":
            roots.append(parent)
            break
    return [path for path in roots if path.exists()]


def _codex_command(model: str, effort: str) -> list[str]:
    command = [
        "codex", "exec", "-",
        "--model", model,
        "--config", f'model_reasoning_effort="{effort}"',
        "--config", 'approval_policy="never"',
        "--config", "agents.enabled=false",
        "--config", "skills.max_context_tokens=1",
        "--config", "allow_browser_and_computer_use=false",
        "--sandbox", "read-only",
        "--skip-git-repo-check",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--output-schema", "/input/prediction.schema.json",
        "--output-last-message", "/out/last-message.json",
        "--json",
        "--color", "never",
        "--cd", "/input",
    ]
    for feature in (
        "code_mode_host", "unified_exec", "shell_tool", "apps", "plugins",
        "remote_plugin", "skill_search", "recommended_plugins", "browser_use",
        "browser_use_external", "computer_use", "image_generation", "multi_agent",
    ):
        command.extend(["--disable", feature])
    return command


def _bubblewrap_command(input_dir: Path, output_dir: Path, runtime_home: Path, inner: list[str]) -> list[str]:
    command = [
        "bwrap", "--unshare-all", "--share-net", "--die-with-parent",
        "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
        "--dir", "/run", "--dir", "/run/systemd",
        "--ro-bind", "/run/systemd/resolve", "/run/systemd/resolve",
        "--dir", "/home", "--dir", "/home/eval",
        "--bind", str(runtime_home), "/home/eval/.codex",
        "--ro-bind", str(input_dir), "/input",
        "--bind", str(output_dir), "/out",
        "--chdir", "/input",
        "--setenv", "HOME", "/home/eval",
        "--setenv", "CODEX_HOME", "/home/eval/.codex",
        "--setenv", "PATH", os.environ.get("PATH", "/usr/bin:/bin"),
    ]
    for root in _runtime_roots():
        command.extend(["--ro-bind", str(root), str(root)])
    command.extend(inner)
    return command


def _usage_from_jsonl(stdout: str) -> dict[str, Any] | None:
    usage: dict[str, Any] | None = None
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        candidate = event.get("usage")
        if isinstance(candidate, dict):
            usage = candidate
        if event.get("type") == "turn.completed" and isinstance(event.get("usage"), dict):
            usage = event["usage"]
    return usage


def run_one(
    *,
    case_path: Path,
    schema_path: Path,
    deterministic_path: Path,
    skill_path: Path,
    bachi_prediction_path: Path | None,
    few_shot_path: Path | None,
    model: str,
    effort: str,
    condition: str,
    output_root: Path,
    timeout_seconds: int,
) -> dict[str, Any]:
    case = read_json(case_path)
    deterministic = read_json(deterministic_path)
    bachi_prediction = read_json(bachi_prediction_path) if bachi_prediction_path is not None else None
    few_shot_text = few_shot_path.read_text(encoding="utf-8") if few_shot_path is not None else None
    prompt = build_prompt(
        case, condition, deterministic, skill_path.read_text(encoding="utf-8"),
        bachi_prediction, few_shot_text,
    )
    call_dir = output_root / model / condition / case["case_id"]
    input_dir = call_dir / "input"
    output_dir = call_dir / "output"
    input_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    runtime_home = call_dir / "runtime-home"
    runtime_home.mkdir(parents=True, exist_ok=True)
    auth_copy = runtime_home / "auth.json"
    shutil.copy2(_auth_path(), auth_copy)
    auth_copy.chmod(0o600)
    # The isolated process sees only this directory, which contains no gold, corpus path, or prior outputs.
    (input_dir / "prompt.txt").write_text(prompt, encoding="utf-8")
    shutil.copy2(schema_path, input_dir / "prediction.schema.json")
    command = _bubblewrap_command(input_dir, output_dir, runtime_home, _codex_command(model, effort))
    started = time.perf_counter()
    try:
        completed = subprocess.run(
            command,
            input=prompt,
            text=True,
            capture_output=True,
            timeout=timeout_seconds,
            check=False,
        )
        status = "ok" if completed.returncode == 0 else "execution_error"
        error = None if status == "ok" else f"codex exited with status {completed.returncode}"
    except subprocess.TimeoutExpired as exc:
        completed = None
        status = "timeout"
        error = f"Timed out after {timeout_seconds}s"
        stdout = exc.stdout if isinstance(exc.stdout, str) else ""
    latency = time.perf_counter() - started
    stdout = completed.stdout if completed is not None else stdout
    stderr = completed.stderr if completed is not None else ""
    prediction = None
    schema_valid = False
    last_message = output_dir / "last-message.json"
    if status == "ok" and last_message.is_file():
        try:
            prediction = json.loads(last_message.read_text(encoding="utf-8"))
            schema_valid = prediction.get("case_id") == case["case_id"] and isinstance(prediction.get("spans"), list)
            if not schema_valid:
                status = "schema_error"
                error = "Response did not preserve case_id and spans contract"
        except (json.JSONDecodeError, OSError) as exc:
            status = "schema_error"
            error = str(exc)
    record = {
        "case_id": case["case_id"],
        "model": model,
        "effort": effort,
        "condition": condition,
        "status": status,
        "schema_valid": schema_valid,
        "latency_seconds": round(latency, 3),
        "usage": _usage_from_jsonl(stdout),
        "monetary_cost_usd": None,
        "error": error,
        "prediction": prediction,
        "prompt_sha256": sha256_path(input_dir / "prompt.txt"),
        "skill_sha256": sha256_path(skill_path) if condition in {"model_skill_evidence", "model_skill_evidence_fewshot", "model_skill_bachi", "model_skill_bachi_fewshot"} else None,
        "bachi_prediction_sha256": sha256_path(bachi_prediction_path) if bachi_prediction_path is not None else None,
        "few_shot_sha256": sha256_path(few_shot_path) if few_shot_path is not None else None,
        "stdout_event_count": len(stdout.splitlines()),
    }
    write_json(call_dir / "record.json", record)
    (call_dir / "events.jsonl").write_text(stdout, encoding="utf-8")
    shutil.rmtree(runtime_home)
    # Remove prompt/case material after capture; retain only hashes, raw final response and bounded diagnostics.
    shutil.rmtree(input_dir)
    if last_message.is_file():
        shutil.copy2(last_message, call_dir / "raw-final.json")
    shutil.rmtree(output_dir)
    if stderr and status == "ok":
        record["stderr_present"] = True
        write_json(call_dir / "record.json", record)
    return record


def run_models(
    *,
    staging: Path,
    schema_path: Path,
    deterministic_dir: Path,
    skill_path: Path,
    models: list[str],
    conditions: list[str],
    effort: str,
    output_root: Path,
    bachi_prediction_dir: Path | None = None,
    few_shot_path: Path | None = None,
    timeout_seconds: int = 180,
    parallelism: int = 1,
    resume: bool = False,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    case_paths = sorted((staging / "cases").glob("*.json"))
    jobs = []
    for model in models:
        for condition in conditions:
            for case_path in case_paths:
                record_path = output_root / model / condition / case_path.stem / "record.json"
                if resume and record_path.is_file():
                    existing = read_json(record_path)
                    if existing.get("status") == "ok" and existing.get("schema_valid"):
                        records.append(existing)
                        continue
                jobs.append(dict(
            case_path=case_path,
            schema_path=schema_path,
            deterministic_path=deterministic_dir / case_path.name,
            skill_path=skill_path,
            bachi_prediction_path=(bachi_prediction_dir / case_path.name) if condition in {"model_skill_bachi", "model_skill_bachi_fewshot"} and bachi_prediction_dir else None,
            few_shot_path=few_shot_path if condition in {"model_skill_evidence_fewshot", "model_skill_bachi_fewshot"} else None,
            model=model,
            effort=effort,
            condition=condition,
            output_root=output_root,
            timeout_seconds=timeout_seconds,
                ))
    total_count = len(records) + len(jobs)
    with ThreadPoolExecutor(max_workers=max(1, parallelism)) as executor:
        futures = [executor.submit(run_one, **job) for job in jobs]
        for future in as_completed(futures):
            records.append(future.result())
            print(f"completed {len(records)}/{total_count}", flush=True)
    records.sort(key=lambda row: (row["model"], row["condition"], row["case_id"]))
    write_json(output_root / "model-run-index.json", records)
    return records
