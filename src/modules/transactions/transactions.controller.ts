import type { Request, Response, NextFunction } from 'express';
import { currentUser } from '../../middleware/auth.middleware.js';
import { requireParam } from '../../utils/req-params.js';
import { TransactionQuerySchema } from './transactions.service.js';
import * as service from './transactions.service.js';

export async function listTransactions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = currentUser(req);
    const accountId = requireParam(req.params.accountId, 'accountId');
    const query = TransactionQuerySchema.parse(req.query);

    const result = await service.listTransactions(user.sub, accountId, query);

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getTransaction(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = currentUser(req);
    const transactionId = requireParam(req.params.transactionId, 'transactionId');

    const tx = await service.getTransactionById(user.sub, transactionId);

    res.status(200).json({ data: tx });
  } catch (err) {
    next(err);
  }
}