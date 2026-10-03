import type { Request, Response, NextFunction } from 'express';
import { currentUser } from '../../middleware/auth.middleware.js';
import { requireParam } from '../../utils/req-params.js';
import {
  AdminListUsersQuerySchema,
  AdminListTransfersQuerySchema,
  AdminUpdateUserSchema,
} from './admin.schema.js';
import * as service from './admin.service.js';

export async function listUsers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = AdminListUsersQuerySchema.parse(req.query);
    const result = await service.listUsers(query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = currentUser(req);
    const userId = requireParam(req.params.userId, 'userId');
    const input = AdminUpdateUserSchema.parse(req.body);
    const updated = await service.updateUser(user.sub, userId, input, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.status(200).json({ data: updated });
  } catch (err) {
    next(err);
  }
}

export async function listTransfers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = AdminListTransfersQuerySchema.parse(req.query);
    const result = await service.listTransfers(query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getStats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await service.getStats();
    res.status(200).json({ data: stats });
  } catch (err) {
    next(err);
  }
}