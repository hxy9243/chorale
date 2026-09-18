# MIDI Instrument Assignment and Verification

Use this guide when a multivoice score displays the right instrument names but Chorale playback uses the wrong sounds.

## Directive scope in abcjs

`V:` declarations in the ABC header define voices, but they do not make the following `%%MIDI` directive voice-local. Before music begins, abcjs stores `%%MIDI program` and `%%MIDI channel` as tune-wide settings. Repeating them after several header `V:` declarations therefore leaves the last program as the starting sound for every voice.

This looks voice-specific but is not:

```abc
V:1 clef=treble name="Violin"
%%MIDI program 40
V:2 clef=bass name="Cello"
%%MIDI program 42
V:3 clef=treble name="Piano"
%%MIDI program 0
K:A
```

The last header program, acoustic grand piano (`0`), becomes the global default.

## Safe per-voice pattern

Use one header program as the first voice's default. In each voice's music body, select the voice, repeat the current key as an inline field, and only then add the inline MIDI program. The same-key inline field moves abcjs into that voice's music context without adding duration, so the following program applies before the first sounding note.

```abc
V:1 clef=treble name="Violin"
V:2 clef=bass name="Cello"
V:3 clef=treble name="Piano RH"
V:4 clef=bass name="Piano LH"
%%MIDI program 40
K:A
[V:1] [K:A] [I:MIDI program 40] z8 | z8 | c4 e4 |]
[V:2] [K:A] [I:MIDI program 42] z8 | z8 | A,4 E4 |]
[V:3] [K:A] [I:MIDI program 0] C4 E4 | G4 C4 | z8 |]
[V:4] [K:A] [I:MIDI program 0] C,4 G,4 | C,8 | z8 |]
```

Do not put `[I:MIDI program ...]` immediately after `[V:n]` at the start of a voice. At that point abcjs can still treat it as tune-wide initialization, causing every track to inherit one program. Keep the repeated inline key identical to the score's current key.

Common zero-based General MIDI programs used by abcjs are:

- `0`: acoustic grand piano
- `40`: violin
- `41`: viola
- `42`: cello
- `43`: contrabass

Do not infer playback sound from `name=` or `snm=`. Those fields label the engraved staff and do not select a synthesizer patch. Omit `%%MIDI channel` unless the workflow genuinely needs channel-specific behavior; it does not solve per-voice program scoping in the header.

## Repairing an existing Chorale score

1. Read measure 1 and note the current revision.
2. Preserve every note and duration in the measure, adding `[K:<current key>] [I:MIDI program N]` immediately after each voice selector. The inline key must match the score's current key and must precede the MIDI directive.
3. Apply the bounded change with `edit_measures` and the current `expectedRevision`.
4. Re-read measures 1 and 2, because measure serialization can affect the following boundary.
5. Call `list_files` and confirm that the total measure count is unchanged.
6. Confirm that every voice ends exactly with `|]`, not `|] |`.

Do not rewrite pitches, rhythms, annotations, or staff labels merely to repair playback timbre.

## Verification

Textual readback proves that directives were saved, not that abcjs associated them with the intended tracks. Export the resulting ABC, parse it with the same abcjs version used by Chorale, call `setUpAudio({})`, and inspect both the `program` events and the `instrument` field on note events for every track.

For a violin/cello/piano/piano score, the expected result is:

```text
track 1: program 40, note instrument 40
track 2: program 42, note instrument 42
track 3: program 0,  note instrument 0
track 4: program 0,  note instrument 0
```

Also require zero parser warnings, the original measure count, and the expected new revision. If UI verification was requested, confirm a connected Chorale view without calling `open_ui` a second time; only claim that the target score is focused when the connected-view state proves it.
