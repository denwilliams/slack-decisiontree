# Setup Guide

## Prerequisites

- Node.js 18+ installed
- A Slack workspace where you have admin access
- A Neon (or PostgreSQL) database account
- A Vercel account (for deployment)

## 1. Database Setup

1. Create a new database on [Neon](https://neon.tech)
2. Copy your connection string (it should look like: `postgresql://user:password@host/database`)
3. Save this for the environment variables

## 2. Slack App Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Choose "From scratch" and give it a name
3. Under "OAuth & Permissions", add these Bot Token Scopes:
   - `app_mentions:read`
   - `channels:read`
   - `chat:write`
   - `im:history`
   - `im:read`
   - `im:write`
   - `users:read`

4. Under "Event Subscriptions":
   - Enable Events
   - Add your Request URL: `https://your-domain.vercel.app/api/slack/events`
   - Subscribe to bot events:
     - `app_home_opened`

5. Under "Interactivity & Shortcuts":
   - Enable Interactivity
   - Request URL: `https://your-domain.vercel.app/api/slack/interactions`

6. Under "App Home":
   - Enable Home Tab

7. **Install the app to your workspace**:
   - Go to "Install App" in the sidebar
   - Click "Install to Workspace"
   - Authorize the app

8. **Get your credentials**:
   - Under "OAuth & Permissions", copy your "Bot User OAuth Token" (starts with `xoxb-`)
   - Under "Basic Information", copy your "Signing Secret"

## 3. Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env.local` file:
   ```
   DATABASE_URL=your_neon_connection_string
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_SIGNING_SECRET=your_signing_secret
   ```

4. Push database schema:
   ```bash
   npm run db:push
   ```

5. Start development server:
   ```bash
   npm run dev
   ```

6. Use a tool like [ngrok](https://ngrok.com) to expose your local server:
   ```bash
   ngrok http 3000
   ```
   Update your Slack app's Request URLs with the ngrok URL

## 4. Deployment to Vercel

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Deploy:
   ```bash
   vercel
   ```

3. Add environment variables in Vercel dashboard:
   - `DATABASE_URL`
   - `SLACK_BOT_TOKEN`
   - `SLACK_SIGNING_SECRET`

4. Update Slack app's Request URLs with your Vercel domain

## 5. Usage

1. Open Slack and go to the app's Home tab
2. Click "Create New Decision Tree"
3. Build your decision tree with questions and answers
4. Use Slack workflows to trigger decision trees
