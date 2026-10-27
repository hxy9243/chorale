from __future__ import annotations

from fractions import Fraction
from pathlib import Path

import pytest

from chorale_dcml_eval.corpus import (
    _inversion,
    _local_tonic_tpc,
    active_events,
    load_gold,
    prepare_case,
    validate_sanitized_case,
)
from chorale_dcml_eval.bachi import inversion_from_bass
from chorale_dcml_eval.cli import _merge_records
from chorale_dcml_eval.model_runner import build_prompt
from chorale_dcml_eval.pi_runner import _final_event, _parse_json_object, _validate_prediction
from chorale_dcml_eval.scoring import _boundary_metrics, _pitch_tpc, score_case
from chorale_dcml_eval.wide_benchmark import _key_name


def _case() -> dict:
    return {
        "schema_version": 1,
        "case_id": "case-z9",
        "position_unit": "quarter-beats; offsets are zero-based within the displayed measure",
        "measures": [
            {"measure": 1, "offset_qb": "0", "duration_qb": "4", "time_signature": "4/4", "key_signature_fifths": 0},
            {"measure": 2, "offset_qb": "4", "duration_qb": "4", "time_signature": "4/4", "key_signature_fifths": 0},
        ],
        "events": [
            {"measure": 1, "offset_qb": "0", "duration_qb": "4", "staff": 1, "voice": 1, "pitch": "C5", "midi": 72, "tie": "none", "grace": False},
            {"measure": 1, "offset_qb": "0", "duration_qb": "4", "staff": 2, "voice": 1, "pitch": "C3", "midi": 48, "tie": "none", "grace": False},
            {"measure": 2, "offset_qb": "0", "duration_qb": "4", "staff": 1, "voice": 1, "pitch": "G4", "midi": 67, "tie": "continue", "grace": False},
        ],
    }


def test_sanitizer_rejects_answer_bearing_fields() -> None:
    case = _case()
    case["localkey"] = "V"
    with pytest.raises(ValueError, match="top-level"):
        validate_sanitized_case(case)


def test_active_events_use_exact_rationals_and_tie_segments() -> None:
    case = _case()
    sounding = active_events(case, Fraction(5))
    assert [event["pitch"] for event in sounding] == ["G4"]


def test_prompt_condition_keeps_skill_out_of_score_only() -> None:
    case = _case()
    deterministic = {"estimated_key": "C major", "spans": []}
    score_only = build_prompt(case, "model_score_only", deterministic, "SECRET-SKILL")
    guided = build_prompt(case, "model_skill_evidence", deterministic, "SECRET-SKILL")
    assert "SECRET-SKILL" not in score_only
    assert "SECRET-SKILL" in guided


def test_pi_event_parser_uses_final_assistant_text_usage_and_cost() -> None:
    stdout = "\n".join([
        '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"{\\"case_id\\":\\"case-z9\\",\\"spans\\":[]}"}],"usage":{"input":9,"output":4,"totalTokens":13,"cost":{"total":0.0123}}}}',
        '{"type":"turn_end","message":{"role":"assistant","content":[{"type":"text","text":"{\\"case_id\\":\\"case-z9\\",\\"spans\\":[]}"}],"usage":{"input":9,"output":4,"totalTokens":13,"cost":{"total":0.0123}}}}',
    ])
    text, usage, cost, provider_error = _final_event(stdout)
    assert _parse_json_object(text) == {"case_id": "case-z9", "spans": []}
    assert usage["totalTokens"] == 13
    assert cost == 0.0123
    assert provider_error is None


def test_pi_json_parser_recovers_fenced_output() -> None:
    assert _parse_json_object('```json\n{"case_id":"case-z9","spans":[]}\n```')["case_id"] == "case-z9"


def test_pi_event_parser_preserves_provider_error() -> None:
    stdout = '{"type":"turn_end","message":{"role":"assistant","content":[],"stopReason":"error","errorMessage":"upstream rejected request"}}'
    text, usage, cost, provider_error = _final_event(stdout)
    assert (text, usage, cost) == (None, None, None)
    assert provider_error == "upstream rejected request"


def test_pi_schema_validator_rejects_partial_span() -> None:
    with pytest.raises(ValueError, match="required fields"):
        _validate_prediction({"case_id": "case-z9", "spans": [{"roman": "I"}]}, "case-z9")


def test_bachi_prompt_marks_proposals_fallible() -> None:
    case = _case()
    prediction = {
        "case_id": "case-z9",
        "spans": [{
            "start": {"measure": 1, "offset_qb": "0"},
            "end": {"measure": 2, "offset_qb": "0"},
            "root": "C", "quality": "major", "inversion": "root",
        }],
    }
    prompt = build_prompt(case, "model_skill_bachi", {}, "SECRET-SKILL", prediction)
    assert "SECRET-SKILL" in prompt
    assert "never copy blindly" in prompt
    assert '"root":"C"' in prompt


def test_bachi_fewshot_condition_adds_only_static_contrastive_section() -> None:
    case = _case()
    prediction = {
        "case_id": "case-z9",
        "spans": [{
            "start": {"measure": 1, "offset_qb": "0"},
            "end": {"measure": 2, "offset_qb": "0"},
            "root": "C", "quality": "major", "inversion": "root",
        }],
    }
    baseline = build_prompt(case, "model_skill_bachi", {}, "SECRET-SKILL", prediction)
    fewshot = build_prompt(
        case, "model_skill_bachi_fewshot", {}, "SECRET-SKILL", prediction,
        "SYNTHETIC-CONTRAST",
    )
    marker = "\nSTATIC CONTRASTIVE EXAMPLES"
    assert fewshot.split(marker)[0] == baseline.split("\nSANITIZED SCORE FACTS:")[0]
    assert "SYNTHETIC-CONTRAST" in fewshot
    score_section = "\nSANITIZED SCORE FACTS:" + baseline.split("\nSANITIZED SCORE FACTS:", 1)[1]
    assert fewshot.endswith(score_section)


def test_music21_fewshot_condition_adds_only_static_contrastive_section() -> None:
    case = _case()
    deterministic = {"estimated_key": "C major", "spans": []}
    baseline = build_prompt(case, "model_skill_evidence", deterministic, "SECRET-SKILL")
    fewshot = build_prompt(
        case, "model_skill_evidence_fewshot", deterministic, "SECRET-SKILL",
        few_shot_text="SYNTHETIC-CONTRAST",
    )
    marker = "\nSTATIC CONTRASTIVE EXAMPLES"
    assert fewshot.split(marker)[0] == baseline.split("\nSANITIZED SCORE FACTS:")[0]
    assert "SYNTHETIC-CONTRAST" in fewshot
    score_section = "\nSANITIZED SCORE FACTS:" + baseline.split("\nSANITIZED SCORE FACTS:", 1)[1]
    assert fewshot.endswith(score_section)


def test_bachi_inversion_uses_predicted_bass() -> None:
    assert inversion_from_bass("C", "M", "E") == "first"
    assert inversion_from_bass("D", "D7", "C") == "third"
    assert inversion_from_bass("C", "M", "F#") == "unknown"


def test_bachi_absolute_key_tokens_preserve_mode_and_accidentals() -> None:
    assert _key_name("G") == "G major"
    assert _key_name("g") == "G minor"
    assert _key_name("B-") == "Bb major"
    assert _key_name("e-") == "Eb minor"


def test_reused_records_are_replaced_only_by_same_run_key() -> None:
    old = [{"model": "terra", "condition": "score", "case_id": "a", "prediction": 1}]
    new = [
        {"model": "terra", "condition": "score", "case_id": "a", "prediction": 2},
        {"model": "astra", "condition": "score", "case_id": "a", "prediction": 3},
    ]
    merged = _merge_records(old, new)
    assert len(merged) == 2
    assert next(row for row in merged if row["model"] == "terra")["prediction"] == 2


def test_dcml_tpc_and_inversion_preserve_spelling_and_changes() -> None:
    assert _pitch_tpc("C#") == 7
    assert _pitch_tpc("Db") == -5
    assert _local_tonic_tpc("a", "v") == 4
    assert _local_tonic_tpc("Eb", "I") == -3
    assert _inversion("") == "root"
    assert _inversion("43") == "second"


def test_duration_scoring_penalizes_gaps_and_separates_fields() -> None:
    case = _case()
    prediction = {
        "case_id": "case-z9",
        "spans": [{
            "start": {"measure": 1, "offset_qb": "0"},
            "end": {"measure": 2, "offset_qb": "0"},
            "local_key": "C major", "roman": "I", "root": "C", "quality": "major",
            "inversion": "root", "confidence": 0.9,
            "evidence": [{"measure": 1, "offset_qb": "0", "pitches": ["C5", "C3"], "bass": "C3"}],
        }],
    }
    gold = [{
        "start_qb": "0", "end_qb": "8", "start": {"measure": 1, "offset_qb": "0"},
        "end": {"measure": 2, "offset_qb": "4"}, "local_key": "C major", "roman": "I",
        "root_tpc": 0, "quality": "major", "inversion": "root", "source_position": {"mc": 1},
    }]
    result = score_case(case, prediction, gold)
    assert result["metrics"]["coverage"] == 0.5
    assert result["metrics"]["harmony_exact"] == 0.5
    assert result["metrics"]["unsupported_note_claim_rate"] == 0.0


def test_boundary_matching_is_one_to_one() -> None:
    predicted = [{"start_qb": Fraction(0)}, {"start_qb": Fraction(9, 10)}, {"start_qb": Fraction(11, 10)}]
    gold = [{"start_qb": "0"}, {"start_qb": "1"}]
    metrics = _boundary_metrics(predicted, gold, Fraction(1, 4))
    assert metrics["boundary_recall"] == 1.0
    assert metrics["boundary_precision"] == 0.5


def test_exact_note_duration_uses_source_fraction(tmp_path: Path) -> None:
    corpus = tmp_path
    for folder in ("notes", "measures"):
        (corpus / folder).mkdir()
    (corpus / "measures" / "X.measures.tsv").write_text(
        "mc\tmn\tquarterbeats\tduration_qb\tkeysig\ttimesig\n1\t1\t0\t4.0\t0\t4/4\n2\t2\t4\t4.0\t0\t4/4\n",
        encoding="utf-8",
    )
    (corpus / "notes" / "X.notes.tsv").write_text(
        "mc\tmn\tquarterbeats\tquarterbeats_all_endings\tduration_qb\tmc_onset\tduration\tstaff\tvoice\tgracenote\ttied\tname\tmidi\n"
        "1\t1\t0\t0\t0.3333333333333333\t0\t1/12\t1\t1\t\t\tC4\t60\n"
        "2\t2\t4\t4\t1.0\t0\t1/4\t1\t1\t\t\tD4\t62\n",
        encoding="utf-8",
    )
    case = prepare_case(corpus, {"movement": "X", "start_mc": 1, "end_mc": 1, "case_id": "case-z9"})
    assert case["events"][0]["duration_qb"] == "1/3"
