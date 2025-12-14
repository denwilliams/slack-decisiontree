import { Block, KnownBlock } from '@slack/web-api';

export function buildHomeView(trees: any[]): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🌳 Decision Tree Manager',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Create and manage decision trees for your workspace.',
      },
    },
    {
      type: 'divider',
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '➕ Create New Decision Tree',
          },
          action_id: 'create_tree',
          style: 'primary',
        },
      ],
    },
  ];

  if (trees.length > 0) {
    blocks.push({
      type: 'divider',
    });
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Your Decision Trees',
      },
    });

    trees.forEach((tree) => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${tree.name}*\n${tree.description || 'No description'}`,
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Edit',
          },
          action_id: `edit_tree_${tree.id}`,
        },
      });
    });
  }

  return blocks;
}

export function buildDecisionView(
  node: any,
  options: any[]
): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${node.title}*\n${node.content || ''}`,
      },
    },
  ];

  if (options.length > 0) {
    blocks.push({
      type: 'actions',
      elements: options.map((option) => ({
        type: 'button',
        text: {
          type: 'plain_text',
          text: option.label,
        },
        action_id: `option_${option.id}`,
        value: option.id,
      })),
    });
  }

  return blocks;
}

export function buildAnswerView(node: any): KnownBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${node.title}*\n${node.content || ''}`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '✅ Decision tree completed',
        },
      ],
    },
  ];
}

export function buildTreeEditorView(tree: any, nodes: any[]): any {
  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${tree.name}*\n${tree.description || 'No description'}`,
      },
    },
    {
      type: 'divider',
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Nodes in this tree:*',
      },
    },
  ];

  if (nodes.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '_No nodes yet. Add your first node to get started._',
      },
    });
  } else {
    nodes.forEach((node) => {
      const nodeTypeEmoji = node.nodeType === 'decision' ? '❓' : '✅';
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${nodeTypeEmoji} *${node.title}*\n_Type: ${node.nodeType}_`,
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Manage',
          },
          action_id: `manage_node_${node.id}`,
          value: node.id,
        },
      });
    });
  }

  blocks.push({
    type: 'divider',
  });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '➕ Add Node',
        },
        action_id: 'add_node',
        style: 'primary',
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Edit Tree Info',
        },
        action_id: 'edit_tree_info',
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '🌐 Edit in Browser',
        },
        action_id: 'edit_in_browser',
        style: 'primary',
      },
    ],
  });

  return {
    type: 'modal',
    callback_id: `tree_editor_${tree.id}`,
    title: {
      type: 'plain_text',
      text: 'Manage Tree',
    },
    close: {
      type: 'plain_text',
      text: 'Close',
    },
    blocks,
  };
}

export function buildNodeEditorView(tree: any, node: any, options: any[], allNodes: any[]): any {
  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${node.title}*\n_${node.nodeType === 'decision' ? 'Decision' : 'Answer'} Node_`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: node.content || '_No content_',
      },
    },
    {
      type: 'divider',
    },
  ];

  if (node.nodeType === 'decision') {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Options:*',
      },
    });

    if (options.length === 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '_No options yet. Add options for users to choose from._',
        },
      });
    } else {
      options.forEach((option) => {
        const nextNode = allNodes.find((n) => n.id === option.nextNodeId);
        const nextNodeText = nextNode ? ` → ${nextNode.title}` : ' → _Not set_';
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `• ${option.label}${nextNodeText}`,
          },
          accessory: {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✏️',
            },
            action_id: `edit_option_${option.id}`,
            value: option.id,
          },
        });
      });
    }

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '➕ Add Option',
          },
          action_id: 'add_option',
          style: 'primary',
        },
      ],
    });
  }

  blocks.push({
    type: 'divider',
  });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Edit Node',
        },
        action_id: 'edit_node',
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Delete Node',
        },
        action_id: 'delete_node',
        style: 'danger',
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '← Back',
        },
        action_id: 'back_to_tree',
      },
    ],
  });

  return {
    type: 'modal',
    callback_id: `node_editor_${node.id}`,
    private_metadata: JSON.stringify({ treeId: tree.id, nodeId: node.id }),
    title: {
      type: 'plain_text',
      text: 'Manage Node',
    },
    close: {
      type: 'plain_text',
      text: 'Close',
    },
    blocks,
  };
}
