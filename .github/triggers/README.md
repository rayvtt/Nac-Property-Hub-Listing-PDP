# Workflow triggers

Pushing **any change** to any file in this directory fires the on-demand workflows that drive new-listing automation:

- `create-pdp.yml` — scaffolds `properties/<slug>.html` for new Live Notion rows
- `create-wp-page.yml` — creates the WP page under the country parent
- `sync-images.yml` — extracts images from Drive/Berkeley → Cloudflare → Notion
- `sync-notion.yml` — patches HTML with current Notion content

All four are also on `*/5 * * * *` cron, but pushing here bypasses the cron lag.

## How

Append a timestamp to `last-trigger.txt`, then `git push origin main`. The same commit fires all four workflows in parallel. Each workflow is idempotent — it skips rows that are already processed, so re-running is safe.

The assistant uses `mcp__github__create_or_update_file` to push from chat in response to "generate listing for X" requests, so the user never needs to manually run a workflow from the Actions tab.

## Why a sentinel file (not workflow_dispatch)?

`workflow_dispatch` requires a PAT or the `gh` CLI to fire from outside the Actions tab. Push triggers are simpler: any commit to `main` touching this path fires the watchers, with no auth setup beyond standard repo write access.
