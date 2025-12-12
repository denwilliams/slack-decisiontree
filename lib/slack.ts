import { WebClient } from '@slack/web-api';
import { createHmac, timingSafeEqual } from 'crypto';

if (!process.env.SLACK_BOT_TOKEN) {
  throw new Error('SLACK_BOT_TOKEN environment variable is not set');
}

export const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

export function verifySlackRequest(
  signature: string,
  timestamp: string,
  body: string
): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET!;

  const hmac = createHmac('sha256', signingSecret);
  const [version, hash] = signature.split('=');

  hmac.update(`${version}:${timestamp}:${body}`);
  const computed = hmac.digest('hex');

  return timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(computed, 'hex')
  );
}
