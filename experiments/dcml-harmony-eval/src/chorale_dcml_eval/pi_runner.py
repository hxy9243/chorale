from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from .model_runner import build_prompt
from .util import read_json, sha256_path, write_json


PI_SYSTEM_PROMPT = (
    "You are a harmonic-analysis engine. Follow the user instructions exactly. "
    "Return only one JSON object that conforms to the supplied schema, with no Markdown fences or commentary."
)
RATIONAL_PATTERN = re.compile(r"^-?[0-9]+(?:/[1-9][0-9]*)?$")
INVERSION_VALUES = {"root", "first", "second", "third", "unknown"}


def _pi_command(model: str, effort: str) -> list[str]:
    return [
        "pi",
        "--model", model,
        "--thinking", effort,
        "--mode", "json",
        "--print",
        "--no-session",
        "--no-tools",
        "--no-extensions",
        "--no-skills",
        "--no-prompt-templates",
        "--no-context-files",
        "--system-prompt", PI_SYSTEM_PROMPT,
        "--",
    ]


def _final_event(stdout: str) -> tuple[str | None, dict[str, Any] | None, float | None, str | None]:
    text: str | None = None
    usage: dict[str, Any] | None = None
    cost: float | None = None
    provider_error: str | None = None
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") not in {"message_end", "turn_end"}:
            continue
        message = event.get("message")
        if not isinstance(message, dict) or message.get("role") != "assistant":
            continue
        fragments = [
            item.get("text", "")
            for item in message.get("content", [])
            if isinstance(item, dict) and item.get("type") == "text"
        ]
        if fragments:
            text = "".join(fragments)
        candidate_usage = message.get("usage")
        if isinstance(candidate_usage, dict):
            usage = candidate_usage
            candidate_cost = candidate_usage.get("cost")
            if isinstance(candidate_cost, dict) and isinstance(candidate_cost.get("total"), (int, float)):
                cost = float(candidate_cost["total"])
        if message.get("stopReason") == "error":
            provider_error = str(message.get("errorMessage") or "Provider returned an unspecified error")
    return text, usage, cost, provider_error


def _parse_json_object(text: str | None) -> dict[str, Any]:
    if not text:
        raise ValueError("Pi returned no assistant text")
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()
    try:
        value = json.loads(stripped)
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        value = None
        for index, character in enumerate(stripped):
            if character != "{":
                continue
            try:
                candidate, _ = decoder.raw_decode(stripped[index:])
            except json.JSONDecodeError:
                continue
            if isinstance(candidate, dict):
                value = candidate
                break
        if value is None:
            raise
    if not isinstance(value, dict):
        raise ValueError("Pi response was not a JSON object")
    return value


def _validate_prediction(value: dict[str, Any], case_id: str) -> None:
    if set(value) != {"case_id", "spans"} or value.get("case_id") != case_id:
        raise ValueError("Response did not preserve the top-level case_id and spans contract")
    spans = value.get("spans")
    if not isinstance(spans, list) or not spans:
        raise ValueError("Response spans must be a non-empty array")
    position_keys = {"measure", "offset_qb"}
    span_keys = {"start", "end", "local_key", "roman", "root", "quality", "inversion", "confidence", "evidence"}
    evidence_keys = {"measure", "offset_qb", "pitches", "bass"}
    for index, span in enumerate(spans):
        if not isinstance(span, dict) or set(span) != span_keys:
            raise ValueError(f"Span {index} does not match the required fields")
        for name in ("start", "end"):
            position = span[name]
            if not isinstance(position, dict) or set(position) != position_keys:
                raise ValueError(f"Span {index} {name} is not a valid position")
            if not isinstance(position["measure"], int) or position["measure"] < 1:
                raise ValueError(f"Span {index} {name} has an invalid measure")
            if not isinstance(position["offset_qb"], str) or not RATIONAL_PATTERN.fullmatch(position["offset_qb"]):
                raise ValueError(f"Span {index} {name} has an invalid offset")
        for name in ("local_key", "roman", "root", "quality"):
            if not isinstance(span[name], str):
                raise ValueError(f"Span {index} {name} must be a string")
        if span["inversion"] not in INVERSION_VALUES:
            raise ValueError(f"Span {index} has an invalid inversion")
        if not isinstance(span["confidence"], (int, float)) or isinstance(span["confidence"], bool) or not 0 <= span["confidence"] <= 1:
            raise ValueError(f"Span {index} has an invalid confidence")
        evidence = span["evidence"]
        if not isinstance(evidence, list) or not 1 <= len(evidence) <= 3:
            raise ValueError(f"Span {index} evidence must have one to three items")
        for claim in evidence:
            if not isinstance(claim, dict) or set(claim) != evidence_keys:
                raise ValueError(f"Span {index} has malformed evidence")
            if not isinstance(claim["measure"], int) or claim["measure"] < 1:
                raise ValueError(f"Span {index} evidence has an invalid measure")
            if not isinstance(claim["offset_qb"], str) or not RATIONAL_PATTERN.fullmatch(claim["offset_qb"]):
                raise ValueError(f"Span {index} evidence has an invalid offset")
            if not isinstance(claim["pitches"], list) or not claim["pitches"] or not all(isinstance(item, str) for item in claim["pitches"]):
                raise ValueError(f"Span {index} evidence pitches are invalid")
            if not isinstance(claim["bass"], str):
                raise ValueError(f"Span {index} evidence bass is invalid")


def run_one(
    *,
    case_path: Path,
    schema_path: Path,
    deterministic_path: Path,
    skill_path: Path,
    model: str,
    effort: str,
    condition: str,
    output_root: Path,
    timeout_seconds: int,
    max_output_tokens: int | None,
) -> dict[str, Any]:
    case = read_json(case_path)
    deterministic = read_json(deterministic_path)
    schema = read_json(schema_path)
    prompt = build_prompt(
        case,
        condition,
        deterministic,
        skill_path.read_text(encoding="utf-8"),
    )
    # Codex receives this contract through --output-schema. Pi has no equivalent,
    # so give it the identical schema as compact prompt text.
    prompt = f"{prompt}\nOUTPUT JSON SCHEMA:\n{json.dumps(schema, separators=(',', ':'))}"
    model_slug = model.replace("/", "--")
    call_dir = output_root / model_slug / condition / case["case_id"]
    call_dir.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    stdout = ""
    stderr = ""
    try:
        with tempfile.TemporaryDirectory(prefix="chorale-pi-") as runtime_name:
            runtime_dir = Path(runtime_name)
            environment = os.environ.copy()
            if max_output_tokens is not None:
                auth_path = Path.home() / ".pi" / "agent" / "auth.json"
                if not auth_path.is_file():
                    raise FileNotFoundError(f"Pi auth file is unavailable at {auth_path}")
                shutil.copy2(auth_path, runtime_dir / "auth.json")
                (runtime_dir / "auth.json").chmod(0o600)
                model_id = model.removeprefix("openrouter/")
                write_json(runtime_dir / "models.json", {
                    "providers": {"openrouter": {"modelOverrides": {model_id: {"maxTokens": max_output_tokens}}}},
                })
                environment["PI_CODING_AGENT_DIR"] = str(runtime_dir)
            completed = subprocess.run(
                [*_pi_command(model, effort), prompt],
                cwd=call_dir,
                text=True,
                capture_output=True,
                timeout=timeout_seconds,
                check=False,
                env=environment,
            )
        stdout = completed.stdout
        stderr = completed.stderr
        status = "ok" if completed.returncode == 0 else "execution_error"
        error = None if status == "ok" else f"pi exited with status {completed.returncode}"
    except subprocess.TimeoutExpired as exc:
        status = "timeout"
        error = f"Timed out after {timeout_seconds}s"
        stdout = exc.stdout if isinstance(exc.stdout, str) else ""
        stderr = exc.stderr if isinstance(exc.stderr, str) else ""
    latency = time.perf_counter() - started
    response_text, usage, cost, provider_error = _final_event(stdout)
    prediction = None
    schema_valid = False
    if status == "ok" and provider_error:
        status = "execution_error"
        error = provider_error
    if status == "ok":
        try:
            prediction = _parse_json_object(response_text)
            _validate_prediction(prediction, case["case_id"])
            schema_valid = True
        except (json.JSONDecodeError, ValueError) as exc:
            status = "schema_error"
            error = str(exc)
    record = {
        "case_id": case["case_id"],
        "model": model,
        "effort": effort,
        "condition": condition,
        "transport": "pi/openrouter",
        "status": status,
        "schema_valid": schema_valid,
        "latency_seconds": round(latency, 3),
        "usage": usage,
        "monetary_cost_usd": cost,
        "error": error,
        "prediction": prediction,
        "prompt_sha256": __import__("hashlib").sha256(prompt.encode("utf-8")).hexdigest(),
        "skill_sha256": sha256_path(skill_path),
        "schema_sha256": sha256_path(schema_path),
        "max_output_tokens": max_output_tokens,
        "stdout_event_count": len(stdout.splitlines()),
    }
    write_json(call_dir / "record.json", record)
    (call_dir / "events.jsonl").write_text(stdout, encoding="utf-8")
    if response_text is not None:
        (call_dir / "raw-final.txt").write_text(response_text, encoding="utf-8")
    if stderr:
        (call_dir / "stderr.txt").write_text(stderr[-16000:], encoding="utf-8")
    return record


def run_models(
    *,
    staging: Path,
    schema_path: Path,
    deterministic_dir: Path,
    skill_path: Path,
    model: str,
    effort: str,
    output_root: Path,
    timeout_seconds: int = 600,
    parallelism: int = 1,
    resume: bool = True,
    case_ids: set[str] | None = None,
    max_output_tokens: int | None = None,
) -> list[dict[str, Any]]:
    condition = "model_skill_evidence"
    model_slug = model.replace("/", "--")
    model_root = output_root / model_slug
    case_paths = sorted((staging / "cases").glob("*.json"))
    if case_ids:
        case_paths = [path for path in case_paths if path.stem in case_ids]
    records: list[dict[str, Any]] = []
    jobs = []
    for case_path in case_paths:
        record_path = model_root / condition / case_path.stem / "record.json"
        if resume and record_path.is_file():
            existing = read_json(record_path)
            if existing.get("status") == "ok" and existing.get("schema_valid"):
                records.append(existing)
                continue
        jobs.append({
            "case_path": case_path,
            "schema_path": schema_path,
            "deterministic_path": deterministic_dir / case_path.name,
            "skill_path": skill_path,
            "model": model,
            "effort": effort,
            "condition": condition,
            "output_root": output_root,
            "timeout_seconds": timeout_seconds,
            "max_output_tokens": max_output_tokens,
        })
    total_count = len(records) + len(jobs)
    with ThreadPoolExecutor(max_workers=max(1, parallelism)) as executor:
        futures = [executor.submit(run_one, **job) for job in jobs]
        for future in as_completed(futures):
            records.append(future.result())
            print(f"completed {len(records)}/{total_count}", flush=True)
    records.sort(key=lambda row: row["case_id"])
    write_json(model_root / "model-run-index.json", records)
    return records
