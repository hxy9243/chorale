from __future__ import annotations

import csv
import hashlib
import json
import re
from fractions import Fraction
from pathlib import Path
from typing import Any, Iterable


def fraction(value: Any) -> Fraction:
    if isinstance(value, Fraction):
        return value
    text = str(value).strip()
    if not text:
        return Fraction(0)
    return Fraction(text)


def fraction_text(value: Fraction | str | int | float) -> str:
    item = fraction(value)
    return str(item.numerator) if item.denominator == 1 else f"{item.numerator}/{item.denominator}"


def load_tsv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def pitch_token(value: str) -> str:
    return (
        value.strip()
        .replace("♭", "-")
        .replace("b", "-")
        .replace("♯", "#")
        .replace(" ", "")
    )


def roman_token(value: str) -> str:
    return re.sub(r"\s+", "", value.strip()).replace("♭", "b").replace("♯", "#")


def mean(values: Iterable[float]) -> float | None:
    items = list(values)
    return sum(items) / len(items) if items else None

