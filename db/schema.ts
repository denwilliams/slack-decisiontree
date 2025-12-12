import { pgTable, text, timestamp, uuid, jsonb, boolean } from 'drizzle-orm/pg-core';

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: text('team_id').notNull().unique(),
  teamName: text('team_name').notNull(),
  accessToken: text('access_token').notNull(),
  botUserId: text('bot_user_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const decisionTrees = pgTable('decision_trees', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const treeNodes = pgTable('tree_nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  treeId: uuid('tree_id').notNull().references(() => decisionTrees.id, { onDelete: 'cascade' }),
  nodeType: text('node_type').notNull(), // 'decision' or 'answer'
  title: text('title').notNull(),
  content: text('content'),
  parentNodeId: uuid('parent_node_id'),
  orderIndex: text('order_index').notNull().default('0'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const nodeOptions = pgTable('node_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  nodeId: uuid('node_id').notNull().references(() => treeNodes.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  nextNodeId: uuid('next_node_id').references(() => treeNodes.id, { onDelete: 'set null' }),
  orderIndex: text('order_index').notNull().default('0'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const treeSessions = pgTable('tree_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  treeId: uuid('tree_id').notNull().references(() => decisionTrees.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  channelId: text('channel_id'),
  currentNodeId: uuid('current_node_id').references(() => treeNodes.id),
  sessionData: jsonb('session_data'),
  isCompleted: boolean('is_completed').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
