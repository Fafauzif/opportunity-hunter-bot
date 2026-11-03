# Validation and scope

Built from repository commit `77f27b7e6052a83ba35cb4a5a56a94dca7dd6b81` and the attached workbook snapshot, on 3 November 2026.

## Offline validation

Result: **32 Python tests passed; 16 Apps Script emulator checks passed**, including a migration replay on all 371 uploaded opportunity records.

- Python unit/integration tests use fake provider responses and make no network requests.
- Query scheduling tests cover every competition family and rotation across runs.
- Page allocation tests check fair selection and preservation of deferred candidates.
- Model validation checks exact candidate IDs, types, dates, missing/duplicate/foreign results and bounded physical attempts.
- Cost tests cover registration/participation fees, free-application ambiguity, negation, unknown amounts and offline-final expenses.
- Ranking tests ensure scholarships do not generate competition priority alerts and alerts are sorted before capping.
- Pipeline tests check acknowledged persistence before alerts, failed saves, read-only dry runs and budgeted reviewer verification.
- Apps Script emulation checks identity migration, repeat upgrades, backup behavior, category width, monthly reservations, same-URL new editions, idempotent saves and record lookup.
- Migration was also exercised against all 371 uploaded opportunity records, with all record titles preserved and unique nonblank primary IDs after repair. The source XLSX was not modified.
- No real API keys were used. Nothing was pushed to GitHub, deployed to Google, or sent to Telegram.

## Live verification required at installation

Provider credentials, actual model/schema compatibility, quota availability, Google authorization, Apps Script execution limits and the native Sheets layout require the supplied verify/test steps. The emulator validates application logic, not the Google platform itself.

## Boundaries

- The stronger reviewer is a candidate improvement, not a proven accuracy gain. Compare it on manually checked cases before drawing conclusions.
- Source retrieval does not guarantee every competition, private announcement, social-only poster or image-only rulebook is captured.
- Deadline timestamps are preserved in raw evidence; displayed urgency uses date-level WIB calculations. Date-only/unknown-timezone fields remain flagged; exact-hour countdowns are not implemented.
- Initial benchmark entries were already in the user's database. They are presence/regression checks, not evidence of broad-search recall.
- Strict identity rules reduce incorrect annual-edition merges; title variants can remain as duplicates requiring review.
- Reviewer reservations are intentionally conservative. A missing/ambiguous cost keeps the reservation, and may leave some monthly allowance unused.
- Notification claims avoid routine duplicate sends. A network failure after Telegram accepts a message can leave an uncertain claim requiring manual inspection; exactly-once delivery across independent services is not promised.
- Category rows are generated. Manual edits belong in My Applications; other user-created tabs are not part of the generated views.

## Primary API references

- https://exa.ai/docs/reference/search
- https://exa.ai/docs/reference/get-contents
- https://ai.google.dev/api/generate-content
- https://openrouter.ai/docs/guides/features/structured-outputs
- https://openrouter.ai/docs/guides/routing/provider-selection
- https://developers.google.com/apps-script/concepts/deployments

The packaged workflow and configuration avoid new search-provider accounts. Prices and availability can change; verification fails or defers the reviewer rather than silently choosing an unbounded paid fallback.
