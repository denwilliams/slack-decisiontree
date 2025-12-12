import { WebClient } from '@slack/web-api';
import { db } from '@/db';
import { workspaces } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function getSlackClient(teamId: string): Promise<WebClient | null> {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.teamId, teamId))
    .limit(1);

  if (!workspace) {
    return null;
  }

  return new WebClient(workspace.accessToken);
}

export function verifySlackRequest(
  signature: string,
  timestamp: string,
  body: string
): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET!;

  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', signingSecret);
  const [version, hash] = signature.split('=');

  hmac.update(`${version}:${timestamp}:${body}`);
  const computed = hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(computed, 'hex')
  );
}
