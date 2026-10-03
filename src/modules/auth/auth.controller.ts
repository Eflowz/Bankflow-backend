import type { Request, Response, NextFunction } from 'express';
import {
  RegisterSchema,
  LoginSchema,
  RefreshSchema,
} from './auth.schema';
import * as authService from './auth.service.js';
import { currentUser } from '../../middleware/auth.middleware.js';
import { badRequest } from '../../utils/errors.js';

// ─────────────────────────────────────────────────────────────
// Controllers are thin. They:
//   1. Parse + validate input (via Zod)
//   2. Extract meta (ip, user-agent)
//   3. Call the service
//   4. Shape the HTTP response
//
// No business logic. No DB calls. Ever.
// ─────────────────────────────────────────────────────────────

function meta(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = RegisterSchema.parse(req.body);
    const result = await authService.register(input, meta(req));
    res.status(201).json({
      data: {
        user: result.user,
        tokens: result.tokens,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = LoginSchema.parse(req.body);
    const result = await authService.login(input, meta(req));
    res.status(200).json({
      data: {
        user: result.user,
        tokens: result.tokens,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = RefreshSchema.parse(req.body);
    const tokens = await authService.refresh(input.refreshToken, meta(req));
    res.status(200).json({ data: { tokens } });
  } catch (err) {
    next(err);
  }
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = RefreshSchema.parse(req.body);
    await authService.logout(input.refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function me(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = currentUser(req);
    const profile = await authService.getMe(user.sub);
    res.status(200).json({ data: { user: profile } });
  } catch (err) {
    next(err);
  }
}