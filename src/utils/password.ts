import bcrypt from 'bcryptjs';


const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    // bcrypt.compare can throw on malformed hash — treat as "no match"
    return false;
  }
}

/**
 * Password strength check for the registration endpoint.
 * Returns a list of problems; empty list means OK.
 *
 * Real systems use zxcvbn for entropy estimation. This is a
 * minimal ruleset that catches the worst offenders.
 */
export function validatePasswordStrength(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 8) problems.push('Must be at least 8 characters');
  if (password.length > 72) problems.push('Must be at most 72 characters'); // bcrypt truncates at 72
  if (!/[a-z]/.test(password)) problems.push('Must contain a lowercase letter');
  if (!/[A-Z]/.test(password)) problems.push('Must contain an uppercase letter');
  if (!/[0-9]/.test(password)) problems.push('Must contain a digit');
  return problems;
}