import { badRequest } from './errors.js';

export function requireParam(
  value: string | string[] | undefined,
  name: string,
): string {
  if (value === undefined) {
    throw badRequest(`Missing required path parameter: ${name}`);
  }
  if (Array.isArray(value)) {
    throw badRequest(`Path parameter '${name}' must be a single value`);
  }
  if (value === '') {
    throw badRequest(`Path parameter '${name}' cannot be empty`);
  }
  return value;
}