import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { env, corsOrigins, isDev } from './config/env.js';
import { logger } from './lib/logger.js';
import authRoutes from './modules/auth/auth.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import accountsRoutes from './modules/accounts/account.routes.js';
import transactionsRoutes from './modules/transactions/transactions.routes.js';
import transfersRoutes from './modules/transfers/transfers.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import beneficiariesRoutes from './modules/beneficiaries/beneficiaries.routes.js';


export function createApp(): Express {
    const app = express();

    // ─── Trust proxy ────────────────────────────────────────
    // Behind a reverse proxy (nginx, Heroku, Render, Fly), req.ip
    // comes from X-Forwarded-For. Without this, rate limits and
    // audit logs would all see the proxy IP.
    app.set('trust proxy', 1);

    // ─── Security headers ───────────────────────────────────
    app.use(helmet());

    // ─── CORS ───────────────────────────────────────────────
    app.use(
        cors({
            origin: (origin, callback) => {
                // Allow requests with no origin (curl, Postman, mobile apps)
                if (!origin) return callback(null, true);
                if (corsOrigins.includes(origin)) return callback(null, true);
                callback(new Error(`CORS: origin ${origin} not allowed`));
            },
            credentials: true,
        }),
    );

    // ─── Body parsing ───────────────────────────────────────
    // 100kb limit — prevents someone POSTing a 50MB JSON payload
    // and making us parse it.
    app.use(express.json({ limit: '100kb' }));
    app.use(express.urlencoded({ extended: true, limit: '100kb' }));

    // ─── Logging ────────────────────────────────────────────
    app.use(
        pinoHttp({
            logger,
            // Skip logging for health checks to reduce noise
            autoLogging: {
                ignore: (req) => req.url === '/health',
            },
        }),
    );

    // ─── Global rate limit ──────────────────────────────────
    app.use(
        rateLimit({
            windowMs: env.RATE_LIMIT_WINDOW_MS,
            max: env.RATE_LIMIT_MAX,
            standardHeaders: true,
            legacyHeaders: false,
            message: {
                error: {
                    code: 'RATE_LIMITED',
                    message: 'Too many requests. Slow down.',
                },
            },
        }),
    );

    // ─── Health check ───────────────────────────────────────
    app.get('/health', (_req, res) => {
        res.json({
            status: 'ok',
            service: 'bankflow-api',
            env: env.NODE_ENV,
            time: new Date().toISOString(),
        });
    });

    // ─── API routes ─────────────────────────────────────────
    const api = express.Router();
    api.use('/auth', authRoutes);
    app.use(env.API_PREFIX, api);
    api.use('/accounts', accountsRoutes);
    api.use('/transactions', transactionsRoutes);
    api.use('/transfers', transfersRoutes);
    api.use('/beneficiaries', beneficiariesRoutes);
    api.use('/admin', adminRoutes);

    // ─── 404 + error handler ────────────────────────────────
    // Order matters: 404 handler must be after all routes,
    // error handler must be LAST.
    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}