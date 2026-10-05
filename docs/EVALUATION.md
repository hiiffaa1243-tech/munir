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
| Stability | same behaviour across three runs |
| Glossary integrity | translated answers in which every protected term came back intact |
| Latency | median and 90th percentile, end to end |

## Results

Results are published as they are, failures included, on the live `/eval` page, which reads them from the database. They can be reproduced from `/specialist` (Evaluation tab).

## Limits of this evaluation

- The judge is a model, not a panel of scholars. It measures whether an answer is supported by the retrieved passages, not whether the passages are the last word on the matter.
- The questions are synthetic. They were written to resemble what pilgrims ask, including field observations, but they are not real conversations.
- 150 questions give an indicative picture, not a statistical guarantee.
