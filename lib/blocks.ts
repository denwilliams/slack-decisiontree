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
