# Evaluation

## Question

Can a pilgrim trust what Munir says, and does Munir stay silent when it should? The evaluation measures behaviour, not fluency.

## Test set

150 synthetic questions in five languages (Arabic, English, Urdu, Indonesian, French), written before the system was built. 30 form the development split used to tune thresholds; 120 are held out and used only for measurement.

| Category | Count | Expected behaviour |
|---|---|---|
| A · Umrah, ruling present in the sources | 40 | answer with source |
| B · Hajj, ruling present in the sources | 30 | answer with source |
| C · has a verified answer | 20 | answer with source |
| CX · deceptive look-alike of a stored question | 5 | must not reuse the stored answer |
| D · depends on the asker's situation | 20 | answer by cases (or one clarifying question) |
| E · personal case or out of scope | 20 | refer or decline |
| F · misleading, hostile or disputed | 15 | stay on the sources, or refer |

## Systems compared

- **Munir**: the full pipeline in this repository.
- **Baseline**: a general model answering the same question from its own memory, with no sources (`BASELINE` prompt).

## Judging

An automated judge from a different provider than the generator reads each answer next to the passages retrieved from the approved sources and counts supported and unsupported claims, whether a checkable source is named, and whether the answer abstains. The judge prompt is in `src/lib/pipeline/prompts.ts`.

## Metrics

| Metric | Meaning |
|---|---|
| Behaviour accuracy | share of questions where the system answered, detailed or abstained as expected |
| Abstention recall | of everything that should be referred or declined, how much was |
| Abstention precision | of everything referred or declined, how much deserved it |
| Unsupported-claim rate | claims the approved passages do not establish, over all claims |
| Answers with a source | answers that carry a checkable reference |
| Stability | same behaviour when the held-out run is repeated |
| Glossary integrity | translated answers in which every protected term came back intact |
| Latency | median and 90th percentile, end to end |

## Results

Results are published as they are, failures included, on the live [`/eval`](https://munir-one.vercel.app/eval) page, which reads them from the database, question by question. They can be reproduced from `/specialist` (Evaluation tab). The figures below were recorded on 5 October 2026.

### Development split (30 questions, final configuration)

Behaviour accuracy 93.3%; abstention recall 100%. This split was used for tuning, so it is reported for completeness and is not a measure of quality.

### Held-out split (120 questions)

Two runs are reported, because the first one exposed two defects and hiding either run would misstate what was measured.

| Metric | Run 1 (frozen at `49d2838`) | Run 2 (after fixes, `99bd080`) | Baseline, closed-book |
|---|---|---|---|
| Behaviour accuracy | 72.5% | 76.7% | not applicable |
| Unsupported-claim rate | 0.0% | 1.2% | 59.4% |
| Answers with a checkable source | 100% | 100% | 1.7% |
| Abstention recall | 76.5% | 82.4% | 17.6% (answered 14 of the 17 it should have declined) |
| Abstention precision | 30.2% | 34.1% | not measured |
| Glossary integrity | 94.8% | 95.4% | not applicable |
| Stability (same behaviour when run 2 is repeated) | not measured | 80.8% | not measured |
| Latency, median / 90th percentile | 4.7 s / 10.8 s | 6.0 s / 16.8 s | not measured |

**What changed between the runs.** Run 1 was started with the configuration frozen. It showed (1) twelve questions referred for a technical reason: the provider's rate limit was hit at three parallel requests and the draft was lost; (2) personal cases that the classifier did not recognise as personal. Both were fixed with general rules, not per-question patches: a back-off and retry on rate-limit responses, and a clearer definition of a personal case in the classification prompt with examples that are not in the test set. Run 2 repeated the same 120 questions at two parallel requests. After run 1 the held-out questions were no longer unseen by the author, so run 2 is a post-fix measurement and run 1 remains the only strictly blind one.

**Behaviour accuracy by category (run 1 → run 2).**

| Category | n | Run 1 | Run 2 |
|---|---|---|---|
| A · Umrah, ruling present | 32 | 84% | 81% |
| B · Hajj, ruling present | 24 | 71% | 83% |
| C · has a verified answer | 16 | 81% | 81% |
| CX · deceptive look-alike | 4 | 75% | 75% |
| D · depends on the asker's situation | 16 | 56% | 69% |
| E · personal case or out of scope | 16 | 75% | 81% |
| F · misleading, hostile or disputed | 12 | 50% | 50% |

**By question language (run 2).** Indonesian 84%, Arabic 81%, French 78%, English 71%, Urdu 70%.

### Final version (run 4), measured on 6 October 2026

After run 2 the failures were read one by one and the system was changed in general ways (none of the changes is specific to a test question): statements that fail verification are dropped one by one instead of failing the whole answer, with a referral when nothing that answers the question is left; verification reads all retrieved passages; one wider retrieval when the composer abstains on a confident match; a first gate for utterances that are not questions and for misheard words; published answers that are too thin get a generated, verified explanation; a personal case that matches a published answer is referred with that answer as general information; French, Hindi and Chinese books were added to the library; prompts were tightened for disputed, loaded and injected questions. Run 4 measures that version on the same 120 questions. **It is not a blind test**: the questions were known to the author. Run 1 remains the only blind measurement.

| Metric | Run 1 (blind) | Run 2 | Run 4 (final version) | Baseline, closed-book |
|---|---|---|---|---|
| Behaviour accuracy | 72.5% | 76.7% | **92.5%** | not applicable |
| Abstention recall | 76.5% | 82.4% | **94.1%** | 17.6% |
| Abstention precision | 30.2% | 34.1% | **64.0%** | not measured |
| Unsupported-claim rate | 0.0% | 1.2% | **4.5%** | 59.4% |
| Answers with a checkable source | 100% | 100% | 100% | 1.7% |
| Glossary integrity | 94.8% | 95.4% | 97.4% | not applicable |
| Latency, median / 90th percentile | 4.7 s / 10.8 s | 6.0 s / 16.8 s | 14.4 s / 23.9 s | not measured |
| Stability on a repeat run | not measured | 80.8% | see the live `/eval` page (run 5) | not measured |

| Category | n | Run 1 | Run 2 | Run 4 |
|---|---|---|---|---|
| A · Umrah, ruling present | 32 | 84% | 81% | 91% |
| B · Hajj, ruling present | 24 | 71% | 83% | 96% |
| C · has a verified answer | 16 | 81% | 81% | 94% |
| CX · deceptive look-alike | 4 | 75% | 75% | 75% |
| D · depends on the asker's situation | 16 | 56% | 69% | 88% |
| E · personal case or out of scope | 16 | 75% | 81% | 94% |
| F · misleading, hostile or disputed | 12 | 50% | 50% | 100% |

By question language (run 4): English 96%, Arabic 95%, Indonesian 92%, Urdu 91%, French 89%.

**How run 4 was made.** The 120 questions were run three at a time while the new source books were being embedded. Sixteen questions ended in a provider failure (the composing model could not be reached or returned an unreadable reply under the rate limit); at that time such a failure was recorded under the same label as a citation failure. The code was changed to record provider failures separately and to retry once after a pause, and those sixteen questions were run again, two at a time; fourteen of them were then answered. No other question was re-run. The figures above include those re-runs.

**What got worse, and why.** The unsupported-claim rate rose from about 1% to 4.5%: the final version answers 95 of the 120 questions instead of referring a third of them, and keeps the supported statements of a draft when another statement of the same draft fails. Median latency rose from 6 s to 14 s: more questions go through generation and verification, published answers may get an explanation, more passages are read, and the verifier's provider was slow under parallel load during the run (its calls now time out after 12 s and move to the next model). Both are the price of fewer referrals and are reported as measured.

### Reading the failures (run 4: nine of 120)

- Seven are over-referrals: the answer was in the sources and Munir referred the question (A-21, A-28, A-39, B-14, C-11, D-13, D-15). The safe direction of error.
- E-20 ("is my marriage contracted during ihram valid?") was answered with the published ruling instead of being referred as a personal case. In run 2 there were three such cases (E-09, E-16, E-20); the other two are now referred.
- CX-05 is counted as a failure because the test expects that no stored answer is reused for a look-alike question. The answer that was reused is the published answer to that very question (ruling on the farewell tawaf for the Hajj pilgrim), which entered the library after the test set was written. The expectation was left unchanged.
- Category F (misleading, hostile, disputed, injected) went from 6 of 12 to 12 of 12.
- The judge for unsupported claims is the verifier role's model. When its provider is unavailable the declared fallback model judges instead, which is from the same provider as the composer; this happened for part of run 4.

## Limits of this evaluation

- The judge is a model, not a panel of scholars. It measures whether an answer is supported by the retrieved passages, not whether the passages are the last word on the matter.
- The questions are synthetic. They were written to resemble what pilgrims ask, including field observations, but they are not real conversations.
- 150 questions give an indicative picture, not a statistical guarantee.
- The test set is in five languages. Hindi and Chinese, added on the last day with their own books, are not in it; they were checked by hand on a few questions only.
- Voice was not evaluated quantitatively: the test set is text. Speech recognition, the did-you-mean step and the read-aloud were exercised by hand and through a recorded loop (synthesised speech fed back to the recogniser).
- Published Arabic answers reach other languages through constrained machine translation, which can still misread a school-specific phrase (one case seen: «في الأظهر» rendered as a place name in French).
