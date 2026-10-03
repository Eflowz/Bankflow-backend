import 'dotenv/config';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Environment variable schema
// ─────────────────────────────────────────────────────────────
// If any required var is missing or malformed, the process exits
// immediately with a clear message. This is far better than
// discovering at 2am that DATABASE_URL was undefined.

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default('/api'),

  DATABASE_URL: z.string().url(),

  REDIS_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  CORS_ORIGIN: z.string().default('http://localhost:4200'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:\n');
  for (const issue of parsed.error.issues) {
    console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\nFix your .env file and restart.');
  process.exit(1);
}

export const env = parsed.data;

// Split CORS list once, reuse everywhere
export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';