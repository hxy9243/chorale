# Chorale design language

> A quiet music workspace built from warm paper surfaces, fine rules, dark ink, and restrained color. Structure should feel precise; the material should feel welcoming.

Status: reference specification, 2026-09-05. Based on the implemented Chorale component concept, not a description of the production Chorale application.

Visual reference: [Component workspace](https://chorale-music-workspace-concept.kevinhu92.chatgpt.site/#components). Supporting reference: [Landing concept](https://chorale-music-workspace-concept.kevinhu92.chatgpt.site/).

Use this file at the root of a product repository to guide human and AI implementation. The values marked **reference** reproduce the component mockup. Rules marked **production recommendation** improve behavior without changing its visual language. The CSS recipes are reusable patterns, not a complete stylesheet or component library.

## 1. Design intent

Chorale is a place to read, understand, edit, and discuss music. The workspace should support sustained concentration and make the relationship between the score, source, and conversation legible.

- **Paper through structure.** Use warm flat fills, thin edges, slight tonal differences, and soft directional shadows. The current design has no bitmap paper texture. Do not add grain, torn edges, distressed lettering, or parchment effects by default.
- **Quiet chrome, clear work.** Navigation and controls should remain easy to find while letting notation and text carry attention.
- **Purposeful depth.** A sidebar is a sheet above the desk; a score is a sheet within the workspace; a menu floats above both. Elevation communicates those relationships.
- **Small, deliberate accents.** Use rust for emphasis and active markers, pale blue for context, and sage for positive feedback. Large surfaces remain neutral.
- **Precise controls, expressive titles.** Sans-serif handles everyday tasks, monospace handles small structural metadata, and serif gives music titles a literary character.
- **Equal access to different representations.** Score, ABC, and conversation are useful working views. Their placement should be adjustable; chat should not be permanently treated as an accessory.

Avoid a generic dashboard of rounded cards, saturated gradients, glass blur, large colored navigation blocks, or shadows around every control. Avoid copying a marketing hero into the actual editor.

## 2. Material and color system

### Reference palette

| Role | Value | Use |
| --- | --- | --- |
| Desk | `#e9e5dc` | Background behind the work surface |
| Paper | `#f6f3ec` | Sidebar, header, active tab and workspace |
| Raised paper | `#fffdfa` | Score sheet, inputs, buttons, menus |
| Ink | `#292824` | Main text, primary actions, dark siderail |
| Muted ink | `#716d65` | Supporting copy and metadata |
| Rule | `#dcd8ce` | Standard separators and quiet borders |
| Rust | `#ad503b` | Accent actions, section identifiers, active file rule |
| Context blue | `#dce5ef` | Selected context and informational badges |
| Sage | `#d8e2d7` | Positive status background |
| Rose | `#f1d8d0` | Draft/attention background in the reference |
| Hover paper | `#ece7dd` | Neutral button hover |
| Selected control | `#e9e1d4` | Pressed controls |
| Selected border | `#b7aa96` | Pressed-control outline |
| Active file | `#ebe4d8` | Selected sidebar row |
| Tab strip | `#eae5dc` | Background behind document tabs |
| Conversation surface | `#f0ece4` | Chat pane |
| User message | `#e4ded2` | User message background |
| Rail active | `#4a4842` | Selected tool on the dark rail |
| Switch on | `#6d8067` | Enabled switch track |
| Switch off | `#b6afa4` | Disabled-state switch track, meaning “off” |

Use pale colors as backgrounds with ink text, not as small text on paper. The reference does not define a complete warning/error palette. **Production recommendation:** introduce semantic warning and error tokens deliberately, test contrast, and pair color with text or icons. A rose draft badge is not automatically an error.

The landing page uses slightly darker ink (`#20201e`) and brighter rust (`#ba563d`). For a unified application, use the component values above as the canonical tokens instead of mixing variants arbitrarily.

### Transferable tokens

```css
:root {
  color-scheme: light;
  --surface-desk: #e9e5dc;
  --surface-paper: #f6f3ec;
  --surface-raised: #fffdfa;
  --surface-chat: #f0ece4;
  --surface-tabs: #eae5dc;
  --surface-hover: #ece7dd;
  --surface-selected: #e9e1d4;
  --surface-file-active: #ebe4d8;
  --text-primary: #292824;
  --text-secondary: #716d65;
  --border-subtle: #dcd8ce;
  --border-selected: #b7aa96;
  --accent-rust: #ad503b;
  --context-blue: #dce5ef;
  --status-sage: #d8e2d7;
  --status-rose: #f1d8d0;
  --font-ui: 'DM Sans', Arial, sans-serif;
  --font-title: 'Instrument Serif', Georgia, serif;
  --font-meta: 'DM Mono', ui-monospace, monospace;
  --radius-control: 3px;
  --radius-panel: 5px;
  --shadow-sidebar:
    1px 0 #ccc6bb,
    5px 0 0 -1px #efebe2,
    6px 0 0 -1px #d9d2c6,
    12px 0 24px #55482d12;
  --shadow-sheet: 0 1px 3px #42341e18, 0 9px 20px #42341e12;
  --shadow-workspace: 0 10px 25px #4c402c0b;
  --shadow-menu: 0 8px 24px #29282420;
}
```

The token names are normalized here for portability; the mockup uses shorter names such as `--paper`, `--white`, and `--ink`. There is no approved dark theme yet. Do not mechanically invert the colors.

## 3. Typography and rhythm

| Element | Reference treatment |
| --- | --- |
| Main body | DM Sans, 16px, regular |
| Buttons, files, chat | DM Sans, 14px |
| Supporting descriptions | 13px, only when secondary |
| Structural metadata | DM Mono, 12px |
| Section identifier | 12px mono, uppercase, 0.06–0.08em tracking |
| Workspace introduction | Instrument Serif, 40px; 34px on small screens |
| Score title | Instrument Serif, 30px, regular, centered |
| Wordmark | DM Sans, 24px, weight 600, -1.4px tracking |
| Chat/body reading rhythm | About 1.6 line height |
| Source editor | DM Mono, 14px, 1.8 line height |

Use serif for titles, not buttons or navigation. Reserve uppercase mono for short labels, not paragraphs. Keep tight tracking confined to display titles or the wordmark.

**Production recommendation:** use rem-based typography, retain at least 14px-equivalent recurring labels, and keep long-form body copy around 16px. Preserve usability at enlarged text sizes. Load fonts centrally; local font assets can avoid dependency on an external font request.

Use a practical spacing scale of **4, 8, 12, 16, 20, 24, 32, 40, 48px**. This scale is a recommended normalization: the reference also uses optical values such as 14, 17, 22, 25, 28, and 30px. Prefer consistent relationships over copying every incidental offset.

## 4. Workspace layout

### Reference geometry

| Region | Desktop reference | Role |
| --- | --- | --- |
| Siderail | 56px wide | Global tools, compact icons |
| Paper sidebar | 228px wide | Files and score-local views |
| Header | 76px high | Sidebar control, current score, actions |
| Page inset | 30px | Space around workspace |
| Main pane | `minmax(0, 1fr)` | Active score/source/notes |
| Chat pane | 310px wide | Conversation; 360px at very wide viewports |
| Workspace | 5px radius, 1px border | Shared container for tabs, views and player |
| Score sheet | 650px max width | Raised readable document |
| Player | Content-sized; 14px vertical padding | Playback controls below views |

```css
.app-shell {
  display: grid;
  grid-template-columns: 56px 228px minmax(0, 1fr);
  min-height: 100dvh;
  background: var(--surface-desk);
}
.app-shell.is-sidebar-collapsed {
  grid-template-columns: 56px minmax(0, 1fr);
}
.app-shell.is-sidebar-collapsed .paper-sidebar { display: none; }
.workspace-content, .pane { min-width: 0; }
.panes { display: grid; grid-template-columns: minmax(0, 1fr) 310px; }
.panes[data-layout='single'],
.panes[data-layout='stack'] { grid-template-columns: minmax(0, 1fr); }
.panes[data-layout='single'] .chat-pane { display: none; }
.panes[data-layout='stack'] .chat-pane {
  border-left: 0;
  border-top: 1px solid var(--border-subtle);
}
```

The component demonstration includes a title, numbered specimen sections, and explanatory demo labels. Those are documentation chrome. Omit them from the production editor unless they serve a real workflow.

**Production recommendation:** bound the editor to the viewport with a flex/grid column for header, workspace and transport; use `min-height: 0` and intentional `overflow: auto` on scrollable panes. Preserve each pane's scroll and edit state during rearrangement. Let the player remain visible while content scrolls. Do not apply the reference's 650px sheet limit to raw ABC or conversation panes.

### Responsive behavior

| Width | Existing mockup behavior | Production recommendation |
| --- | --- | --- |
| Above 1600px | 1450px content maximum, 36px/45px page insets, 360px chat | Keep useful line lengths; avoid a huge chat column |
| 901–1150px | 52px rail, 190px sidebar, 22px inset, 260px chat | Collapse sidebar before squeezing editors too far |
| 900px and below | 48px rail, sidebar hidden, panes stacked, 14px horizontal inset | Provide a reachable file drawer; do not simply remove file access |
| Small touch screens | Wrapped tabs and fewer header metadata items | Use horizontally scrollable tabs or an overflow menu and larger hit areas |

Prefer content-driven breakpoints when porting. Keep essential controls available; hide decorative metadata first. A layout change must not discard unsaved source, chat drafts, selected measures, or notes.

## 5. Paper, edges, and elevation

### Paper sidebar — reference recipe

```css
.paper-sidebar {
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  padding: 25px 17px;
  background: var(--surface-paper);
  box-shadow: var(--shadow-sidebar);
}
```

The first shadow makes the paper edge. Two offset hard shadows suggest a second sheet. The final blurred shadow separates the sidebar from the desk. Keep the shadow directional and faint. Do not add a floating-card radius to the sidebar or rotate it. Avoid ancestor clipping that cuts off its right-hand shadow.

### Score sheet — reference recipe

```css
.score-sheet {
  width: calc(100% - 54px);
  max-width: 650px;
  margin: 24px auto 32px;
  padding: 24px 28px 20px;
  background: var(--surface-raised);
  border: 1px solid #e6e0d6;
  box-shadow: var(--shadow-sheet);
}
.workspace {
  overflow: hidden;
  border: 1px solid #cbc5ba;
  border-radius: var(--radius-panel);
  background: var(--surface-paper);
  box-shadow: var(--shadow-workspace);
}
```

Keep score-sheet corners square. Use borders rather than shadows for sections within a pane. Menus can use `--shadow-menu`, but should be portaled outside clipped pane containers when necessary.

**Production recommendation:** define a small shared stacking scale: content 0, sidebar 30, siderail 40, popovers 100, dialogs 200, notifications 300. These numbers normalize the reference's local z-index values; avoid unrelated arbitrary z-index escalation.

## 6. Siderail, sidebar, and header

**Siderail:** charcoal background, paper-colored icons, 40px reference buttons, about 20px line icons with 1.5px stroke. Active buttons use `#4a4842`, not a bright accent. Place settings at the bottom. Use a coherent icon set such as the application's existing Lucide icons; the mockup's mixed text symbols are placeholders, not a canonical icon system.

**Sidebar:** selected file combines a 2px rust left edge, warm selected fill, and ink text. Files are plain rows rather than independent cards. Group labels use muted uppercase mono. Add/new actions are compact and aligned with the wordmark.

```css
.file-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 10px;
  border: 0;
  border-left: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  text-align: left;
}
.file-row[aria-current='page'] {
  background: var(--surface-file-active);
  border-left-color: var(--accent-rust);
}
```

**Header:** paper background, bottom rule, current document on the left, limited document-level actions on the right. The avatar is incidental to the mockup; do not introduce user accounts just to reproduce it. Put score-view controls in the pane toolbar, not the global header.

## 7. Tabs and pane controls

Tabs should feel attached to the paper beneath them. Inactive tabs sit on the darker strip. The active tab uses the same paper as its panel and covers the separator below it.

```css
.tab-strip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 8px 0;
  background: var(--surface-tabs);
  border-bottom: 1px solid var(--border-subtle);
}
.document-tab {
  position: relative;
  display: flex;
  align-items: center;
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: 5px 5px 0 0;
}
.document-tab[data-active='true'] {
  background: var(--surface-paper);
  border-color: var(--border-subtle);
}
.document-tab[data-active='true']::after {
  content: '';
  position: absolute;
  inset: auto 0 -1px;
  height: 2px;
  background: var(--surface-paper);
}
```

- Keep the tab trigger and close button as sibling buttons; never nest buttons.
- Active state must remain visually distinct from hover and keyboard focus.
- Include a plus menu for opening views and an accessible alternative to dragging.
- Support left/right arrow selection and Home/End through a proper tab implementation.
- Closing the active tab selects a nearby tab and moves focus predictably. Closing the last tab shows a useful reopen action.
- **Production recommendation:** protect unsaved work, provide a visible drag target, and preserve underlying view state when moving tabs. Do not use DOM recreation as the state model.

The Single/Split/Stack control is a compact segmented control: 3px group padding and gaps, neutral track, raised paper selected segment, tiny shadow. Pane arrangement is separate from choosing the active tab.

## 8. Buttons and interaction states

| Variant | Resting appearance | Role |
| --- | --- | --- |
| Primary | Ink fill and border, white text | Main action within the current task |
| Secondary | Raised paper, subtle border, ink text | Ordinary actions |
| Quiet | Transparent fill and border | Toolbar actions and less prominent commands |
| Accent | Rust fill, white text | Selective emphasis, not every action |
| Icon | Compact, consistent line icon | Actions with an accessible label |

Reference dimensions: 14px label, 8px/12px padding, 3px radius. Primary hover is `#49463e`; neutral hover is `#ece7dd`. Pressed controls use selected paper and selected border. The mockup uses opacity 0.4 for disabled buttons.

```css
.button {
  padding: 8px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-control);
  background: var(--surface-raised);
  color: var(--text-primary);
  font: 0.875rem var(--font-ui);
  cursor: pointer;
}
.button:hover:not(:disabled) { background: var(--surface-hover); }
.button--primary {
  color: #fff;
  background: var(--text-primary);
  border-color: var(--text-primary);
}
.button--primary:hover:not(:disabled) { background: #49463e; }
.button[aria-pressed='true'] {
  background: var(--surface-selected);
  border-color: var(--border-selected);
  color: var(--text-primary);
}
.button:disabled { opacity: 0.4; cursor: not-allowed; }
/* Production addition: the mockup only specifies an outline offset. */
:where(button, a, input, textarea, select, [tabindex]):focus-visible {
  outline: 2px solid var(--accent-rust);
  outline-offset: 3px;
}
```

Use component-specific selectors so global pressed or hover rules do not overwrite the siderail, segmented controls, or accent buttons. Keep disabled labels understandable and provide a reason for unavailable actions when needed. **Production recommendation:** keep touch targets about 44px while retaining the compact visual control, using surrounding padding where appropriate.

## 9. Inputs, widgets, and feedback

**Text fields and composer:** raised paper, 1px warm border, 3px or square corners, comfortable inset. Textarea should visibly belong to its pane. Use a persistent label or accessible name; placeholder text is supporting guidance.

**ABC editor:** mono text, generous line height, readable selection and cursor, minimal chrome. In production, use real ABC parsing/rendering; the reference's illustrative notation is not synchronized with source edits.

**Switch:** reference track is 34×21px, with 3px padding, a 15px white thumb, 13px thumb translation, and a 150ms transition. Use sage-gray on and neutral off. Preserve `role="switch"`, `aria-checked`, keyboard operation, and a visible label. Increase the interaction target independently of the track size.

**Range/tempo:** use rust for the progress accent and mono for time/tempo. Clearly separate playback position from volume. Numeric inputs need validated limits. Stop, pause, mute, and seek must reflect actual state.

**Badges:** compact rectangular pills with 3px corners; 12px text; 6px/8px padding. Pair semantic text with pale fill. Do not make a badge look clickable unless it acts as a control.

**Menus:** raised paper, thin rule, 6px inset, 180px reference minimum width, `--shadow-menu`. Use a menu primitive with focus management and Escape/outside dismissal.

**Notifications:** brief ink-colored surface with paper text and a soft shadow. Use a live status region for nonurgent confirmation. Preserve important errors until users can act; do not hide them in a short-lived toast alone.

**Dialogs and resizable splitters — production extensions:** the mockup does not define these. Carry forward the paper palette, restrained radius, fine rules, and clear action hierarchy. Use an accessible dialog primitive. Splitters need a visible hover/focus affordance and keyboard resizing; do not rely on a nearly invisible drag line.

## 10. Conversation and music context

Chat uses a slightly darker surface than the score. Its header has a fine bottom rule. User messages use a warm inset rectangle; assistant replies can use a 2px sage vertical rule rather than another bubble. Blue context chips identify the score or measure selection to which a message refers.

Keep contextual information precise: file, selected measures, current revision when relevant. Do not use decorative statuses that imply analysis or validation has occurred. The reference's “ABC valid,” sample conversation, and illustrative score are demonstration content, not production truth.

Music must remain the source of visual attention. Use actual notation output for real scores; do not copy the mockup's hand-drawn note positions into the application. Selected measures should remain readable under any selection tint.

## 11. Motion and accessibility

Use motion only to explain state changes: around 120–180ms for small hover, switch, and disclosure transitions. The 150ms switch is the only specifically timed interaction in the reference. Avoid bouncy controls or animated paper shadows.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
```

Production acceptance requirements:

- All core actions work with keyboard input; focus remains visible and predictable.
- Tabs, menus, switches and dialogs expose their names, roles, and actual state.
- Normal text targets 4.5:1 contrast; large text and essential nontext indicators target 3:1. Verify actual foreground/background combinations; this reference is not a contrast certification.
- Color is never the sole signal for active, error, modified, or success states.
- Long titles, translated labels, narrow screens, and enlarged text do not overlap controls.
- Sidebar collapse does not remove the only route to files or settings.
- Focus rings and menus are not clipped by the workspace's overflow boundary.
- Real playback does not start without a user action.

## 12. Porting this language into Chorale

1. Place this document in `DESIGN.md`. Put semantic tokens in one shared stylesheet, imported before component styles.
2. Apply desk/paper/ink surfaces and typography first. This establishes most of the visual character.
3. Style the app shell, directional sidebar shadow, header, and siderail.
4. Style tabs and pane boundaries, then buttons, fields, menus, switches and badges.
5. Connect every state to real application behavior. Preserve score/source/chat state independently of layout.
6. Check a real score, long ABC source, a long conversation, an empty document, an error, and unsaved edits.
7. Compare at wide desktop, compact desktop, and narrow widths, including keyboard and enlarged-text use.

Suggested responsibility split (adapt to the existing repository):

```text
DESIGN.md                 Design intent and rules
styles/tokens.css         Shared colors, type, radii, elevations
styles/workspace.css      Shell, panes, sidebar, header, transport
styles/controls.css       Buttons, tabs, fields, switches, menus
```

Reuse existing React components and accessible UI primitives. Keep the existing state model and rendering tools; this document does not require a framework change. Avoid generic global selectors such as `.active`, `button`, or `.selected` for component-specific appearances.

### Instruction for a coding agent

> Read DESIGN.md before making UI changes. Preserve the warm paper surfaces, charcoal siderail, attached document tabs, fine rules, restrained rust accents, and the three-font hierarchy. Reuse semantic tokens and existing accessible primitives. Treat the reference mockup as visual guidance, not production behavior or architecture. Keep score, source and conversation state stable across layout changes. Explain any intentional deviation from these rules.

## 13. Review checklist

- Does the surface read as paper through tone, edges and elevation, without decorative texture?
- Are sidebar, document and popover shadows serving different structural roles?
- Does the active tab visually connect to its panel?
- Are primary, secondary, quiet, selected, hover and focus states distinguishable?
- Are large surfaces neutral, with color concentrated in useful small signals?
- Are typography, spacing, radii and icon strokes consistent?
- Can users immediately work with music rather than navigate presentation chrome?
- Do small screens retain file access, readable content and usable controls?
- Does every status and action describe real behavior?
- Have implementation changes preserved the existing product's capabilities?
