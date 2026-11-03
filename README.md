# Opportunity Hunter v2

Competition-first discovery with Exa, Gemini extraction, selective OpenRouter review, Google Sheets category views and Telegram alerts.

**Installing over v1? Open [START-HERE.md](START-HERE.md).** Keep the existing repository, spreadsheet, script properties and deployment URL. Do not reimport the workbook or create a second Apps Script project.

## v2.0.1 queue date fix

Native Sheets dates in `Bot Queue → Next Check` were compared using `String(date)` against an ISO date. That silently returned no due work while searches and connection verification still passed. Dates are now normalized before selection and sorting. The summary also excludes Programs when disabled, and reports processed event/listing/other pages plus due/waiting URL counts.

For an existing v2 installation, update `bot_v2.py` and `hunter_core.py` in GitHub. Replace the existing Apps Script bot code with `apps_script.gs`, save, and edit the **existing deployment → New version → Deploy**. The `/exec` health response should report `version: 2.0.1`, `schema_version: 2`. No migration or queue reset is needed for this patch. Run `test`, then `full` after checking the report. Verification alone does not process the queue.

`Saved / updated` counts acknowledged event-record inserts/updates, including records kept for review or closed/rejected history. `New competitions` counts newly inserted active competition records. `Pending source URLs` counts enabled-family URLs due now or unprocessed/retry URLs waiting for a future date. It does not count future revisits of completed rows. Listing pages may add child URLs without saving an event. Coverage counts successful search requests, not events saved. Full mode still caps content attempts at 60 and Gemini calls at 30; supporting pages consume those same limits, so a backlog takes multiple runs and may grow while discovery continues.

## Run modes

- `verify`: checks deployed Sheets schema, Exa, Gemini structured output, optional OpenRouter structured output and Telegram. Uses small real API requests; no opportunity inserts.
- `test`: five competition-family searches, up to eight pages/eight extraction calls, and up to one selective strong review. Writes real results.
- `dry-run`: small Exa/Gemini analysis preview without Sheets mutations, Telegram or strong-review requests. Retrieval/extraction usage may still be billed by your providers.
- `full`: default 16 searches, up to 60 attempted content pages and 30 physical extraction attempts. Query rotation and queued work persist in Sheets.
- `bootstrap`: 20 rotating searches with the same page/model caps. No unbounded import.

The workflow runs daily at 08:07 WIB (01:07 UTC), subject to GitHub scheduling delays. `Settings.enabled=FALSE` pauses discovery. No local state files or Actions cache are required for queue/rotation/budget persistence.

## Local tests

Python 3.11+; standard library only:

```sh
python -m unittest discover -s tests -v
node tests/apps_script_test.js
```

Node is needed only for offline Apps Script tests, not the deployed bot. The test emulator is not a substitute for native Sheets verification.

## Project files

- `main.py`: entry point.
- `bot_v2.py`: network integrations and pipeline orchestration.
- `hunter_core.py`: pure scheduling, validation, identity, scoring and prompt rules.
- `config.json`: non-secret defaults, model budget and rotating source queries.
- `apps_script.gs`: complete Google Apps Script file to paste into the existing bot project.
- `.github/workflows/main.yml`: the active scheduled workflow.
- `opportunity-hunter.yml`: reference copy only; not an additional active workflow.
- `START-HERE.md`: installation, daily use, troubleshooting and rollback.
- `VALIDATION.md`: checks and limits.

## Data and navigation

Nine-column category tabs draw from one background Opportunities table. Details presents full facts vertically. My Applications stores editable progress by stable opportunity ID. Queue, rotation cursor, notification claims and reviewer-cost reservations persist behind the scenes. Reused annual URLs can be revisited without permanently blocking new editions. Uncertain identity matches are kept separate rather than merged speculatively.

The upgrade backs up the existing spreadsheet once, preserves its webhook secret, reconciles legacy IDs, and migrates meaningful manual progress. It is rerunnable. Category views are regenerated; edit personal progress only in My Applications.

## Coverage and evidence

Family-level search counts, processing outcomes, deadlines and review flags appear in run reports. The Benchmark tab is seeded with up to 20 already-saved competition references as a **presence check**, not an independent recall test. Add manually confirmed events that were missed to build a meaningful discovery benchmark. Monitoring benchmark URLs and general web discovery measure different things.

Exa text retrieval can handle supported documents, but inaccessible/image-only pages may still need manual information or later OCR work. The pipeline fetches at most one linked supporting rules/application page per event under the shared page cap. Listings expand only source-supported links. Unavailable pages remain queued. No guarantee of internet-wide completeness is implied.

Search-provider costs are recorded when returned; missing usage is not proof of zero cost. The $1 default budget covers this bot's OpenRouter reviewer only. Other model/search usage follows your account's tier and billing.
