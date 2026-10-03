export const ROLES = {
  CUSTOMER: 'CUSTOMER',
  ADMIN: 'ADMIN',
  OPERATIONS: 'OPERATIONS',
  AUDITOR: 'AUDITOR',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_VALUES = Object.values(ROLES) as Role[];

export function isRole(v: unknown): v is Role {
  return (
    typeof v === 'string' &&
    (ROLE_VALUES as readonly string[]).includes(v)
  );
}