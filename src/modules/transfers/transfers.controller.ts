import type { Request, Response, NextFunction } from 'express';
import { currentUser } from '../../middleware/auth.middleware.js';
import { requireParam } from '../../utils/req-params.js';
import { badRequest } from '../../utils/errors.js';
import { CreateTransferSchema } from './transfers.schema.js';
import * as service from './transfers.service.js';


// POST /api/transfers


export async function createTransfer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = currentUser(req);
    const idempotencyKey = req.header('Idempotency-Key');

    if (!idempotencyKey) {
      throw badRequest('Idempotency-Key header is required for transfers');
    }

    const input = CreateTransferSchema.parse(req.body);

    const transfer = await service.createTransfer(
      user.sub,
      idempotencyKey,
      input,
      {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );

    res.status(201).json({ data: transfer });
  } catch (err) {
    next(err);
  }
}

// GET /api/accounts/:accountId/transfers


export async function listTransfers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = currentUser(req);
    const accountId = requireParam(req.params.accountId, 'accountId');
    const transfers = await service.listTransfersForAccount(user.sub, accountId);
    res.status(200).json({ data: transfers });
  } catch (err) {
    next(err);
  }
}