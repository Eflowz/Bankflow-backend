import { Router } from 'express';
import * as controller from './transactions.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

// ─────────────────────────────────────────────────────────────
// Transactions router
// ─────────────────────────────────────────────────────────────
//
// Two ways transactions are reached:
//
//   1. Nested under an account:
//        GET /api/accounts/:accountId/transactions
//      → handled by accounts.routes.ts (reuses listTransactions)
//
//   2. Directly by ID:
//        GET /api/transactions/:transactionId
//      → handled here
//
// Why both? Because clients often have a transaction ID from a
// link or notification and don't want to remember the account ID
// to fetch it. REST purists prefer the nested form for listing
// and the flat form for direct access. Both are fine.
// ─────────────────────────────────────────────────────────────

const router = Router();

// Every route in this file requires authentication
router.use(requireAuth);

// GET /api/transactions/:transactionId
router.get('/:transactionId', controller.getTransaction);

export default router;