import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { db } from '@/db';
import { decisionTrees, treeNodes, nodeOptions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { slackClient, verifySlackRequest } from '@/lib/slack';
import { buildHomeView, buildDecisionView, buildAnswerView, buildTreeEditorView, buildNodeEditorView } from '@/lib/blocks';

export const runtime = 'nodejs';

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

  // Handle edit tree action - opens tree editor
  if (payload.type === 'block_actions' && payload.actions[0]?.action_id?.startsWith('edit_tree_')) {
    const treeId = payload.actions[0].action_id.replace('edit_tree_', '');

    const [tree] = await db
      .select()
      .from(decisionTrees)
      .where(eq(decisionTrees.id, treeId))
      .limit(1);

    if (tree) {
      const nodes = await db
        .select()
        .from(treeNodes)
        .where(eq(treeNodes.treeId, treeId));

      await slackClient.views.open({
        trigger_id: payload.trigger_id,
        view: buildTreeEditorView(tree, nodes),
      });
    }
  }

  // Handle "Edit Tree Info" button from tree editor
  if (payload.type === 'block_actions' && payload.actions[0]?.action_id === 'edit_tree_info') {
    const treeId = payload.view?.callback_id?.replace('tree_editor_', '');

    if (treeId) {
      const [tree] = await db
        .select()
        .from(decisionTrees)
        .where(eq(decisionTrees.id, treeId))
        .limit(1);

      if (tree) {
        await slackClient.views.push({
          trigger_id: payload.trigger_id,
          view: {
            type: 'modal',
            callback_id: 'edit_tree_info_modal',
            private_metadata: treeId,
            title: {
              type: 'plain_text',
              text: 'Edit Tree Info',
            },
            submit: {
              type: 'plain_text',
              text: 'Save',
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
                  initial_value: tree.name,
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
                  initial_value: tree.description || '',
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
    }
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

    // Refresh home view to show the new tree
    const trees = await db.select().from(decisionTrees);
    await slackClient.views.publish({
      user_id: userId,
      view: {
        type: 'home',
        blocks: buildHomeView(trees),
      },
    });

    return c.json({});
  }

  // Handle tree info edit submission
  if (payload.type === 'view_submission' && payload.view.callback_id === 'edit_tree_info_modal') {
    const treeId = payload.view.private_metadata;
    const name = payload.view.state.values.name.name_input.value;
    const description = payload.view.state.values.description.description_input.value;

    await db
      .update(decisionTrees)
      .set({
        name,
        description,
      })
      .where(eq(decisionTrees.id, treeId));

    // Pop back to tree editor
    return c.json({
      response_action: 'update',
      view: await (async () => {
        const [tree] = await db.select().from(decisionTrees).where(eq(decisionTrees.id, treeId)).limit(1);
        const nodes = await db.select().from(treeNodes).where(eq(treeNodes.treeId, treeId));
        return buildTreeEditorView(tree, nodes);
      })(),
    });
  }

  // Handle add node button
  if (payload.type === 'block_actions' && payload.actions[0]?.action_id === 'add_node') {
    const treeId = payload.view?.callback_id?.replace('tree_editor_', '');

    if (treeId) {
      await slackClient.views.push({
        trigger_id: payload.trigger_id,
        view: {
          type: 'modal',
          callback_id: 'add_node_modal',
          private_metadata: treeId,
          title: {
            type: 'plain_text',
            text: 'Add Node',
          },
          submit: {
            type: 'plain_text',
            text: 'Create',
          },
          blocks: [
            {
              type: 'input',
              block_id: 'node_type',
              label: {
                type: 'plain_text',
                text: 'Node Type',
              },
              element: {
                type: 'static_select',
                action_id: 'node_type_select',
                placeholder: {
                  type: 'plain_text',
                  text: 'Select type',
                },
                options: [
                  {
                    text: {
                      type: 'plain_text',
                      text: '❓ Decision (question with options)',
                    },
                    value: 'decision',
                  },
                  {
                    text: {
                      type: 'plain_text',
                      text: '✅ Answer (final result)',
                    },
                    value: 'answer',
                  },
                ],
              },
            },
            {
              type: 'input',
              block_id: 'title',
              label: {
                type: 'plain_text',
                text: 'Title',
              },
              element: {
                type: 'plain_text_input',
                action_id: 'title_input',
                placeholder: {
                  type: 'plain_text',
                  text: 'Enter node title',
                },
              },
            },
            {
              type: 'input',
              block_id: 'content',
              label: {
                type: 'plain_text',
                text: 'Content',
              },
              optional: true,
              element: {
                type: 'plain_text_input',
                action_id: 'content_input',
                multiline: true,
                placeholder: {
                  type: 'plain_text',
                  text: 'Enter additional details',
                },
              },
            },
          ],
        },
      });
    }
  }

  // Handle add node submission
  if (payload.type === 'view_submission' && payload.view.callback_id === 'add_node_modal') {
    const treeId = payload.view.private_metadata;
    const nodeType = payload.view.state.values.node_type.node_type_select.selected_option.value;
    const title = payload.view.state.values.title.title_input.value;
    const content = payload.view.state.values.content.content_input.value;

    await db.insert(treeNodes).values({
      treeId,
      nodeType,
      title,
      content,
    });

    // Refresh tree editor
    return c.json({
      response_action: 'update',
      view: await (async () => {
        const [tree] = await db.select().from(decisionTrees).where(eq(decisionTrees.id, treeId)).limit(1);
        const nodes = await db.select().from(treeNodes).where(eq(treeNodes.treeId, treeId));
        return buildTreeEditorView(tree, nodes);
      })(),
    });
  }

  // Handle manage node button
  if (payload.type === 'block_actions' && payload.actions[0]?.action_id?.startsWith('manage_node_')) {
    const nodeId = payload.actions[0].value;

    const [node] = await db
      .select()
      .from(treeNodes)
      .where(eq(treeNodes.id, nodeId))
      .limit(1);

    if (node) {
      const [tree] = await db
        .select()
        .from(decisionTrees)
        .where(eq(decisionTrees.id, node.treeId))
        .limit(1);

      const options = await db
        .select()
        .from(nodeOptions)
        .where(eq(nodeOptions.nodeId, nodeId));

      const allNodes = await db
        .select()
        .from(treeNodes)
        .where(eq(treeNodes.treeId, node.treeId));

      await slackClient.views.push({
        trigger_id: payload.trigger_id,
        view: buildNodeEditorView(tree, node, options, allNodes),
      });
    }
  }

  // Handle back to tree button
  if (payload.type === 'block_actions' && payload.actions[0]?.action_id === 'back_to_tree') {
    const metadata = JSON.parse(payload.view?.private_metadata || '{}');
    const treeId = metadata.treeId;

    if (treeId) {
      const [tree] = await db
        .select()
        .from(decisionTrees)
        .where(eq(decisionTrees.id, treeId))
        .limit(1);

      const nodes = await db
        .select()
        .from(treeNodes)
        .where(eq(treeNodes.treeId, treeId));

      await slackClient.views.update({
        view_id: payload.view?.id,
        view: buildTreeEditorView(tree, nodes),
      });
    }
  }

  // Handle edit node button
  if (payload.type === 'block_actions' && payload.actions[0]?.action_id === 'edit_node') {
    const metadata = JSON.parse(payload.view?.private_metadata || '{}');
    const nodeId = metadata.nodeId;

    if (nodeId) {
      const [node] = await db
        .select()
        .from(treeNodes)
        .where(eq(treeNodes.id, nodeId))
        .limit(1);

      if (node) {
        await slackClient.views.push({
          trigger_id: payload.trigger_id,
          view: {
            type: 'modal',
            callback_id: 'edit_node_modal',
            private_metadata: nodeId,
            title: {
              type: 'plain_text',
              text: 'Edit Node',
            },
            submit: {
              type: 'plain_text',
              text: 'Save',
            },
            blocks: [
              {
                type: 'input',
                block_id: 'node_type',
                label: {
                  type: 'plain_text',
                  text: 'Node Type',
                },
                element: {
                  type: 'static_select',
                  action_id: 'node_type_select',
                  initial_option: {
                    text: {
                      type: 'plain_text',
                      text: node.nodeType === 'decision' ? '❓ Decision (question with options)' : '✅ Answer (final result)',
                    },
                    value: node.nodeType,
                  },
                  options: [
                    {
                      text: {
                        type: 'plain_text',
                        text: '❓ Decision (question with options)',
                      },
                      value: 'decision',
                    },
                    {
                      text: {
                        type: 'plain_text',
                        text: '✅ Answer (final result)',
                      },
                      value: 'answer',
                    },
                  ],
                },
              },
              {
                type: 'input',
                block_id: 'title',
                label: {
                  type: 'plain_text',
                  text: 'Title',
                },
                element: {
                  type: 'plain_text_input',
                  action_id: 'title_input',
                  initial_value: node.title,
                  placeholder: {
                    type: 'plain_text',
                    text: 'Enter node title',
                  },
                },
              },
              {
                type: 'input',
                block_id: 'content',
                label: {
                  type: 'plain_text',
                  text: 'Content',
                },
                optional: true,
                element: {
                  type: 'plain_text_input',
                  action_id: 'content_input',
                  initial_value: node.content || '',
                  multiline: true,
                  placeholder: {
                    type: 'plain_text',
                    text: 'Enter additional details',
                  },
                },
              },
            ],
          },
        });
      }
    }
  }

  // Handle edit node submission
  if (payload.type === 'view_submission' && payload.view.callback_id === 'edit_node_modal') {
    const nodeId = payload.view.private_metadata;
    const nodeType = payload.view.state.values.node_type.node_type_select.selected_option.value;
    const title = payload.view.state.values.title.title_input.value;
    const content = payload.view.state.values.content.content_input.value;

    const [node] = await db
      .select()
      .from(treeNodes)
      .where(eq(treeNodes.id, nodeId))
      .limit(1);

    await db
      .update(treeNodes)
      .set({
        nodeType,
        title,
        content,
      })
      .where(eq(treeNodes.id, nodeId));

    // Refresh node editor
    const [tree] = await db
      .select()
      .from(decisionTrees)
      .where(eq(decisionTrees.id, node.treeId))
      .limit(1);

    const options = await db
      .select()
      .from(nodeOptions)
      .where(eq(nodeOptions.nodeId, nodeId));

    const allNodes = await db
      .select()
      .from(treeNodes)
      .where(eq(treeNodes.treeId, node.treeId));

    const updatedNode = await db
      .select()
      .from(treeNodes)
      .where(eq(treeNodes.id, nodeId))
      .limit(1);

    return c.json({
      response_action: 'update',
      view: buildNodeEditorView(tree, updatedNode[0], options, allNodes),
    });
  }

  // Handle delete node button
  if (payload.type === 'block_actions' && payload.actions[0]?.action_id === 'delete_node') {
    const metadata = JSON.parse(payload.view?.private_metadata || '{}');
    const nodeId = metadata.nodeId;
    const treeId = metadata.treeId;

    if (nodeId && treeId) {
      await db.delete(treeNodes).where(eq(treeNodes.id, nodeId));

      // Go back to tree editor
      const [tree] = await db
        .select()
        .from(decisionTrees)
        .where(eq(decisionTrees.id, treeId))
        .limit(1);

      const nodes = await db
        .select()
        .from(treeNodes)
        .where(eq(treeNodes.treeId, treeId));

      await slackClient.views.update({
        view_id: payload.view?.id,
        view: buildTreeEditorView(tree, nodes),
      });
    }
  }

  // Handle add option button
  if (payload.type === 'block_actions' && payload.actions[0]?.action_id === 'add_option') {
    const metadata = JSON.parse(payload.view?.private_metadata || '{}');
    const nodeId = metadata.nodeId;
    const treeId = metadata.treeId;

    if (nodeId && treeId) {
      const allNodes = await db
        .select()
        .from(treeNodes)
        .where(eq(treeNodes.treeId, treeId));

      await slackClient.views.push({
        trigger_id: payload.trigger_id,
        view: {
          type: 'modal',
          callback_id: 'add_option_modal',
          private_metadata: JSON.stringify({ nodeId, treeId }),
          title: {
            type: 'plain_text',
            text: 'Add Option',
          },
          submit: {
            type: 'plain_text',
            text: 'Create',
          },
          blocks: [
            {
              type: 'input',
              block_id: 'label',
              label: {
                type: 'plain_text',
                text: 'Option Label',
              },
              element: {
                type: 'plain_text_input',
                action_id: 'label_input',
                placeholder: {
                  type: 'plain_text',
                  text: 'e.g., "Yes", "No", "Maybe"',
                },
              },
            },
            {
              type: 'input',
              block_id: 'next_node',
              label: {
                type: 'plain_text',
                text: 'Next Node (where this option leads)',
              },
              optional: true,
              element: {
                type: 'static_select',
                action_id: 'next_node_select',
                placeholder: {
                  type: 'plain_text',
                  text: 'Select a node',
                },
                options: allNodes.map((node) => ({
                  text: {
                    type: 'plain_text',
                    text: `${node.nodeType === 'decision' ? '❓' : '✅'} ${node.title}`,
                  },
                  value: node.id,
                })),
              },
            },
          ],
        },
      });
    }
  }

  // Handle add option submission
  if (payload.type === 'view_submission' && payload.view.callback_id === 'add_option_modal') {
    const metadata = JSON.parse(payload.view.private_metadata);
    const nodeId = metadata.nodeId;
    const treeId = metadata.treeId;
    const label = payload.view.state.values.label.label_input.value;
    const nextNodeId = payload.view.state.values.next_node.next_node_select.selected_option?.value || null;

    await db.insert(nodeOptions).values({
      nodeId,
      label,
      nextNodeId,
    });

    // Refresh node editor
    const [node] = await db
      .select()
      .from(treeNodes)
      .where(eq(treeNodes.id, nodeId))
      .limit(1);

    const [tree] = await db
      .select()
      .from(decisionTrees)
      .where(eq(decisionTrees.id, treeId))
      .limit(1);

    const options = await db
      .select()
      .from(nodeOptions)
      .where(eq(nodeOptions.nodeId, nodeId));

    const allNodes = await db
      .select()
      .from(treeNodes)
      .where(eq(treeNodes.treeId, treeId));

    return c.json({
      response_action: 'update',
      view: buildNodeEditorView(tree, node, options, allNodes),
    });
  }

  // Handle edit option button
  if (payload.type === 'block_actions' && payload.actions[0]?.action_id?.startsWith('edit_option_')) {
    const optionId = payload.actions[0].value;
    const metadata = JSON.parse(payload.view?.private_metadata || '{}');
    const treeId = metadata.treeId;

    const [option] = await db
      .select()
      .from(nodeOptions)
      .where(eq(nodeOptions.id, optionId))
      .limit(1);

    if (option && treeId) {
      const allNodes = await db
        .select()
        .from(treeNodes)
        .where(eq(treeNodes.treeId, treeId));

      await slackClient.views.push({
        trigger_id: payload.trigger_id,
        view: {
          type: 'modal',
          callback_id: 'edit_option_modal',
          private_metadata: JSON.stringify({ optionId, nodeId: option.nodeId, treeId }),
          title: {
            type: 'plain_text',
            text: 'Edit Option',
          },
          submit: {
            type: 'plain_text',
            text: 'Save',
          },
          blocks: [
            {
              type: 'input',
              block_id: 'label',
              label: {
                type: 'plain_text',
                text: 'Option Label',
              },
              element: {
                type: 'plain_text_input',
                action_id: 'label_input',
                initial_value: option.label,
                placeholder: {
                  type: 'plain_text',
                  text: 'e.g., "Yes", "No", "Maybe"',
                },
              },
            },
            {
              type: 'input',
              block_id: 'next_node',
              label: {
                type: 'plain_text',
                text: 'Next Node (where this option leads)',
              },
              optional: true,
              element: {
                type: 'static_select',
                action_id: 'next_node_select',
                initial_option: option.nextNodeId ? (() => {
                  const node = allNodes.find((n) => n.id === option.nextNodeId);
                  return node ? {
                    text: {
                      type: 'plain_text',
                      text: `${node.nodeType === 'decision' ? '❓' : '✅'} ${node.title}`,
                    },
                    value: node.id,
                  } : undefined;
                })() : undefined,
                placeholder: {
                  type: 'plain_text',
                  text: 'Select a node',
                },
                options: allNodes.map((node) => ({
                  text: {
                    type: 'plain_text',
                    text: `${node.nodeType === 'decision' ? '❓' : '✅'} ${node.title}`,
                  },
                  value: node.id,
                })),
              },
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Delete Option',
                  },
                  action_id: 'delete_option',
                  style: 'danger',
                  value: optionId,
                },
              ],
            },
          ],
        },
      });
    }
  }

  // Handle edit option submission
  if (payload.type === 'view_submission' && payload.view.callback_id === 'edit_option_modal') {
    const metadata = JSON.parse(payload.view.private_metadata);
    const optionId = metadata.optionId;
    const nodeId = metadata.nodeId;
    const treeId = metadata.treeId;
    const label = payload.view.state.values.label.label_input.value;
    const nextNodeId = payload.view.state.values.next_node.next_node_select.selected_option?.value || null;

    await db
      .update(nodeOptions)
      .set({
        label,
        nextNodeId,
      })
      .where(eq(nodeOptions.id, optionId));

    // Refresh node editor
    const [node] = await db
      .select()
      .from(treeNodes)
      .where(eq(treeNodes.id, nodeId))
      .limit(1);

    const [tree] = await db
      .select()
      .from(decisionTrees)
      .where(eq(decisionTrees.id, treeId))
      .limit(1);

    const options = await db
      .select()
      .from(nodeOptions)
      .where(eq(nodeOptions.nodeId, nodeId));

    const allNodes = await db
      .select()
      .from(treeNodes)
      .where(eq(treeNodes.treeId, treeId));

    return c.json({
      response_action: 'update',
      view: buildNodeEditorView(tree, node, options, allNodes),
    });
  }

  // Handle delete option button
  if (payload.type === 'block_actions' && payload.actions[0]?.action_id === 'delete_option') {
    const optionId = payload.actions[0].value;
    const metadata = JSON.parse(payload.view?.private_metadata || '{}');
    const nodeId = metadata.nodeId;
    const treeId = metadata.treeId;

    if (optionId && nodeId && treeId) {
      await db.delete(nodeOptions).where(eq(nodeOptions.id, optionId));

      // Go back to node editor
      const [node] = await db
        .select()
        .from(treeNodes)
        .where(eq(treeNodes.id, nodeId))
        .limit(1);

      const [tree] = await db
        .select()
        .from(decisionTrees)
        .where(eq(decisionTrees.id, treeId))
        .limit(1);

      const options = await db
        .select()
        .from(nodeOptions)
        .where(eq(nodeOptions.nodeId, nodeId));

      const allNodes = await db
        .select()
        .from(treeNodes)
        .where(eq(treeNodes.treeId, treeId));

      await slackClient.views.update({
        view_id: payload.view?.id,
        view: buildNodeEditorView(tree, node, options, allNodes),
      });
    }
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
