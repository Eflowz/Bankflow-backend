import { Router } from 'express';
import * as controller from './transfers.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { idempotency } from '../../middleware/idempotency.middleware.js';

const router = Router();

router.use(requireAuth);

router.post(
  '/',
  idempotency('transfer'),
  controller.createTransfer,
);

export default router;