# Sources, tools and licences

## Approved religious sources

Eleven English-language publications, read as text PDFs. They are official releases of the Presidency of Religious Affairs at the Grand Mosque and the Prophet's Mosque, or publications distributed by IslamHouse (the publishing arm named among the challenge's approved references). They are distributed free of charge by their publishers. **Their text is not redistributed in this repository**: only the registry below is committed, and the extracted text is uploaded privately to the deployment's database.

| Id | Title | Author / body | Publisher | Pages | Chunks |
|---|---|---|---|---|---|
| fatwas | Fatwas on Hajj, ‘Umrah, and Visitation | The Scientific Committee (fatwas of the Permanent Committee) | Presidency of Religious Affairs | 97 | 132 |
| violations | Violations During Hajj, ‘Umrah and Visitation | The Scientific Committee | Presidency of Religious Affairs | 27 | 22 |
| umrah_concise | Concise Description of ‘Umrah and Its Rulings | The Scientific Committee | Presidency of Religious Affairs | 20 | 16 |
| umrah_howto | How to do ‘Umrah, with selected supplications | Booklets for Visitors to the Two Holy Mosques | Presidency of Religious Affairs | 40 | 46 |
| hajj_howto | How to Perform Hajj | Shaykh Muhammad ibn Salih al-‘Uthaymin | IslamHouse | 52 | 31 |
| guide | A Guide to Hajj, ‘Umrah and Visiting the Prophet’s Mosque | Agency of Islamic Enlightenment in Hajj; approved by the Permanent Committee | IslamHouse | 58 | 51 |
| rites | Rites of Hajj and Umrah from the Book and Sunnah | Shaikh Muhammad Nasir-ud-Din al-Albani | IslamHouse | 23 | 41 |
| ahadith | Ahadith pertaining to Hajj from the Sahihayn | Compilation from al-Bukhari and Muslim | IslamHouse | 85 | 120 |
| hady | Rulings on Sacrificial Animals, Offerings, and Slaughtering | The Scientific Committee | Presidency of Religious Affairs | 15 | 10 |
| ten_days | Merit of the First Ten Days of Dhul-Hijjah | The Scientific Committee | Presidency of Religious Affairs | 13 | 7 |
| fasting | Some Rulings on Fasting | The Scientific Committee | Presidency of Religious Affairs | 20 | 12 |

### Online reference

| Id | Title | Body | Pages | Chunks |
|---|---|---|---|---|
| dorar_feqhia | الموسوعة الفقهية: كتاب الحج (the Fiqh Encyclopedia, Book of Hajj), dorar.net/feqhia | مؤسسة الدرر السنية (al-Durar al-Saniyyah), supervised by Shaykh Alawi al-Saqqaf | 113 web pages | 544 |

dorar.net/feqhia is named among the challenge's approved references. All rights are reserved by the foundation. The site's robots.txt allows crawling, but it currently answers requests from servers with 403, so the 113 pages of the Book of Hajj were read once through an ordinary browser session, at a slow pace, and imported as a pack by the specialist. Footnotes were left out; each passage keeps the address of its page, and every answer that uses it links back to the original. The text is not in this repository. The scheduled sync (`/api/sync`, daily) is implemented and will take over once the foundation grants access or an API.

**Verified-answer memory (738 published answers, stored verbatim).**
- 132 fatwas of the Permanent Committee for Scholarly Research and Ifta, from the fatwas book above, with their printed references (collection, volume and page).
- 606 question-and-answer summaries published on the pages of the Fiqh Encyclopedia, each stored with the address of its page.

Only the question is normalised for matching; the answer text is never rewritten.

**Not used.** Two scanned booklets whose OCR dropped words (a missing word can reverse a ruling), a general motivational guide that is not a reference of rulings, one duplicate edition and one off-topic booklet.

**Terminology.** The glossary (`src/lib/glossary/data.ts`, version v2) was checked against the approved dictionary of Sharia terms (Jamhara, islamic-content.com/dictionary), which the challenge annex prefers over machine translation. 47 of 59 entries were found there and carry the id of the entry consulted. The dictionary renders most Hajj terms in English only; 16 entries were confirmed or corrected in Urdu, Indonesian or French and are marked `reviewed: true`. The others remain the team's renderings and are marked as not reviewed. One deliberate difference is documented in the file: the dictionary's entry for "dam" is the general word (blood), while in Hajj it means a compensatory sacrifice.

## Models and services

| Service | Use | Terms |
|---|---|---|
| OpenAI API | generation, understanding, translation, embeddings, speech to text, text to speech | commercial API, OpenAI terms of use |
| Google Gemini API | independent verification and evaluation judge | commercial API, Google terms of service |
| Supabase (Postgres, pgvector) | database and vector search | hosted service; Postgres (PostgreSQL Licence), pgvector (PostgreSQL Licence) |
| Vercel | hosting | hosted service |

No model was trained or fine-tuned. No user data is sent anywhere except the question text to the model providers for answering.

## Software

| Package | Version | Licence |
|---|---|---|
| next | 15.5 | MIT |
| react, react-dom | 19 | MIT |
| @supabase/supabase-js | 2 | MIT |
| zod | 3 | MIT |
| qrcode | 1.5 | MIT |
| @fontsource/readex-pro (Readex Pro typeface) | 5 | OFL-1.1 |
| typescript | 5 | Apache-2.0 |
| vitest | 3 | MIT |
| node-html-parser | 7 | MIT |
| PyMuPDF (extraction script only, not deployed) | 1.x | AGPL-3.0 |

PyMuPDF is used offline to prepare the source pack and is not part of the deployed application.

## Development tools

The code was written with an AI coding assistant (Claude, by Anthropic) under the direction and review of the team. This is stated here in line with the challenge's requirement to log the tools used.

## Data

All 150 evaluation questions are synthetic and were written by the team. The system stores no names, phone numbers or accounts. No real pilgrim conversation was collected or used.
