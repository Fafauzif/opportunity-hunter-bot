# Install the v2.1.0 browsing update

For a spreadsheet already running Opportunity Hunter v2:

1. Extract this ZIP **inside the existing repository folder** and replace overlapping files. Commit and push the repository changes.
2. Open the **existing Google Sheet → Extensions → Apps Script**.
3. Replace the current bot script with the complete contents of `apps_script.gs`. Save. The sidebar is already embedded; do not create a separate HTML file.
4. In the function selector beside **Run**, select **refreshOpportunityViews** and click **Run once**. Approve Google's permission prompt if one appears. Wait for execution to complete. This rebuilds All Opportunities and the category views from the current database. You can rerun it safely.
5. Click **Deploy → Manage deployments → Edit the existing deployment → New version → Deploy**. Keep the existing URL and webhook secret.
6. Reload the spreadsheet. The first tab is now **All Opportunities**, followed by the category tabs. The menu includes **Open info sidebar**.
7. For optional full context, select an opportunity row and use **Opportunity Hunter → Open info sidebar**. To inspect another row, select it and press **Load selected row** in the sidebar. The category/overview tab stays visible.
8. Run GitHub Actions in **test** mode once to check the deployed code, then continue with **full** mode or the existing daily schedule.

Run **refreshOpportunityViews**, not the legacy **upgradeOpportunityHunter** migration. No XLSX import, database replacement or queue reset is needed. The exported XLSX stays a snapshot; these instructions update the live Google Sheet.

## What changes

- **All Opportunities:** every stored record, including Programs and closed/rejected history, with Category and Status filters. Actionable entries appear first.
- **Category views:** Competition, What is this?, Entry Deadline, Eligibility, Solo / Team, Format / Location, Entry Cost, What to Submit, Apply.
- Stored explanations, fit context, benefits, eligibility restrictions and entry requirements are visible in wrapped rows. Blank legacy fields are shown as unavailable rather than invented.
- Unknown costs stay unknown. Offline/final-round travel uncertainty is visible.
- The full-record sidebar replaces automatic navigation to Details. The legacy Details sheet remains accessible through Show background data.
- Personal notes and application progress remain in My Applications.

The deployment health response reports `version: 2.1.0`, `schema_version: 2`. Offline checks pass; native Google authorization, sidebar rendering and live deployment must be checked after installation.
