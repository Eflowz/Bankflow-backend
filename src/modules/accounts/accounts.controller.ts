import type { Request, Response, NextFunction } from 'express';
import { currentUser } from '../../middleware/auth.middleware.js';
import { requireParam } from '../../utils/req-params.js';
import * as service from './accounts.service.js';
import {z} from 'zod';


export async function listAccounts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = currentUser(req);
    const accounts = await service.listAccountsForUser(user.sub);
    res.status(200).json({ data: accounts });
  } catch (err) {
    next(err);
  }
}

export async function getAccount(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = currentUser(req);
    const accountId = requireParam(req.params.accountId, 'accountId');
    //              ^^^^^^^^^^^^ — this narrows string | string[] | undefined → string

    const account = await service.getAccountById(user.sub, accountId);
    res.status(200).json({ data: account });
  } catch (err) {
    next(err);
  }
}

export async function getBalance(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = currentUser(req);
    const accountId = requireParam(req.params.accountId, 'accountId');

    const balance = await service.getAccountBalance(user.sub, accountId);
    res.status(200).json({ data: balance });
  } catch (err) {
    next(err);
  }
}

const LookupQuerySchema = z.object({
  accountNumber: z.string().regex(/^\d{10}$/, 'Must be 10 digits'),
});

export async function lookupAccount(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { accountNumber } = LookupQuerySchema.parse(req.query);
    const result = await service.lookupAccountByNumber(accountNumber);

    if (!result) {
      res.status(404).json({
        error: {
          code: 'ACCOUNT_NOT_FOUND',
          message: 'No active account found with that number',
        },
      });
      return;
    }

    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}