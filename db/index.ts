import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Use a dummy URL during build time, actual validation happens at runtime
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:password@localhost/dbname';

const sql = neon(DATABASE_URL);
export const db = drizzle(sql, { schema });
