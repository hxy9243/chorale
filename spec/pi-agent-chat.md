# Chat With Music Sheet

Date: 2026-07-25  
Status: design target informed by the `Chorale — Chat with Music Sheet · V1` Figma file

## 1. Goal

Make chat a score-aware workspace panel that can analyze, reference, and eventually propose changes against the active file and the user's current musical anchor.

The product is not a generic chat sidebar. It is a file-scoped analysis and editing surface attached to the same state as the score, ABC editor, and playback dock.

## 2. Product rules

- Chat belongs to the active file, not to the entire app globally.
- The current score anchor is first-class chat context.
- Grounded answers must reference score data, not only free-form model output.
- Durable score mutations must outlive the chat thread that created them.
- Tool use must be explicit to the user.
- Chat may propose ABC or annotation edits, but application of durable changes must remain reviewable.

## 3. Chat panel structure

The Figma design establishes four vertical zones.

### Header

- thread title, for example `Harmony analysis`
- history selector
- active file subtitle

### Conversation

- anchor chip, for example `Selected m.5 · beat 3`
- user prompt bubble
- grounded assistant answer
- visible tool inventory
- durable mutation status card, for example `A1 Persistent annotation created`

### Composer

- attached anchor chip
- free-form prompt area
- visible tool affordances
- mode presets such as `Analyze`, `Edit`, and `Compose`
- send action

### Thread model

The thread is a per-file conversation history. The user can switch histories without losing file-owned annotations.

## 4. Context contract

The current prototype captures file name, ABC, and revision. The design now requires a richer context envelope.

```ts
type ChatContext = {
  fileId: string;
  fileName: string;
  revision: number;
  abc: string;
  scoreInfo?: ScoreInfo;
  activeAnchor?: ScoreAnchor;
  selectedRange?: {
    measureStart: number;
    measureEnd?: number;
    abcStart?: number;
    abcEnd?: number;
  };
  visibleAnnotations: Annotation[];
  availableTools: ScoreToolName[];
};
```

Minimum design requirement:

- every send captures the current file revision
- every send can include the active anchor
- the assistant can cite or use score annotations already on the file

## 5. Tool model

The design explicitly exposes score tools to the user.

Initial tool categories:

- `score_info.read`
- `annotation.create`
- `annotation.update`
- `abc.propose_edit`
- `abc.apply_edit`

User-facing design rule:

- the panel should disclose what classes of tools are available
- durable file changes should produce a visible status event in the thread
- destructive or source-changing actions should move through propose/review/apply steps

## 6. Durable versus ephemeral state

This distinction is central to the design review.

Ephemeral chat state:

- thread messages
- draft composer text
- current streaming response
- temporary tool progress

Durable file state:

- score info
- annotations
- accepted ABC edits
- stored file revisions

Deleting a thread must not delete durable file state. Changing files must switch the visible thread set and durable score objects together.

## 7. Interaction rules

### Anchored chat

If the user clicks a note or selected passage, the composer should attach that anchor automatically. The chip should remain visible until cleared or replaced.

### Citation and seek-back

Assistant answers should be able to reference an anchor such as `m.5 beat 3`. Clicking the cited reference should seek the score and playback cursor back to that location.

### Annotation handoff

An annotation detail card on the score should offer a direct handoff into chat, carrying the same anchor and annotation identity.

### Thread switching

Switching thread history should not mutate the active score selection, annotations, or score info. Only the visible conversation changes.

## 8. MVP implementation boundary

The current branch only proves read-only analysis with a mock Pi-backed stream. For the designed MVP, the acceptable boundary is:

- real file-scoped thread model
- active anchor attachment
- grounded analysis responses
- visible tool inventory
- persistent annotations
- proposal-oriented edit flow

Out of scope for the first implementation pass:

- multi-user collaboration
- cloud sync
- production OAuth and provider auth polish
- automatic background tool execution without user review

## 9. Relationship to the current prototype

Keep the current Pi adapter strategy:

- Chorale owns the UI and data contracts
- Pi stays behind an adapter
- conversation and durable score objects remain Chorale-owned

What changes from the prototype:

- a single local transcript becomes per-file thread state
- chat context upgrades from `MusicContextSnapshot` to a file and anchor-aware contract
- read-only responses expand into explicit tool-backed proposals and durable file events
