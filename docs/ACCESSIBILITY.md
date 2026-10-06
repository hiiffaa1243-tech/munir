# Accessibility: what was tested, what was found, what was changed

Date of this pass: 6 October 2026. Raw numbers: [`accessibility-audit.json`](accessibility-audit.json). Script: [`../scripts/a11y-audit.py`](../scripts/a11y-audit.py).

## Method

- **Tool:** axe-core 4.14.0, injected into the pages by Playwright (headless Chromium). axe-core is not a dependency of the app.
- **Standard:** WCAG 2.1 level A and AA (axe tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`).
- **Build under test:** production build (`next build`, `next start`) in mock mode (`MUNIR_MOCK=1`); `/api/ask` and `/api/claim`
  are answered by the script so that every run shows the same answer.
- **Screens (10):** `/` idle; `/` with a rendered answer (published text plus generated explanation, sources, actions); `/` with the
  "Did you mean" card; `/` with the save-to-phone dialog open; `/n` (phone notebook); `/c` (QR landing); `/demo`; `/eval`;
  `/insights`; `/specialist` (login screen only).
- **Viewports:** desktop 1180x820 and phone 390x844. **Languages:** Arabic (right to left) and English (left to right).
  That makes 40 audited screens. `/demo`, `/eval`, `/insights` and `/specialist` exist in Arabic only, so their "English" run
  audits the same Arabic page a second time.
- **Counting:** one violation = one failed rule on one audited screen. Nodes = elements that fail that rule on that screen.
- **Scripted checks** (same script, not axe): keyboard-only use, screen-reader announcements, `<html lang dir>`, reduced motion,
  error states. Details below.

## Result of the automated audit

| | Before | After |
|---|---|---|
| Audited screens | 40 | 40 |
| Screens with at least one violation | 10 | 2 |
| Violations (rule x screen) | 10 | 2 |
| Failing nodes | 42 | 2 |
| Critical | 0 | 0 |
| Serious | 10 violations, 42 nodes | 2 violations, 2 nodes |
| Moderate | 0 | 0 |
| Minor | 0 | 0 |

By rule:

| Rule (impact) | Where | Before | After |
|---|---|---|---|
| `color-contrast` (serious) | Answer card on `/`, in both languages and both viewports, also counted again behind the save dialog | 8 violations, 40 nodes | 0 |
| `scrollable-region-focusable` (serious) | `/eval` at phone width: the results table scrolls sideways but cannot be reached with the keyboard | 2 violations, 2 nodes | 2 violations, 2 nodes |

Reading the numbers fairly:

- The 40 contrast nodes are two colour pairs repeated: the green "published / verified" badge (`#12805A` on `#E0F5EC`, 4.33:1) and
  the amber "generated explanation" badge (`#96650B` on `#FBF0D8`, 4.46:1). WCAG AA asks for 4.5:1. The save dialog screen shows
  the same card behind it, so those nodes are counted twice. Without the dialog screen (36 screens) the totals are 6 violations and
  22 nodes before, 2 violations and 2 nodes after.
- The remaining violation is on `/eval`, a page for judges and not for pilgrims. Its file was being edited by another work package
  during this pass, so it was left alone. The fix is known (make the table wrapper focusable and name it) and was applied to the
  same pattern on `/insights`.
- axe also lists items it could not decide and that need a human eye: text contrast on two elements of `/demo` and one in the save
  dialog, and one table header on `/insights`. They are not counted as violations and have not been reviewed by hand yet.

## Scripted checks

| | Check | Before | After |
|---|---|---|---|
| a | **Keyboard only.** Tab reaches the microphone button, the text box, all 7 language buttons, both switches and the answer's actions (source link, sources, replay, save to phone, report); every stop shows a focus ring; Enter and Space activate; Enter on "save to phone" opens the dialog and Escape closes it; Escape stops listening | **Fail**: the text box had no focus ring (only a border colour change), and focus stayed behind the save dialog when it opened | Pass (20 tab stops on the idle screen, all with a ring) |
| b | **Screen-reader announcements.** The status line (tap and speak / listening / thinking / reading) is a polite live region; a new answer is announced | **Fail**: the status line was announced, a new answer was not | Pass |
| c | **`<html lang dir>` follows the chosen language** for all 7 languages (`rtl` for Arabic and Urdu), on load with `?lang=en`, and the choice carries over to `/n` | Pass | Pass |
| d | **`prefers-reduced-motion`**: the thinking ring animation and the microphone transitions are off (`animation-name: none`, `transition-duration: 0s`); the level rings stay still | Pass | Pass |
| e | **Error states say what happened and what to do next** (English strings checked; the refusal is simulated by making `getUserMedia` reject, the network failure by aborting the request, the speech failure by a 500 from `/api/transcribe`): microphone refused: "The microphone is not available. Please type your question." (`role="alert"`); network failure while asking: "Something went wrong. Please try again." (`role="alert"`, text box stays usable); speech not recognised: "I did not hear a question. Tap the microphone and try again, or type it." (`role="status"`) | Pass | Pass |

## Changes made because of these results

1. **Contrast.** `--good` `#12805A` to `#0E6E4D` (5.49:1 on its badge background) and `--warn` `#96650B` to `#855908` (5.41:1). Same
   hues, slightly darker; the look is unchanged.
2. **Focus ring on text boxes.** `input.in`, `textarea.in`, `select.in` and the notebook question box set `outline: none`; they now
   get the same 3 px ring as every other control under `:focus-visible`.
3. **A new answer is announced.** A visually hidden `role="status"` region is always in the page. When an answer arrives it carries
   the trust level ("Published text from an approved reference", "Referred to a specialist", ...). If reading aloud is switched off
   it also carries the main text of the answer; if reading aloud is on, Munir speaks the answer himself and the region stays short,
   so that a screen-reader user does not hear two voices at once.
4. **The answer card has a name.** `article` is labelled by its trust badge (`aria-labelledby`); the decorative dot is hidden from
   assistive technology.
5. **Save-to-phone dialog.** Focus moves into the dialog when it opens (Close button); the QR image has a descriptive `alt`.
6. **A heading on every state of the service point.** When the answer replaces the visible title, a visually hidden `h1` remains.
7. **Labels and status roles.** The clarification text box has an accessible name (service point and notebook); the "saving" line
   on `/c`, the "waiting for a specialist" count on `/n` and the loading line on `/insights` are `role="status"`; spinners are
   `aria-hidden`.
8. **`/insights`.** Scrollable tables are focusable, named regions. The load error is `role="alert"` and now says what to do
   ("refresh the page and try again").
9. **Reduced motion.** The rule that switches animations off now also covers pseudo-elements and smooth scrolling.

No change was made to the voice, speech or question-answering logic. `npx tsc --noEmit` and `npx vitest run` (50 tests) pass.

## Limits

Automated checks find only a part of accessibility problems; a clean axe run is not proof that a screen is usable. What has
**not** been done: no test with blind or low-vision pilgrims, no manual pass with a real screen reader (VoiceOver, TalkBack, NVDA),
no test with elderly users or users with low literacy, no test of the spoken audio itself in a noisy hall. The live-region and
keyboard checks above confirm that the right attributes and focus behaviour are present in Chromium; they do not confirm what
a screen reader actually says in each of the 7 languages. Only Arabic and English were audited; the other five languages share
the same markup but their strings were not checked. Known open points: the `/eval` table (above); the save dialog moves focus in
but does not trap it or return it on close; the language list's own label ("Language") is in English only; `/n` and `/c` have no
`h1`; source numbers in an answer are read as bare numbers. The proposed next step is a moderated session with blind and
low-vision pilgrims at a service point, in at least Arabic and Urdu, with the findings fed back into this document.

## Run it again

```
MUNIR_MOCK=1 npx next build && MUNIR_MOCK=1 npx next start -p 3141
mkdir /tmp/axe && cd /tmp/axe && npm init -y && npm i axe-core
python3 scripts/a11y-audit.py http://localhost:3141 /tmp/axe/node_modules/axe-core/axe.min.js out.json
```

## Final re-audit of the shipped build

The two violations that remained after the first round of fixes were both `scrollable-region-focusable` on `/eval` at phone width. The results tables on `/eval` are now focusable regions with an accessible name. The same script was then run again against the final build (all 40 screens):

| | Before | After first fixes | Final build |
|---|---|---|---|
| Screens with a violation | 10 of 40 | 2 of 40 | 0 of 40 |
| Failing elements | 42 | 2 | 0 |

The limits stated above still apply: this is an automated audit, and no test with blind or low-vision pilgrims has been run yet.
