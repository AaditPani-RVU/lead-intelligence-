# n8n Workflows

Two flows are included. Import both via **Workflows → Import from File** in the n8n UI (`http://localhost:5678`).

## 01 — Google Sheet → Classify Lead → Gmail

Triggers when a new row is added to a Google Sheet, sends the data to the backend API for classification, then emails you the result including the AI-drafted reply.

**Google Sheet column order expected:** `name | email | phone | source | message`

**Setup steps:**
1. In n8n, go to **Credentials** and add:
   - A **Google Sheets OAuth2** credential (connect your Google account)
   - A **Gmail OAuth2** credential (connect your Google account)
2. Import `01_sheet_to_lead.json`
3. Open the **Google Sheets Trigger** node and replace `YOUR_GOOGLE_SHEET_ID_HERE` with your actual Sheet ID (found in the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID/edit`)
4. Open the **Send Gmail Notification** node and update `YOUR_EMAIL@gmail.com`
5. Update both credential references from `YOUR_CREDENTIAL_ID` to the actual credential IDs shown in your n8n credentials list
6. Click **Save**, then toggle the workflow to **Active**

## 02 — Hourly Hot Lead Digest → Gmail

Runs every hour, fetches all uncontacted Hot leads from the API, and sends a formatted digest email.

**Setup steps:**
1. Import `02_hot_digest.json`
2. Open the **Send Digest Email** node and update `YOUR_EMAIL@gmail.com` and the credential ID
3. Activate the workflow

To test immediately without waiting an hour: open the workflow, click **Execute Workflow**.

## Running n8n locally

```bash
# Via Docker (recommended — included in docker-compose.yml)
docker compose up n8n

# Or directly
npm install -g n8n
n8n start
```

n8n opens at `http://localhost:5678` (no login required in local mode).
