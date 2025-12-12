import { WebClient } from '@slack/web-api';
import { createHmac, timingSafeEqual } from 'crypto';

// Use a dummy token during build time, actual validation happens at runtime
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || 'xoxb-dummy-token';

export const slackClient = new WebClient(SLACK_BOT_TOKEN);

export function verifySlackRequest(
  signature: string,
  timestamp: string,
  body: string
): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET || 'dummy-secret';

  const hmac = createHmac('sha256', signingSecret);
  const [version, hash] = signature.split('=');

  hmac.update(`${version}:${timestamp}:${body}`);
  const computed = hmac.digest('hex');

  return timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(computed, 'hex')
  );
}
