import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { db } from '@/db';
import { decisionTrees, treeNodes, nodeOptions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { slackClient, verifySlackRequest } from '@/lib/slack';
import { buildHomeView, buildDecisionView, buildAnswerView } from '@/lib/blocks';

export const runtime = 'edge';

const app = new Hono().basePath('/api');

// Slack events endpoint
app.post('/slack/events', async (c) => {
  const body = await c.req.text();
  const payload = JSON.parse(body);

  // Handle URL verification
  if (payload.type === 'url_verification') {
    return c.json({ challenge: payload.challenge });
  }

  // Verify request signature
  const signature = c.req.header('x-slack-signature');
  const timestamp = c.req.header('x-slack-request-timestamp');

  if (!signature || !timestamp) {
    return c.text('Missing signature', 401);
  }

  if (!verifySlackRequest(signature, timestamp, body)) {
    return c.text('Invalid signature', 401);
  }

  // Handle app_home_opened event
  if (payload.event?.type === 'app_home_opened') {
    const userId = payload.event.user;

    const trees = await db.select().from(decisionTrees);

    await slackClient.views.publish({
      user_id: userId,
      view: {
        type: 'home',
        blocks: buildHomeView(trees),
      },
    });
  }

  return c.json({ ok: true });
});

// Slack interactions endpoint
app.post('/slack/interactions', async (c) => {
  const body = await c.req.text();
  const payload = JSON.parse(new URLSearchParams(body).get('payload')!);

  const userId = payload.user.id;

  // Handle create tree action
  if (payload.type === 'block_actions' && payload.actions[0]?.action_id === 'create_tree') {
    await slackClient.views.open({
      trigger_id: payload.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'create_tree_modal',
        title: {
          type: 'plain_text',
          text: 'Create Decision Tree',
        },
        submit: {
          type: 'plain_text',
          text: 'Create',
        },
        blocks: [
          {
            type: 'input',
            block_id: 'name',
            label: {
              type: 'plain_text',
              text: 'Name',
            },
            element: {
              type: 'plain_text_input',
              action_id: 'name_input',
              placeholder: {
                type: 'plain_text',
                text: 'Enter tree name',
              },
            },
          },
          {
            type: 'input',
            block_id: 'description',
            label: {
              type: 'plain_text',
              text: 'Description',
            },
            optional: true,
            element: {
              type: 'plain_text_input',
              action_id: 'description_input',
              multiline: true,
              placeholder: {
                type: 'plain_text',
                text: 'Enter tree description',
              },
            },
          },
        ],
      },
    });
  }

  // Handle tree creation submission
  if (payload.type === 'view_submission' && payload.view.callback_id === 'create_tree_modal') {
    const name = payload.view.state.values.name.name_input.value;
    const description = payload.view.state.values.description.description_input.value;

    await db.insert(decisionTrees).values({
      name,
      description,
      createdBy: userId,
    });

    return c.json({});
  }

  // Handle option selection in decision tree
  if (payload.type === 'block_actions' && payload.actions[0]?.action_id?.startsWith('option_')) {
    const optionId = payload.actions[0].value;
    const channelId = payload.channel?.id;
    const messageTs = payload.message?.ts;

    const [option] = await db
      .select()
      .from(nodeOptions)
      .where(eq(nodeOptions.id, optionId))
      .limit(1);

    if (option && option.nextNodeId) {
      const [nextNode] = await db
        .select()
        .from(treeNodes)
        .where(eq(treeNodes.id, option.nextNodeId))
        .limit(1);

      let blocks;
      if (nextNode.nodeType === 'answer') {
        blocks = buildAnswerView(nextNode);
      } else {
        const options = await db
          .select()
          .from(nodeOptions)
          .where(eq(nodeOptions.nodeId, nextNode.id));

        blocks = buildDecisionView(nextNode, options);
      }

      if (channelId && messageTs) {
        await slackClient.chat.update({
          channel: channelId,
          ts: messageTs,
          blocks,
        });
      }
    }
  }

  return c.json({});
});

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

export const GET = handle(app);
export const POST = handle(app);
