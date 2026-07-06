// Centralized phone/email validation + input formatting so every form
// (Leads, Companies, User creation, CSV imports) enforces the same rules
// instead of each component re-inventing its own regex.

export const PHONE_DIGITS_REGEX = /^\d{10}$/;
export const PHONE_ERROR_MESSAGE = 'Please enter a valid 10-digit phone number.';

// Local part: no consecutive dots, no leading/trailing dot, no @ or whitespace.
// Domain: at least one dot-separated label after the @ (rejects "john@gmail").
export const EMAIL_REGEX = /^[^\s@.]+(?:\.[^\s@.]+)*@[^\s@.]+(?:\.[^\s@.]+)+$/;
export const EMAIL_ERROR_MESSAGE = 'Please enter a valid email address.';

// Strips everything but digits and caps at 10 — used as the onChange handler
// for phone inputs so letters/symbols can never be typed or pasted in.
export function stripPhoneDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10);
}

// Visual-only grouping (98765-43210); the underlying form/DB value stays raw digits.
export function formatPhoneDisplay(digits: string): string {
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function isValidPhone(digits: string): boolean {
  return PHONE_DIGITS_REGEX.test(digits);
}

// Strips whitespace as the user types (real email addresses never contain spaces).
export function stripEmailInput(value: string): string {
  return value.replace(/\s/g, '');
}

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}
