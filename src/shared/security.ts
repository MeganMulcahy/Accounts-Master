/**
 * Security and privacy utilities.
 * These functions ensure no sensitive data is retained in memory longer than necessary.
 */

/**
 * Maximum file size allowed for parsing (5.5GB)
 * Prevents abuse and memory exhaustion
 * Increased to support large MBOX files from email exports
 */
export const MAX_FILE_SIZE = 5.5 * 1024 * 1024 * 1024; // 5.5 GB

/**
 * Maximum number of accounts to process from a single source
 * Prevents excessive memory usage
 */
export const MAX_ACCOUNTS_PER_SOURCE = 10000;

/**
 * Sanitizes a string by removing potentially dangerous characters
 * and limiting length
 */
export function sanitizeString(input: string, maxLength: number = 500): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // Remove null bytes and control characters except newlines and tabs
  let sanitized = input
    .replace(/\0/g, '')
    .replace(/[\x01-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
  
  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized;
}

/**
 * Validates email format (basic validation)
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Sanitizes email address
 */
export function sanitizeEmail(email: string): string {
  const sanitized = sanitizeString(email.toLowerCase(), 254);
  return isValidEmail(sanitized) ? sanitized : '';
}

/**
 * Validates file size before processing
 */
export function validateFileSize(fileSize: number): boolean {
  return fileSize > 0 && fileSize <= MAX_FILE_SIZE;
}

/**
 * Clears sensitive data from memory by overwriting with null
 * Note: This is a best-effort approach; JavaScript's garbage collector
 * may not immediately clear the memory, but we follow best practices.
 */
export function clearSensitiveData(data: string | object | null | undefined): void {
  if (typeof data === 'string') {
    // Strings are immutable, so we can't overwrite them
    // The best we can do is set the reference to null
    data = null as any;
  } else if (data && typeof data === 'object') {
    // Clear object properties
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        delete (data as any)[key];
      }
    }
  }
}

/**
 * Creates a hash for deduplication purposes (non-cryptographic)
 * This is safe to store as it doesn't reveal the original data
 */
export function createDeduplicationHash(
  service: string,
  accountEmail: string,
  source: string
): string {
  // Simple hash for deduplication - not cryptographically secure
  // but sufficient for identifying duplicate entries
  const combined = `${service.toLowerCase()}|${accountEmail.toLowerCase()}|${source}`;
  
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * Validates that parsed data doesn't exceed reasonable limits
 */
export function validateAccountCount(count: number): boolean {
  return count > 0 && count <= MAX_ACCOUNTS_PER_SOURCE;
}
