# What existed before the build window

The challenge evaluates the work done during the build window and asks that anything prepared earlier be declared.

| Item | When | Status |
|---|---|---|
| The idea and its written description (the qualification file) | before 1 October 2026 | pre-existing, submitted for qualification |
| Technical blueprint (architecture and plan, a document) | 1 to 4 October 2026 | pre-existing design document, no code |
| The 150-question synthetic test set | 1 to 4 October 2026 | written before any code, kept unchanged; see `src/lib/eval/cases.json` |
| Source PDFs | published by their publishers | third-party material, see `SOURCES-AND-LICENSES.md` |
| **All source code in this repository** | **5 and 6 October 2026** | written during the build window |

No code, prompt, schema, model or dataset from an earlier project was reused. The git history of this repository starts on 5 October 2026.

One note on the test set: its category C refers to placeholder answer codes (VA-01 to VA-10) from the planning stage. In the built system the verified-answer memory is seeded with 132 published fatwas instead, so category C is scored as "answered with a traceable source" (verified or grounded). The questions themselves were not altered.
