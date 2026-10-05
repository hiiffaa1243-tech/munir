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

### Reading the failures

- Most failures are over-referrals: Munir sent to a specialist a question whose answer was in the sources. This lowers accuracy and abstention precision, and it is the safe direction of error. The low abstention precision is the price of the fail-closed design and the clearest item to improve.
- Three personal cases (E-09, E-16, E-20) were answered from a stored published answer on the same topic instead of being referred. This is the most serious failure type found and is listed on `/eval` with the answers.
- Category F (misleading, hostile or disputed questions) stayed at 50% in both runs. It was not tuned.
- Run 2's unsupported-claim rate is 1.2%, not zero: the judge marked a small number of statements as going beyond the cited passages.
- A stability run (a third pass over the held-out split) was started and did not complete before these figures were recorded; stability is therefore not claimed.

## Limits of this evaluation

- The judge is a model, not a panel of scholars. It measures whether an answer is supported by the retrieved passages, not whether the passages are the last word on the matter.
- The questions are synthetic. They were written to resemble what pilgrims ask, including field observations, but they are not real conversations.
- 150 questions give an indicative picture, not a statistical guarantee.
