# Sheet display and Voices follow-up

## Changes

- The compact zoom control floats at the bottom center of the visible sheet pane. It reserves no layout space, clears the score title, uses a translucent paper background, fades while idle/scrolling, and becomes fully visible on hover or keyboard focus.
- Restored native abcjs engraving paint. Staff and ledger lines are thin filled paths with `stroke="none"`; the previous pale one-pixel border stroke covered their dark geometry. Paths retain their native stroke attributes, and actual SVG line elements use dark paper ink.
- Voices dismisses on outside pointer interaction, outside keyboard focus, or window blur. Instrument search remains open during internal interaction. Outside dismissal preserves the new focus target; Escape/Close restores focus to Voices. Trigger clicks toggle once, and unmount still stops instrument previews.
- Studio accent choices were already present in this branch: Linen, Sage, Clay and Lavender, under Settings → Appearance → Studio. No merge was needed.

The design and score/Voices specifications describe the resulting behavior.

## Verification

- Four new AudioPlayer regression cases cover outside pointer/focus/window dismissal, internal focus, trigger toggling and Escape focus restoration. The three new outside-dismissal cases failed before the fix and passed afterward.
- Focused component tests: 58 passed across AudioPlayer, VoicesPanel, ScoreCardHeader and SettingsAppearance.
- Full suite: 251 Node tests and 1,003 frontend tests passed (1,254 total).
- The combined command returned exit 143 after printing both passing summaries. A separate complete frontend rerun passed all 1,003 tests and exited 0; the Node phase had already exited successfully before the frontend phase started.
- TypeScript, lint, production build and whitespace checks passed. Existing React lint warnings, test act warnings and the large production chunk warning remain.
- Live browser: Nocturne Op.9 No.2 at 50%, 60% and 100% score zoom, in Studio/Linen and Recital/Velvet. Staff and ledger paths have dark paper fill with native `stroke: none`. The zoom control was approximately 162 × 30 px, horizontally centered within the visible pane and about 16 px above its bottom. Focus opacity was 1; idle opacity was 0.4.
- Live Voices checks: internal instrument search stays open; outside click and Shift+Tab dismiss without stealing focus; the trigger closes once; Escape restores trigger focus. Window blur is covered by the component regression test.
- Confirmed all four Studio accent choices in the live settings UI. Restored Studio/Linen, 50% score zoom, and the two-pane Sheet/ABC layout after checking the expanded sheet.

## Evidence

- [Final Sheet/ABC view](sheet-final-split.png)
- [Expanded Studio sheet and overlay](sheet-studio-overlay.png)
- [Recital sheet and overlay](sheet-recital-overlay.png)
- [Ledger lines at 100%](sheet-ledger-100.png)
- [Studio accent settings in this branch](sheet-accent-settings.png)
