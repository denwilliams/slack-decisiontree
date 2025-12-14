import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { db } from '@/db';
import { decisionTrees, treeNodes, nodeOptions, editTokens } from '@/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { slackClient, verifySlackRequest } from '@/lib/slack';
import { buildHomeView, buildDecisionView, buildAnswerView, buildTreeEditorView, buildNodeEditorView } from '@/lib/blocks';
import { randomBytes } from 'crypto';

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

  // Handle workflow step execution
  if (payload.event?.type === 'workflow_step_execute') {
    const workflowStep = payload.event.workflow_step;
    const treeId = workflowStep.inputs.tree_id.value;
    const sendTo = workflowStep.inputs.send_to.value;

    // Get all nodes for this tree
    const allNodes = await db
      .select()
      .from(treeNodes)
      .where(eq(treeNodes.treeId, treeId));

    if (allNodes.length === 0) {
      // Complete the workflow step with failure
      await slackClient.workflows.stepFailed({
        workflow_step_execute_id: workflowStep.workflow_step_execute_id,
        error: {
          message: 'This decision tree has no nodes yet.',
        },
      });
      return c.json({ ok: true });
    }

    // Get all options to find which nodes are referenced as nextNodeId
    const allOptions = await db
      .select()
      .from(nodeOptions);

    // Find the root node (not referenced by any option as nextNodeId)
    const referencedNodeIds = new Set(allOptions.map(opt => opt.nextNodeId).filter(Boolean));
    const rootNode = allNodes.find(node => !referencedNodeIds.has(node.id));

    if (!rootNode) {
      await slackClient.workflows.stepFailed({
        workflow_step_execute_id: workflowStep.workflow_step_execute_id,
        error: {
          message: 'Could not find a starting node for this tree.',
        },
      });
      return c.json({ ok: true });
    }

    // Build the appropriate view based on node type
    let blocks;
    if (rootNode.nodeType === 'answer') {
      blocks = buildAnswerView(rootNode);
    } else {
      const options = await db
        .select()
        .from(nodeOptions)
        .where(eq(nodeOptions.nodeId, rootNode.id));

      blocks = buildDecisionView(rootNode, options);
    }

    // Determine where to send the message
    let channel;
    if (sendTo === 'workflow_user') {
      channel = payload.event.workflow_step.workflow_instance_owner;
    } else {
      // current_channel - need to get from workflow context
      channel = payload.event.workflow_step.workflow_instance_owner; // Fallback to user
    }

    // Post the first node
    await slackClient.chat.postMessage({
      channel,
      blocks,
      text: `Starting decision tree: ${rootNode.title}`,
    });

    // Get tree name for output
    const [tree] = await db
      .select()
      .from(decisionTrees)
      .where(eq(decisionTrees.id, treeId))
      .limit(1);

    // Complete the workflow step
    await slackClient.workflows.stepCompleted({
      workflow_step_execute_id: workflowStep.workflow_step_execute_id,
      outputs: {
        tree_name: tree?.name || 'Unknown',
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

  // Handle workflow step edit (when user adds the step to a workflow)
  if (payload.type === 'workflow_step_edit') {
    const trees = await db.select().from(decisionTrees);

    await slackClient.views.open({
      trigger_id: payload.trigger_id,
      view: {
        type: 'workflow_step',
        callback_id: 'run_decision_tree_workflow',
        private_metadata: JSON.stringify({ workflow_step_edit_id: payload.workflow_step.workflow_step_edit_id }),
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Select which decision tree to run when this workflow step executes:',
            },
          },
          {
            type: 'input',
            block_id: 'tree_select_block',
            label: {
              type: 'plain_text',
              text: 'Decision Tree',
            },
            element: {
              type: 'static_select',
              action_id: 'tree_select',
              placeholder: {
                type: 'plain_text',
                text: 'Select a decision tree',
              },
              options: trees.map((tree) => ({
                text: {
                  type: 'plain_text',
                  text: tree.name,
                },
                value: tree.id,
              })),
            },
          },
          {
            type: 'input',
            block_id: 'send_to_block',
            label: {
              type: 'plain_text',
              text: 'Send decision tree to',
            },
            element: {
              type: 'static_select',
              action_id: 'send_to_select',
              placeholder: {
                type: 'plain_text',
                text: 'Select recipient',
              },
              options: [
                {
                  text: {
                    type: 'plain_text',
                    text: 'User who triggered the workflow',
                  },
                  value: 'workflow_user',
                },
                {
                  text: {
                    type: 'plain_text',
                    text: 'Current channel',
                  },
                  value: 'current_channel',
                },
              ],
            },
          },
        ],
      },
    });

    return c.json({});
  }

  // Handle workflow step save (when user saves the configuration)
  if (payload.type === 'view_submission' && payload.view.callback_id === 'run_decision_tree_workflow') {
    const privateMetadata = JSON.parse(payload.view.private_metadata);
    const treeId = payload.view.state.values.tree_select_block.tree_select.selected_option.value;
    const sendTo = payload.view.state.values.send_to_block.send_to_select.selected_option.value;

    const [tree] = await db
      .select()
      .from(decisionTrees)
      .where(eq(decisionTrees.id, treeId))
      .limit(1);

    await slackClient.workflows.updateStep({
      workflow_step_edit_id: privateMetadata.workflow_step_edit_id,
      inputs: {
        tree_id: { value: treeId },
        send_to: { value: sendTo },
      },
      outputs: [
        {
          type: 'text',
          name: 'tree_name',
          label: 'Decision Tree Name',
        },
      ],
    });

    return c.json({});
  }

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

  // Handle "Edit in Browser" button
  if (payload.type === 'block_actions' && payload.actions[0]?.action_id === 'edit_in_browser') {
    const treeId = payload.view?.callback_id?.replace('tree_editor_', '');

    if (treeId) {
      // Generate a secure random token
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      // Store the token in the database
      await db.insert(editTokens).values({
        token,
        treeId,
        createdBy: userId,
        expiresAt,
      });

      // Send the URL to the user via DM
      const editorUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.vercel.app'}/edit/${token}`;

      await slackClient.chat.postMessage({
        channel: userId,
        text: `Here's your temporary editor link for this decision tree:\n\n${editorUrl}\n\n⏱️ This link expires in 1 hour.`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🌐 *Web Editor Link*\n\nClick the link below to edit your decision tree in the browser:\n\n<${editorUrl}|Open Editor>\n\n⏱️ _This link expires in 1 hour_`,
            },
          },
        ],
      });
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

  // Handle run tree action
  if (payload.type === 'block_actions' && payload.actions[0]?.action_id?.startsWith('run_tree_')) {
    const treeId = payload.actions[0].value;

    // Get tree info
    const [tree] = await db
      .select()
      .from(decisionTrees)
      .where(eq(decisionTrees.id, treeId))
      .limit(1);

    // Get all nodes for this tree
    const allNodes = await db
      .select()
      .from(treeNodes)
      .where(eq(treeNodes.treeId, treeId));

    if (allNodes.length === 0) {
      // No nodes in tree, send error message
      await slackClient.chat.postMessage({
        channel: userId,
        text: '❌ This decision tree has no nodes yet. Please add nodes before running it.',
      });
      return c.json({});
    }

    // Get all options to find which nodes are referenced as nextNodeId
    const allOptions = await db
      .select()
      .from(nodeOptions);

    // Find the root node (not referenced by any option as nextNodeId)
    const referencedNodeIds = new Set(allOptions.map(opt => opt.nextNodeId).filter(Boolean));
    const rootNode = allNodes.find(node => !referencedNodeIds.has(node.id));

    if (!rootNode) {
      // No root node found, use the first node as fallback
      await slackClient.chat.postMessage({
        channel: userId,
        text: '⚠️ Could not find a starting node for this tree. Make sure your tree has a proper starting point.',
      });
      return c.json({});
    }

    // Build the appropriate view based on node type
    let blocks;
    if (rootNode.nodeType === 'answer') {
      blocks = buildAnswerView(rootNode);
    } else {
      const options = await db
        .select()
        .from(nodeOptions)
        .where(eq(nodeOptions.nodeId, rootNode.id));

      blocks = buildDecisionView(rootNode, options);
    }

    // Open modal with the decision tree
    await slackClient.views.open({
      trigger_id: payload.trigger_id,
      view: {
        type: 'modal',
        callback_id: `run_tree_modal_${treeId}`,
        private_metadata: JSON.stringify({ treeId, currentNodeId: rootNode.id }),
        title: {
          type: 'plain_text',
          text: tree?.name || 'Decision Tree',
        },
        close: {
          type: 'plain_text',
          text: 'Close',
        },
        blocks,
      },
    });

    return c.json({});
  }

  // Handle option selection in decision tree
  if (payload.type === 'block_actions' && payload.actions[0]?.action_id?.startsWith('option_')) {
    const optionId = payload.actions[0].value;
    const channelId = payload.channel?.id;
    const messageTs = payload.message?.ts;
    const viewId = payload.view?.id;

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

      // Update modal if in modal context, otherwise update message
      if (viewId) {
        const metadata = JSON.parse(payload.view.private_metadata || '{}');
        const [tree] = await db
          .select()
          .from(decisionTrees)
          .where(eq(decisionTrees.id, metadata.treeId))
          .limit(1);

        await slackClient.views.update({
          view_id: viewId,
          view: {
            type: 'modal',
            callback_id: `run_tree_modal_${metadata.treeId}`,
            private_metadata: JSON.stringify({ treeId: metadata.treeId, currentNodeId: nextNode.id }),
            title: {
              type: 'plain_text',
              text: tree?.name || 'Decision Tree',
            },
            close: {
              type: 'plain_text',
              text: 'Close',
            },
            blocks,
          },
        });
      } else if (channelId && messageTs) {
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

// Helper function to validate edit token
async function validateToken(token: string) {
  const [editToken] = await db
    .select()
    .from(editTokens)
    .where(
      and(
        eq(editTokens.token, token),
        gt(editTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  return editToken;
}

// Web Editor API Endpoints

// Get tree data by token
app.get('/editor/:token', async (c) => {
  const token = c.req.param('token');
  const editToken = await validateToken(token);

  if (!editToken) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const [tree] = await db
    .select()
    .from(decisionTrees)
    .where(eq(decisionTrees.id, editToken.treeId))
    .limit(1);

  if (!tree) {
    return c.json({ error: 'Tree not found' }, 404);
  }

  const nodes = await db
    .select()
    .from(treeNodes)
    .where(eq(treeNodes.treeId, tree.id));

  const allOptions = await db
    .select()
    .from(nodeOptions);

  const options = allOptions.filter((opt) =>
    nodes.some((node) => node.id === opt.nodeId)
  );

  return c.json({
    tree,
    nodes,
    options,
    expiresAt: editToken.expiresAt,
  });
});

// Update tree info
app.put('/editor/:token', async (c) => {
  const token = c.req.param('token');
  const editToken = await validateToken(token);

  if (!editToken) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const body = await c.req.json();
  const { name, description } = body;

  await db
    .update(decisionTrees)
    .set({
      name,
      description,
      updatedAt: new Date(),
    })
    .where(eq(decisionTrees.id, editToken.treeId));

  return c.json({ success: true });
});

// Create a new node
app.post('/editor/:token/nodes', async (c) => {
  const token = c.req.param('token');
  const editToken = await validateToken(token);

  if (!editToken) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const body = await c.req.json();
  const { nodeType, title, content } = body;

  const [newNode] = await db
    .insert(treeNodes)
    .values({
      treeId: editToken.treeId,
      nodeType,
      title,
      content: content || null,
    })
    .returning();

  return c.json(newNode);
});

// Update a node
app.put('/editor/:token/nodes/:nodeId', async (c) => {
  const token = c.req.param('token');
  const nodeId = c.req.param('nodeId');
  const editToken = await validateToken(token);

  if (!editToken) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const body = await c.req.json();
  const { nodeType, title, content } = body;

  // Verify node belongs to this tree
  const [node] = await db
    .select()
    .from(treeNodes)
    .where(eq(treeNodes.id, nodeId))
    .limit(1);

  if (!node || node.treeId !== editToken.treeId) {
    return c.json({ error: 'Node not found' }, 404);
  }

  await db
    .update(treeNodes)
    .set({
      nodeType,
      title,
      content,
      updatedAt: new Date(),
    })
    .where(eq(treeNodes.id, nodeId));

  return c.json({ success: true });
});

// Delete a node
app.delete('/editor/:token/nodes/:nodeId', async (c) => {
  const token = c.req.param('token');
  const nodeId = c.req.param('nodeId');
  const editToken = await validateToken(token);

  if (!editToken) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Verify node belongs to this tree
  const [node] = await db
    .select()
    .from(treeNodes)
    .where(eq(treeNodes.id, nodeId))
    .limit(1);

  if (!node || node.treeId !== editToken.treeId) {
    return c.json({ error: 'Node not found' }, 404);
  }

  await db.delete(treeNodes).where(eq(treeNodes.id, nodeId));

  return c.json({ success: true });
});

// Create an option
app.post('/editor/:token/nodes/:nodeId/options', async (c) => {
  const token = c.req.param('token');
  const nodeId = c.req.param('nodeId');
  const editToken = await validateToken(token);

  if (!editToken) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const body = await c.req.json();
  const { label, nextNodeId } = body;

  // Verify node belongs to this tree
  const [node] = await db
    .select()
    .from(treeNodes)
    .where(eq(treeNodes.id, nodeId))
    .limit(1);

  if (!node || node.treeId !== editToken.treeId) {
    return c.json({ error: 'Node not found' }, 404);
  }

  const [newOption] = await db
    .insert(nodeOptions)
    .values({
      nodeId,
      label,
      nextNodeId: nextNodeId || null,
    })
    .returning();

  return c.json(newOption);
});

// Update an option
app.put('/editor/:token/options/:optionId', async (c) => {
  const token = c.req.param('token');
  const optionId = c.req.param('optionId');
  const editToken = await validateToken(token);

  if (!editToken) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const body = await c.req.json();
  const { label, nextNodeId } = body;

  // Verify option belongs to a node in this tree
  const [option] = await db
    .select()
    .from(nodeOptions)
    .where(eq(nodeOptions.id, optionId))
    .limit(1);

  if (!option) {
    return c.json({ error: 'Option not found' }, 404);
  }

  const [node] = await db
    .select()
    .from(treeNodes)
    .where(eq(treeNodes.id, option.nodeId))
    .limit(1);

  if (!node || node.treeId !== editToken.treeId) {
    return c.json({ error: 'Option not found' }, 404);
  }

  await db
    .update(nodeOptions)
    .set({
      label,
      nextNodeId: nextNodeId || null,
    })
    .where(eq(nodeOptions.id, optionId));

  return c.json({ success: true });
});

// Delete an option
app.delete('/editor/:token/options/:optionId', async (c) => {
  const token = c.req.param('token');
  const optionId = c.req.param('optionId');
  const editToken = await validateToken(token);

  if (!editToken) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Verify option belongs to a node in this tree
  const [option] = await db
    .select()
    .from(nodeOptions)
    .where(eq(nodeOptions.id, optionId))
    .limit(1);

  if (!option) {
    return c.json({ error: 'Option not found' }, 404);
  }

  const [node] = await db
    .select()
    .from(treeNodes)
    .where(eq(treeNodes.id, option.nodeId))
    .limit(1);

  if (!node || node.treeId !== editToken.treeId) {
    return c.json({ error: 'Option not found' }, 404);
  }

  await db.delete(nodeOptions).where(eq(nodeOptions.id, optionId));

  return c.json({ success: true });
});

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
