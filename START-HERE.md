# Install Opportunity Hunter v2

This is the complete Option B upgrade. Keep using your **existing repository, existing Google Sheet, existing Apps Script project, and existing webhook URL**.

You need to do the installation once. After that, the bot runs daily at approximately **08:07 WIB**. GitHub may start scheduled jobs late; this is not an exact-time service.

## Before you start

- Download and extract `Opportunity-Hunter-v2-Upgrade.zip`.
- Open your existing GitHub repository and your existing Google Sheet in separate browser tabs.
- Have your OpenRouter API key ready. Do not paste it into Python, Apps Script, config.json, a spreadsheet cell, a commit, or a chat message.
- The package contains no API keys and does not contain your workbook. Do not reimport the old XLSX over your live sheet.

## 1. Pause the old schedule

1. In GitHub, open your repository → **Actions**.
2. Select **Opportunity Hunter Bot**.
3. Open the workflow's **…** menu → **Disable workflow**.
4. If a run is already in progress, let it finish before proceeding.

Checkpoint: no old run is writing to the sheet while you upgrade it.

## 2. Put the new files in GitHub

The ZIP is an overlay: its files go **directly in the repository root**, not inside an extra folder named after the ZIP.

### Browser method — no Git commands needed

1. Open your repository's **Code** tab and select its default branch, normally `main`.
2. Click **Add file → Upload files**.
3. From the extracted ZIP, drag the files **and folders** into the upload area. Include the `.github` folder and `tests` folder. Do not upload the ZIP itself.
4. Commit the changes with a message such as `Upgrade Opportunity Hunter to v2`.
5. Confirm that GitHub shows these paths:

```text
main.py
bot_v2.py
hunter_core.py
config.json
apps_script.gs
START-HERE.md
tests/test_core.py
tests/test_flow.py
.github/workflows/main.yml
```

If your browser skips `.github`, open the existing `.github/workflows/main.yml` file on GitHub, click its pencil icon, and replace its contents with the ZIP's file of the **same path**. Commit that edit. This edits the existing workflow instead of creating a second schedule.

### If you already use a local clone / GitHub Desktop

Extract the ZIP into your local repository folder → choose **Replace the files in the destination** → review and commit the changed files → push. Extracting on your PC alone does not update GitHub. Include `.github/workflows/main.yml` in your commit.

Checkpoint: `main.py` imports `main` from `bot_v2`, and the workflow's default manual mode is `verify`. Your existing Actions secrets are still present; uploading code does not replace them.

## 3. Add the one new secret

1. Repository → **Settings → Secrets and variables → Actions**.
2. Click **New repository secret**.
3. Name: **`OPENROUTER_API_KEY`**.
4. Secret: paste your OpenRouter API key → **Add secret**.

Keep your six existing secrets unchanged:

```text
EXA_API_KEY
GEMINI_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
APPS_SCRIPT_WEBHOOK_URL
APPS_SCRIPT_WEBHOOK_SECRET
```

The OpenRouter secret is optional if you want Gemini-only operation. Without it, the bot keeps uncertain records marked for review rather than pretending a stronger review happened.

Checkpoint: all required secret **names** appear in GitHub. You do not need to reveal their values to anyone.

## 4. Replace the Apps Script code

1. In your **existing Google Sheet**, choose **Extensions → Apps Script**.
2. In the Files list, open the file holding your existing Opportunity Hunter code, often `Code.gs`.
3. On your computer, open the supplied **`apps_script.gs`** in a text editor, such as Notepad.
4. Copy its entire contents.
5. Replace the old bot code in that Apps Script file with the supplied code. Save it.

Replace the existing bot file; do **not** leave the old bot code beside a second copy with the same functions/constants. If your project has unrelated scripts, leave those alone. Do not paste `tests/apps_script_test.js` into Apps Script.

Checkpoint: the top of the new bot script says **2.0.0**. Existing Script Properties, including `WEBHOOK_SECRET`, remain intact. Do not rotate or recreate that secret.

## 5. Run the sheet upgrade once

1. In Apps Script's function dropdown, select **`upgradeOpportunityHunter`**.
2. Click **Run**.
3. If Google asks for authorization, select your account and review/allow the permissions for the script you just installed. The backup step needs permission to copy your spreadsheet.
4. Wait for the completion message. This may take a little time with your existing records.
5. Return to the Google Sheet and reload it.

The upgrade will:

- Make a backup copy before its first migration.
- Keep your existing opportunities and historical records.
- Reconcile the legacy ID locations and retain conflicting IDs as flagged aliases.
- Move meaningful existing personal progress into **My Applications** without discarding the original fields.
- Add category tabs with **nine visible columns**.
- Add **Details**, **My Applications**, background processing tables and reference checks.
- Update expired deadline labels and initialize scheduled source revisits.

Checkpoint: category tabs appear, **Settings → Backup before upgrade** contains a backup URL, and you can open an opportunity's Details. Original data is available through **Opportunity Hunter → Show background data**.

The upgrade is designed to be rerunnable. If the execution timed out, check for the backup URL in Apps Script Project Settings → Script Properties (`V2_BACKUP_URL`), then rerun the same function. Do not delete data to make it succeed. If it reports a conflicting unowned sheet name, rename that existing user tab rather than deleting it, then rerun.

## 6. Publish the new script version to the existing deployment

Saving code is **not** the same as updating the bot's `/exec` deployment.

1. Apps Script → **Deploy → Manage deployments**.
2. Select the **existing web app deployment** used by your bot.
3. Click its pencil / **Edit** button.
4. In **Version**, choose **New version**.
5. Keep its existing execution/access settings. For this webhook design, it executes as your account and allows requests without Google login; the script checks the shared webhook secret.
6. Click **Deploy**.

The URL should stay the same because you edited the existing deployment. **Do not click New deployment** unless you intentionally want to change the webhook URL and update the matching GitHub secret.

Checkpoint: opening your existing `/exec` URL in a browser shows JSON including `"version":"2.0.0"` and `"schema_version":2`. It does not expose your spreadsheet data or secret.

## 7. Run verification

1. Return to GitHub → **Actions → Opportunity Hunter Bot**.
2. Re-enable the workflow. Choose **Run workflow**, select the default branch, choose **verify**, then run it.
3. Open the run and wait for it to finish.
4. Check Telegram for the verification message.

Expected core checks: Sheets PASS, Exa PASS, Gemini JSON PASS, Telegram PASS. OpenRouter JSON should also pass if configured, funded/available and within the reviewer budget. If it says unavailable/deferred, inspect the run report before deciding whether Gemini-only operation is enough.

Verification makes small real API requests, including one budgeted reviewer request if available. It does not insert opportunity rows. At the bottom of the GitHub run, download **opportunity-hunter-run-report** if you need the detailed JSON report.

If you need more time to configure things after enabling the workflow, set **Settings → enabled → FALSE**. Scheduled discovery then pauses. Verification still works.

## 8. Run the small real test, then full mode

1. Run the workflow again with mode **test**.
2. This performs five small searches covering all five competition families, fetches at most eight pages and makes at most eight extraction calls. It can save/update real records and send eligible alerts.
3. Confirm that the category sheets refresh and your saved records/notes remain intact.
4. If satisfied, run **full** once. Then leave the daily schedule enabled.

The initial monitor queue includes old accepted and rejected competition sources. It drains over multiple daily runs. You do not need to run bootstrap repeatedly. Programs are excluded from default search/revisit work unless you set `include_programs` to TRUE.

## Everyday use

- Browse the category tabs. Their rows are generated views; do not type personal notes into them.
- Select an event row → **Opportunity Hunter → Open details for selected row**.
- Clicking the **Open details** cell can also open Details after the sheet has been reloaded. If Google skips the selection trigger, the menu method is reliable.
- To save an event, select its row → **Opportunity Hunter → Save selected opportunity**.
- Edit your status, next action, personal due date, teammates, priority and notes in **My Applications**. Those rows are keyed by stable ID.
- Do not replace or edit the hidden ID column in My Applications.
- Use **Opportunity Hunter → Settings and run checks** to pause the bot, adjust costs, or edit your profile.
- Use **Show background data** to inspect old/expired records, the queue, history, reference list or run logs. Refresh category views to put background data away again.

In Details, the main deadline is the first actionable entry cutoff. Registration and submission dates remain separate. The sheet recalculates remaining days during refresh; that is different from a fresh check of the organizer's page.

## Settings you can change without editing code

| Setting | Default | What changing it does |
| --- | --- | --- |
| enabled | TRUE | FALSE pauses scheduled discovery |
| include_programs | FALSE | TRUE also searches/revisits secondary programs |
| review_enabled | TRUE | FALSE disables the OpenRouter reviewer |
| review_monthly_budget_usd | 1 | 0 prevents new paid reviewer calls |
| application_fee_limit_idr | 300000 | Guideline for all known mandatory entry fees combined |
| personal_cost_guideline_idr | 1000000 | Guideline for personal expenses, including required travel |
| telegram_score_threshold | 75 | Score threshold; evidence/eligibility/cost gates still apply |
| profile | JSON object | Fill in age, university, university_country and residence only when accurate |

No model output or search result should invent a profile fact. The starting profile retains Indonesian undergraduate targeting from your original bot, with age/enrollment/residence details unknown. If that targeting is wrong, edit the profile before full mode.

Advanced model names, query sources and API caps live in `config.json`. Gemini's model name is in the workflow environment. Those are settings, not secrets.

## Reviewer budget: what it does

The bot reserves a conservative cost amount in the spreadsheet **before** each paid reviewer request. It sends OpenRouter provider-price ceilings and limits output tokens. Actual reported cost replaces a reservation when available. Missing costs/timeouts leave the reservation in place, so it does not spend again on an uncertain result. The monthly ledger persists across GitHub runs and resets its allowance by month in WIB.

This governs **this bot's reviewer requests**, not all spending on your OpenRouter account. A separate OpenRouter key spending limit is a useful additional control. Funding or key availability does not make a Gemini API account automatically free; verify your own Google project tier.

## If something does not work

| Message / symptom | What to do |
| --- | --- |
| Sheet is not upgraded to v2 | Run upgradeOpportunityHunter, then edit the existing deployment to New version |
| Browser /exec URL still says version 1 | You saved code but did not update the deployment, or GitHub points to another deployment |
| UNAUTHORIZED | Check the existing webhook secret in Apps Script Project Settings and the matching GitHub Actions secret. Do not rotate it casually |
| Apps Script reports duplicate declarations | Remove the duplicate copy of the old bot script; retain one complete v2 bot file |
| Existing WEBHOOK_SECRET missing | You opened another project or removed Script Properties. Restore the original project/secret; do not create a replacement sheet |
| Gemini HTTP 404 | Check model availability for your account; update GEMINI_MODEL in the workflow to an available structured-output model |
| Gemini HTTP 429 | Free/project quota or rate limit reached. Candidates stay queued for later runs |
| Exa HTTP 401 / 402 / 429 | Check the API key, available credits and rate limits |
| OpenRouter unavailable / deferred | Check the new secret, credits, model availability, provider price ceilings and reviewer budget. Uncertain records retain review flags |
| Reviewer budget exhausted | Wait for the next month, keep review pending, or explicitly raise your chosen budget |
| Telegram rejected message | Open the bot and press Start; confirm bot token and chat ID |
| No priority alerts | Check stored results and review flags. Missing costs/eligibility/deadlines are retained, not automatically promoted |
| Old records disappeared from category view | Expired/rejected records remain in the background Opportunities table |
| A category has few events | Check family coverage and queue state. Searching a category does not guarantee eligible open events exist |
| Manual button says no row selected | Select a data row below the category headers, not the title/summary row |
| Wrong age/university eligibility | Correct profile, keep evidence visible, and revisit the source; nationality alone does not satisfy enrollment rules |

## Roll back if needed

1. Pause the workflow.
2. In Apps Script → Manage deployments, edit the existing deployment back to its previous version.
3. Revert the GitHub upgrade commit, or restore the previous repository files.
4. Original raw data and old columns remain available. The pre-upgrade copy is linked from Settings for recovery/reference. If you have added new information since upgrade, make another copy before restoring old data.

The backup is a recovery reference, not a replacement installation target. Do not change GitHub's webhook URL to a backup spreadsheet.

## What was tested before delivery

See `VALIDATION.md`. Python behavior and Apps Script migration were tested offline, including your 371-record snapshot. Actual Google authorization, live provider responses, and the native Sheets layout must be checked through the installation verification above. No live service was deployed or charged while building this package.
