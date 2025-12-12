# slack-decisiontree

Build decision tree workflows in Slack and run them anywhere.

## Key Concepts

- Home tab in Slack allows you to set up decision trees
- Decision trees are a combination of decisions (questions to progress to the next screen) and answers (the final screen)
- You can run one from anywhere in slack with a Slack workflow

## Tech Stack

- Next.js 16 (App Router) - run on Vercel
- React 19
- Hono with Next.js for API routes
- Neon serverless Postgres for storage
- Drizzle ORM for database management
- Tailwind CSS for styling
- Slack Web API (single workspace)

## Quick Start

### Prerequisites

- Node.js 24 or higher
- A Slack workspace
- A Neon database (or any PostgreSQL database)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables (see `.env.example`):
```bash
cp .env.example .env.local
```

3. Configure your Slack app (see [SETUP.md](./SETUP.md) for detailed instructions)

4. Push database schema:
```bash
npm run db:push
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

### Build for Production

```bash
npm run build
npm start
```

### Deploy to Vercel

```bash
vercel
```

## Documentation

- [Setup Guide](./SETUP.md) - Complete setup instructions
- [Architecture](./ARCHITECTURE.md) - Technical architecture and design

## Features

- ✅ Single workspace deployment (no OAuth complexity)
- ✅ Home tab management interface
- ✅ Interactive decision tree builder
- ✅ Real-time decision tree navigation
- ✅ Session tracking
- ✅ Serverless database integration
- ✅ Edge runtime for optimal performance

## Project Structure

```
├── app/
│   ├── api/
│   │   └── [[...route]]/
│   │       └── route.ts       # Hono API routes
│   ├── layout.tsx             # Root layout
│   ├── page.tsx               # Landing page
│   └── globals.css            # Global styles
├── db/
│   ├── schema.ts              # Database schema
│   └── index.ts               # Database client
├── lib/
│   ├── slack.ts               # Slack utilities
│   └── blocks.ts              # Slack Block Kit builders
├── .env.example               # Environment variables template
└── README.md                  # This file
```

## License

MIT
