"use strict";
/**
 * Security and privacy utilities.
 * These functions ensure no sensitive data is retained in memory longer than necessary.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_ACCOUNTS_PER_SOURCE = exports.MAX_FILE_SIZE = void 0;
exports.sanitizeString = sanitizeString;
exports.isValidEmail = isValidEmail;
exports.sanitizeEmail = sanitizeEmail;
exports.validateFileSize = validateFileSize;
exports.clearSensitiveData = clearSensitiveData;
exports.createDeduplicationHash = createDeduplicationHash;
exports.validateAccountCount = validateAccountCount;
/**
 * Maximum file size allowed for parsing (50MB)
 * Prevents abuse and memory exhaustion
 */
exports.MAX_FILE_SIZE = 50 * 1024 * 1024;
/**
 * Maximum number of accounts to process from a single source
 * Prevents excessive memory usage
 */
exports.MAX_ACCOUNTS_PER_SOURCE = 10000;
/**
 * Sanitizes a string by removing potentially dangerous characters
 * and limiting length
 */
function sanitizeString(input, maxLength = 500) {
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
function isValidEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
}
/**
 * Sanitizes email address
 */
function sanitizeEmail(email) {
    const sanitized = sanitizeString(email.toLowerCase(), 254);
    return isValidEmail(sanitized) ? sanitized : '';
}
/**
 * Validates file size before processing
 */
function validateFileSize(fileSize) {
    return fileSize > 0 && fileSize <= exports.MAX_FILE_SIZE;
}
/**
 * Clears sensitive data from memory by overwriting with null
 * Note: This is a best-effort approach; JavaScript's garbage collector
 * may not immediately clear the memory, but we follow best practices.
 */
function clearSensitiveData(data) {
    if (typeof data === 'string') {
        // Strings are immutable, so we can't overwrite them
        // The best we can do is set the reference to null
        data = null;
    }
    else if (data && typeof data === 'object') {
        // Clear object properties
        for (const key in data) {
            if (data.hasOwnProperty(key)) {
                delete data[key];
            }
        }
    }
}
/**
 * Creates a hash for deduplication purposes (non-cryptographic)
 * This is safe to store as it doesn't reveal the original data
 */
function createDeduplicationHash(service, accountEmail, source) {
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
function validateAccountCount(count) {
    return count > 0 && count <= exports.MAX_ACCOUNTS_PER_SOURCE;
}
