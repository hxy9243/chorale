# Sandboxed music21 review examples

The Pi tool-calling conversations use scripted provider responses. The Python/music21 calls, Bubblewrap isolation, source extraction, tool validation and trace recording are real. No live-model quality or benchmark accuracy claim is made. No provider requests were made.

Each example has the original ABC, exact Python snippet, tool result and complete conversation messages in JSON, plus an ordered JSONL trace under `traces/`. Revision 1 snapshots remain unchanged.

## Dominant inversion in C major

Passed with music21 10.5.0, Python 3.12.3; 1068 ms in the sandbox.

The middle G-major sonority has B in the bass: first inversion. This is a sonority/inversion check, not an automatic functional or cadence judgment.

[Input score](01-inversions.abc) · [Python](01-inversions.py) · [Conversation and result](01-inversions.json) · [JSONL trace](traces/2026-10-23T08-56-52-501Z-01-inversions.jsonl)

## Parallel fifths across two voices

Passed with music21 10.5.0, Python 3.12.3; 1323 ms in the sandbox.

All three successive voice pairs preserve a perfect fifth in similar motion. Whether to revise them depends on the intended style.

[Input score](02-parallel-fifths.abc) · [Python](02-parallel-fifths.py) · [Conversation and result](02-parallel-fifths.json) · [JSONL trace](traces/2026-10-23T08-56-55-950Z-02-parallel-fifths.jsonl)

## Pickup, chromatic pitch and carried tie

Passed with music21 10.5.0, Python 3.12.3; 994 ms in the sandbox.

The pickup remains written measure 0, the explicit C-sharp is preserved, and the tied final D lasts six quarter notes across written measures 3–4.

[Input score](03-pickup-accidental-tie.abc) · [Python](03-pickup-accidental-tie.py) · [Conversation and result](03-pickup-accidental-tie.json) · [JSONL trace](traces/2026-10-23T08-56-59-689Z-03-pickup-accidental-tie.jsonl)

## Isolation checks

A synthetic host file and external connection were inaccessible. The worker ran in a different network namespace. An infinite loop was terminated by the wall-time limit. See [isolation evidence](04-isolation.json).

All three saved traces were audited for complete inputs/code, ordered events, matching tool-call/result IDs and passing verification. See the [trace audit](trace-audit.json).

These small examples verify the tool path and a few expected facts. They are not a musical-analysis benchmark. music21 results still need interpretation against the written score.

Reproduce after installing music21 and Bubblewrap: `node scripts/music21-examples.mjs <output-directory>`.

## Full desktop conversation

The actual Electron renderer, IPC, Pi Agent and bundled tool ran against a local scripted provider and real sandboxed music21. See [desktop result](electron/result.json), [provider requests](electron/provider-requests.json), [trace audit](electron/trace-audit.json) and [screenshot](electron/conversation.png). The provider was simulated; the analysis and desktop integration were real.
