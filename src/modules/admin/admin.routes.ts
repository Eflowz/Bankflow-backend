import { Router } from 'express';
import * as controller from './admin.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/role.middleware.js';
import { ROLES } from '../../types/auth.js';

// ─────────────────────────────────────────────────────────────
// Admin router
// ─────────────────────────────────────────────────────────────
//
// Every route here requires BOTH:
//   1. Authentication (requireAuth)
//   2. Role check (requireRole)
//
// The role check runs AFTER auth, so req.user is always set.
// ─────────────────────────────────────────────────────────────

const router = Router();

router.use(requireAuth);

// ─── Read-only admin actions: ADMIN, OPERATIONS, AUDITOR ──
//
// AUDITOR gets read access to everything but can't modify.
// OPERATIONS can view + take action on customer issues.
// ADMIN can do everything.

router.get(
  '/stats',
  requireRole(ROLES.ADMIN, ROLES.OPERATIONS, ROLES.AUDITOR),
  controller.getStats,
);

router.get(
  '/users',
  requireRole(ROLES.ADMIN, ROLES.OPERATIONS, ROLES.AUDITOR),
  controller.listUsers,
);

router.get(
  '/transfers',
  requireRole(ROLES.ADMIN, ROLES.OPERATIONS, ROLES.AUDITOR),
  controller.listTransfers,
);

// ─── Write actions: ADMIN only ────────────────────────────
//
// Changing a user's role or status is a privileged operation.
// Only ADMIN can do it. Even OPERATIONS must escalate.

router.patch(
  '/users/:userId',
  requireRole(ROLES.ADMIN),
  controller.updateUser,
);

export default router;