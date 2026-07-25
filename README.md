# Opportunity Hunter Bot

An automated Python bot that discovers undergraduate opportunities, analyzes
eligibility and funding with Gemini, stores a broad database in Google Sheets,
and sends selective Telegram priority alerts.

## What it searches for

- Leadership and youth ambassador programs
- Fellowships, exchanges, summer schools, and short programs
- Public policy, governance, development, and SDG opportunities
- Essay, writing, policy memo, and research competitions
- Marketing, branding, strategy, and business case competitions
- Public speaking, pitching, presentation, and communication contests
- Entrepreneurship and social-impact competitions
- Innovation challenges and non-technical hackathons
- Youth summits, conferences, forums, awards, grants, debate, and MUN

## Required GitHub repository secrets

- `EXA_API_KEY`
- `GEMINI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `APPS_SCRIPT_WEBHOOK_URL`
- `APPS_SCRIPT_WEBHOOK_SECRET`

## Beginner upload instructions

1. Download and extract the project ZIP.
2. Open your private GitHub repository.
3. Select **Add file → Upload files**.
4. Drag every extracted item into the upload area, including the `.github`
   folder.
5. Enter `Add Opportunity Hunter bot` as the commit message.
6. Select **Commit changes**.

The repository should contain:

```text
.github/workflows/opportunity-hunter.yml
main.py
requirements.txt
README.md
.env.example
.gitignore
apps_script.gs
```

## First run

1. Open the repository's **Actions** tab.
2. Select **Opportunity Hunter Bot**.
3. Select **Run workflow**.
4. Choose `connections`.
5. Run it.

A successful connection test sends a Telegram message confirming that Exa,
Gemini, Google Sheets, and Telegram are connected.

Then run `test`. This performs two real searches, analyzes a small number of
pages, and writes real opportunity rows to Google Sheets.

After the test succeeds, run `full` once manually. Scheduled runs then execute
every day at 08:07 Asia/Jakarta time.

## Run modes

- `connections`: checks every integration with minimal API usage.
- `test`: two searches and up to eight new content pages.
- `dry-run`: analyzes a small sample without writing or sending messages.
- `full`: sixteen searches and up to sixty new content pages.

## Cost controls

The full mode has hard caps:

- Maximum 16 Exa searches
- Maximum 10 results per search
- Maximum 60 full page content fetches
- Maximum 30 Gemini calls
- Maximum 12 Telegram priority alerts

Existing URLs are checked against Google Sheets before full page content is
retrieved. This reduces repeat processing and Exa content charges.

## Editing thresholds

Defaults are inside the GitHub workflow and `main.py`:

- Telegram score threshold: 75
- Application fee guideline: Rp300,000
- Personal cost guideline: Rp1,000,000
- Telegram alerts: moderate priority only
- Google Sheets policy: broad database

Do not put API keys directly into `main.py` or `.env.example`.
