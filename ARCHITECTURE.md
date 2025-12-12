# Architecture

## Overview

This application is built with Next.js and uses Hono for API routing. It integrates with Slack to provide decision tree workflows.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, Tailwind CSS
- **API**: Hono (edge runtime compatible)
- **Database**: Neon Serverless PostgreSQL with Drizzle ORM
- **Slack Integration**: Slack Web API & OAuth
- **Deployment**: Vercel (Edge Functions)

## Database Schema

### Tables

#### `workspaces`
Stores Slack workspace installations
- `id`: UUID (primary key)
- `teamId`: Slack team ID (unique)
- `teamName`: Workspace name
- `accessToken`: OAuth access token
- `botUserId`: Bot user ID
- Timestamps

#### `decisionTrees`
Stores decision tree definitions
- `id`: UUID (primary key)
- `workspaceId`: Foreign key to workspaces
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

- `GET /api/slack/oauth` - OAuth callback handler
- `POST /api/slack/events` - Slack events (app_home_opened, etc.)
- `POST /api/slack/interactions` - Interactive components (buttons, modals)
- `GET /api/health` - Health check endpoint

## Slack Integration Flow

### OAuth Installation
1. User clicks "Add to Slack"
2. Slack redirects to `/api/slack/oauth` with code
3. App exchanges code for access token
4. Workspace data saved to database

### Home Tab
1. User opens app home tab
2. Slack sends `app_home_opened` event
3. App fetches user's decision trees
4. App publishes home view with tree list

### Decision Tree Execution
1. User clicks option in decision tree
2. Slack sends interaction payload
3. App looks up next node
4. App updates message with next question or answer

## Key Components

### `/lib/slack.ts`
- Slack client utilities
- Request verification
- Token management

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
- OAuth tokens stored securely in database
- Environment variables for sensitive data
- Edge runtime for improved security and performance
