import type { Request, Response, NextFunction } from 'express';
import type { Role } from '../types/auth.js';
import { forbidden, unauthorized } from '../utils/errors.js';



export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(unauthorized('Authentication required'));
    }

    const userRole = req.user.role;

    if (!allowed.includes(userRole)) {
      return next(
        forbidden(
          `This action requires one of: ${allowed.join(', ')}. You are: ${userRole}`,
        ),
      );
    }

    next();
  };
}