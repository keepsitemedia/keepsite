# The office: design system

Scope: `/office/*`, `/sign/*`. The marketing site has its own rules in
`src/styles/global.css` and the brand strategy doc; this file governs the
working screens only.

## Direction

A kept ledger. Paper, ink, one green. Quiet enough that the single late
item is the only thing that stands out. The person is the owner, at the
desk after the morning digest or on a phone between meetings, moving each
client one stage forward.

## Tokens

Defined on `.office` in `src/styles/office.css`, aliasing the site palette:

| Token | Value | Use |
|---|---|---|
| `--paper` | site bg #FBF9F4 | page and header |
| `--paper-inset` | #F5F1E8 | inputs: slightly darker than the page, never lighter |
| `--sheet` | #FFFFFF | forms that group fields, popovers, previews |
| `--sand` | #F2EEE4 | hover fills, code chips |
| `--hairline` / `--hairline-soft` | ink at 14% / 8% | every border |
| `--ink` | #1F2421 | primary text |
| `--pencil` | #55605B | secondary text, field labels |
| `--graphite` | #66706B | tertiary: metadata, hints, table headers (4.87:1 on paper) |
| `--faint` | #B4BAB6 | decoration only: unreached rail stops, out-of-month days |
| `--green` / `--green-deep` / `--moss` | Keep Green | the one accent: current item, done marks, primary button |
| `--clay` / `--clay-tint` | #A24A26 | late, failed, destructive. Nothing else is ever clay |

Spacing: 4px base. Use `--space-0..6` from global.css plus 0.75rem for
control padding. Radius: 6px controls, 8px sheets. Control height 36px
(`--control-h`), 16px font on touch screens only.

Depth: borders only. No shadows anywhere; a popover is a sheet with a
hairline, one level above the page.

Type: Instrument Sans throughout, line-height 1.45. Upright Newsreader
(`h1.file-name`) only for the client's name and the day on the dashboard
and calendar. No italics, ever. Tabular numerals in every table and
ledger. Section headings (`h2`) sit on a hairline rule.

## Patterns

- **Stage rail** (`StageRail.astro`, `.rail`): the pipeline drawn once.
  Green track behind the stops reached, a ringed stop for the current
  stage, the single Advance button under the next stop. Dashboard mode
  hangs client names under each stage. Goes vertical under 52rem.
- **Ledger** (`.ledger` on a `ul`): rows of things due. Tick circle,
  date column with a relative word ("in 7 days", "3 days late" in clay),
  what, quiet actions. `TaskRow` and `MeetingRow` render the rows.
- **Mark** (`Mark.astro`): one dot, four states. Filled green done,
  outline waiting, filled clay late or failed, dashed not started. The
  word beside it carries the detail. Use it for every status; the green
  chip (`.chip`) is only for a stage name in the clients table.
- **Glance** (`.glance`): a client's standing as a ruled band of label
  and mark pairs, built by `attention.mjs`.
- **Fold** (`details.fold`): a section that is there when wanted. Summary
  in ink with a quiet note on the right.
- **Two lists, not a grid** (`.serps` / `.serp-list`, the research compare
  page): when two ranked lists are compared, show them as two lists side by
  side, stacking under 52rem. A shared table row would claim rank 3 on the
  left has something to do with rank 3 on the right. Matches are marked on
  the rows themselves: moss for the same URL, `--paper-inset` for the same
  business with a different page, with a legend.
- **Pop** (`details.pop`): a row's second action, opening a small sheet.
- **Buttons**: `.btn` green for the one primary action on a screen,
  `.btn-quiet` for everything else, `.link-quiet` for row actions,
  `.link-quiet.danger` for delete and void.
- **Notices**: `.error` clay tint, `.notice-ok` moss. The only filled
  colour boxes.

## Rules

- One green, and it means "this one": current nav item, current stage,
  the primary button, a done mark. Never decoration.
- Clay at most where something is actually late, failed or destructive.
- Inputs are inset (darker), not raised (lighter).
- Empty states are a plain sentence in graphite, never italic.
- Say which side a value came from. Where a screen mixes computed values
  with the owner's judgment, label the computed ones automatic and give the
  judgment its own heading and mark; an undecided thing reads "Not decided",
  never a silent default.
- Native date and time pickers stay native, sized to the control height.
- Lists that are the page (`.rail`, `.ledger`) opt out of the site's
  prose measure.
