import { Router } from 'express';
import * as controller from './accounts.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { listTransactions } from '../transactions/transactions.controller.js';
import { listTransfers } from '../transfers/transfers.controller.js';

const router = Router();

// Every account route requires authentication
router.use(requireAuth);

// GET /api/accounts
router.get('/', controller.listAccounts);

// GET /api/accounts/:accountId/balance
router.get('/:accountId/balance', controller.getBalance);

// GET /api/accounts/lookup?accountNumber=0123456789
router.get('/lookup', controller.lookupAccount);

// GET /api/accounts/:accountId
router.get('/:accountId', controller.getAccount);

// GET /api/accounts/:accountId/transactions
router.get('/:accountId/transactions', listTransactions);

// GET /api/accounts/:accountId
router.get('/:accountId', controller.getAccount);

// GET /api/accounts/:accountId/transfers
router.get('/:accountId/transfers', listTransfers);

export default router;