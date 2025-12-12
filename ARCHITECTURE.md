# Architecture

## Overview

This application is built with Next.js 16 and uses Hono for API routing. It integrates with Slack to provide decision tree workflows for a single workspace.

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS
- **API**: Hono (edge runtime compatible)
- **Database**: Neon Serverless PostgreSQL with Drizzle ORM
- **Slack Integration**: Slack Web API (single workspace)
- **Deployment**: Vercel (Edge Functions)

## Database Schema

### Tables

#### `decisionTrees`
Stores decision tree definitions
- `id`: UUID (primary key)
- `name`: Tree name
- `description`: Optional description
- `isActive`: Whether the tree is active
- `createdBy`: User ID who created it
- Timestamps

#### `treeNodes`
Individual nodes in a decision tree
- `id`: UUID (primary key)
- `treeId`: Foreign key to decisionTrees
- `nodeType`: 'decision' or 'answer'
- `title`: Node title
- `content`: Node content/description
- `parentNodeId`: Optional parent node
- `orderIndex`: Sort order
- Timestamps

#### `nodeOptions`
Options/choices for decision nodes
- `id`: UUID (primary key)
- `nodeId`: Foreign key to treeNodes
- `label`: Option text
- `nextNodeId`: Next node to navigate to
- `orderIndex`: Sort order
- Timestamp

#### `treeSessions`
Active user sessions through a decision tree
- `id`: UUID (primary key)
- `treeId`: Foreign key to decisionTrees
- `userId`: Slack user ID
- `channelId`: Optional channel
- `currentNodeId`: Current position in tree
- `sessionData`: JSON data for the session
- `isCompleted`: Completion status
- Timestamps

## API Routes

All routes are handled by Hono in `/app/api/[[...route]]/route.ts`:

- `POST /api/slack/events` - Slack events (app_home_opened, etc.)
- `POST /api/slack/interactions` - Interactive components (buttons, modals)
- `GET /api/health` - Health check endpoint

## Slack Integration Flow

### Home Tab
1. User opens app home tab
2. Slack sends `app_home_opened` event
3. App fetches all decision trees from database
4. App publishes home view with tree list

### Decision Tree Execution
1. User clicks option in decision tree
2. Slack sends interaction payload
3. App looks up next node
4. App updates message with next question or answer

## Key Components

### `/lib/slack.ts`
- Slack client singleton (using bot token from env)
- Request verification using signing secret

### `/lib/blocks.ts`
- Slack Block Kit builders
- Home view construction
- Decision/answer view builders

### `/db/schema.ts`
- Drizzle ORM schema definitions
- Table relationships

### `/db/index.ts`
- Database client initialization
- Neon serverless connection

## Security

- All Slack requests are verified using signing secret
- Bot token stored securely in environment variables
- No OAuth flow - single workspace deployment
- Edge runtime for improved security and performance

## Single Workspace Design

This app is designed for deployment to a single Slack workspace. The bot token is configured via environment variables, eliminating the need for OAuth flows and workspace management. This makes the app simpler to deploy and maintain while providing all the core decision tree functionality.
