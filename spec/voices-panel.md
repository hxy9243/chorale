---
title: Voices Panel
status: implemented
source_files:
  - src/components/VoicesPanel.tsx
  - src/components/AudioPlayer.tsx
  - src/music/voiceMixer.ts
  - src/music/instruments.ts
  - src/music/staffInstruments.ts
  - src/music/abcPrograms.ts
  - src/utils/abcAudio.ts
  - src/components/StaffInstruments.tsx
  - src/components/SheetMusicView.tsx
  - src/App.tsx
  - src/chorale-theme.css
test_files:
  - src/components/__tests__/VoicesPanel.test.tsx
  - src/components/__tests__/AudioPlayer.test.tsx
  - src/music/__tests__/voiceMixer.test.ts
  - src/music/__tests__/staffInstruments.test.ts
  - src/components/__tests__/StaffInstruments.test.tsx
  - src/test/staffSounds.test.tsx
related_specs:
  - spec/playback-dock.md
---

# Staff sound controls

The existing engraved part label (for example “Piano”) is the sound-control
button. Preserve its text and position; add no duplicate labels, button boxes, or
extra notation padding. It opens instrument, Preview, Mute and Solo controls for
the associated staff. A brace label spanning two staves opens both staff rows,
with instrument selection remaining independent for each staff. Unlabelled staves
do not gain a synthetic control.
The playback dock no longer has a Voices entry. Controls are sibling overlays;
React never owns children of the abcjs SVG container. Existing SVG labels receive
accessible button attributes and managed DOM listeners. The popup is a fixed
portal at the document level, above annotation editors and outside score clipping.
It follows its label during resize, scrolling and zoom. Clicking outside the
popup and its trigger, or moving keyboard focus outside, dismisses it. Pointer
interaction inside and moving the mouse across it keep it open. Escape and close
restore focus to the label; outside clicks keep focus on their chosen target.

Staff identity is the set of ABC voice IDs grouped on that staff by the parsed
score (including `%%score` / `%%staves`). Selecting an instrument updates all voices
on that staff through explicit voice-scoped ABC MIDI program instructions, including
later program changes on those voices. Other staves, notes, names, comments, and
layout directives are preserved. An unnamed single-staff score needs no synthetic
voice declaration. Different existing sounds are shown as “Mixed sounds”.

ABC is the instrument source of truth: source edits update the buttons and playback;
button edits enter the usual saved document revision and Undo/Redo history. Source
instrument edits are disabled during proposal or uncommitted sheet previews.
Legacy local instrument overrides must never override source programs.

Search covers all supported General MIDI sounds with readable names and families.
Arrow keys navigate, Enter chooses, Escape dismisses. Preview plays a short sample,
ignores staff mute/solo, and respects master volume. Only one preview can play;
stop, close, score switch or source replacement cancels obsolete samples.

Mute and Solo apply to every resolved track belonging to the staff. They remain
local listening settings keyed by document and stable staff identity, without
changing notation. Multiple solos may sound together; mute takes precedence.
Generated accompaniment is silenced while a staff is soloed. Reset listening clears
mute/solo while keeping source instruments. Removed staves cannot leave stale solos.
Audio mixing clones the source sequence and preserves notes, timing and dynamics.
Listening changes rebuild the shared transport at its current position and speed.
