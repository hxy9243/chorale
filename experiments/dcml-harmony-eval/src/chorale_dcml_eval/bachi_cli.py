from __future__ import annotations

import argparse
from pathlib import Path

from .bachi import (
    download_validation_sample,
    export_case_musicxml,
    prepare_six_case_bachi,
    run_inference,
    score_validation_sample,
)
from .util import read_json


def main() -> None:
    parser = argparse.ArgumentParser(description="BACHI adapter for the DCML harmony experiment")
    subparsers = parser.add_subparsers(dest="command", required=True)

    download = subparsers.add_parser("download-validation")
    download.add_argument("--selection", type=Path, required=True)
    download.add_argument("--destination", type=Path, required=True)

    export = subparsers.add_parser("export-six")
    export.add_argument("--staging", type=Path, required=True)
    export.add_argument("--destination", type=Path, required=True)

    infer = subparsers.add_parser("infer")
    infer.add_argument("--python", type=Path, required=True)
    infer.add_argument("--repository", type=Path, required=True)
    infer.add_argument("--checkpoint", type=Path, required=True)
    infer.add_argument("--inputs", type=Path, required=True)
    infer.add_argument("--outputs", type=Path, required=True)
    infer.add_argument("--num-workers", type=int, default=0)

    prepare = subparsers.add_parser("prepare-six")
    prepare.add_argument("--staging", type=Path, required=True)
    prepare.add_argument("--prediction-text-dir", type=Path, required=True)
    prepare.add_argument("--output-dir", type=Path, required=True)

    score = subparsers.add_parser("score-validation")
    score.add_argument("--selection", type=Path, required=True)
    score.add_argument("--data-dir", type=Path, required=True)
    score.add_argument("--prediction-dir", type=Path, required=True)
    score.add_argument("--output", type=Path, required=True)

    args = parser.parse_args()
    if args.command == "download-validation":
        download_validation_sample(args.selection, args.destination)
    elif args.command == "export-six":
        args.destination.mkdir(parents=True, exist_ok=True)
        for case_path in sorted((args.staging / "cases").glob("*.json")):
            export_case_musicxml(read_json(case_path), args.destination / f"{case_path.stem}.musicxml")
    elif args.command == "infer":
        run_inference(
            python=args.python, repository=args.repository, checkpoint=args.checkpoint,
            inputs=args.inputs, outputs=args.outputs, num_workers=args.num_workers,
        )
    elif args.command == "prepare-six":
        prepare_six_case_bachi(
            staging=args.staging, prediction_text_dir=args.prediction_text_dir,
            output_dir=args.output_dir,
        )
    elif args.command == "score-validation":
        score_validation_sample(args.selection, args.data_dir, args.prediction_dir, args.output)


if __name__ == "__main__":
    main()
