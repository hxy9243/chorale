---
title: Voices Panel
status: implemented
source_files:
  - src/components/VoicesPanel.tsx
  - src/components/AudioPlayer.tsx
  - src/music/voiceMixer.ts
  - src/music/instruments.ts
  - src/App.tsx
  - src/chorale-theme.css
test_files:
  - src/components/__tests__/VoicesPanel.test.tsx
  - src/components/__tests__/AudioPlayer.test.tsx
  - src/music/__tests__/voiceMixer.test.ts
related_specs:
  - spec/playback-dock.md
---

# Voices panel

The playback dock exposes a Voices button opening an accessible, scrollable panel.
The panel dismisses when pointer interaction or keyboard focus moves outside it,
or when the application window loses focus. Focus and pointer interaction within
the panel, including instrument search and its options, keep it open. The Voices
trigger toggles the panel once. Outside dismissal preserves the new focus target;
Escape and the explicit Close action return focus to the trigger. Dismissal stops
any pending or playing instrument preview through the normal unmount cleanup.
Each resolved synthesis track has a readable voice name, instrument choice, Preview,
Mute and Solo. Generated chord/drum tracks remain separately controllable. Voice
identity follows ABC voice IDs rather than names; unnamed parts use Voice 1, etc.

Instrument search filters all General MIDI instruments by readable names and
family. Arrow keys navigate matching options; Enter chooses, Escape dismisses.
The score's original sound is available as From score. MIDI numbers are not the
primary labels. Preview plays a short sample of the chosen instrument independently
of score playback and ignores voice mute/solo, while respecting master volume.
Only one preview plays at a time; stopping, closing or changing scores cancels it.
Preview failures are visible and never leave controls stuck in a loading state.

Mute silences that track. Solo silences every non-solo track, including generated
accompaniment. Multiple solo tracks can sound together; explicit mute takes
precedence over solo. A per-row status explains when another voice's solo is
suppressing it. Reset restores score instruments and clears mute/solo.

Settings are playback-only, stored locally by document and stable voice ID.
They survive closing/reopening the panel and revisiting the score, without
changing ABC source, notation, edit history or shared daemon score revisions.
Invalid persisted settings are ignored. Removed voices cannot suppress remaining
voices through stale solo state.

Audio mixing clones the resolved sequence before soundfont loading, preserving
rhythm, source ranges, dynamics and the original sequence. Changed settings rebuild
the existing shared transport at its current position and speed, resuming if it
was playing. Rebuilds disable controls, cancel obsolete starts, and preserve the
existing source/revision checks. Sheet and ABC shortcuts use the mixed transport.
