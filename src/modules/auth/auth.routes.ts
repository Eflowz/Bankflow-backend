import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as controller from './auth.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { env } from '../../config/env.js';

const router = Router();

// ─────────────────────────────────────────────────────────────
// Auth endpoints are rate-limited HARDER than the rest of the API.
// Login/register are the two endpoints attackers brute-force.
// ─────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: Math.min(env.RATE_LIMIT_MAX, 20), // cap at 20/min for auth routes
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────

// POST /api/auth/register
router.post('/register', authLimiter, controller.register);

// POST /api/auth/login
router.post('/login', authLimiter, controller.login);

// POST /api/auth/refresh
router.post('/refresh', controller.refresh);

// POST /api/auth/logout
router.post('/logout', controller.logout);

// GET /api/auth/me  (requires valid access token)
router.get('/me', requireAuth, controller.me);

export default router;