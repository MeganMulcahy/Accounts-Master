"use strict";
/**
 * Rate limiting utilities for API calls and local processing.
 * Implements exponential backoff and per-source rate limiting.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileParsingRateLimiter = exports.twitterRateLimiter = exports.facebookRateLimiter = exports.microsoftRateLimiter = exports.gmailRateLimiter = exports.RateLimiter = void 0;
class RateLimiter {
    constructor(options) {
        this.options = options;
        this.requestTimestamps = new Map();
        this.backoffDelays = new Map();
    }
    /**
     * Check if a request can be made for the given source
     * Returns true if allowed, false if rate limited
     */
    canMakeRequest(source) {
        const now = Date.now();
        const timestamps = this.requestTimestamps.get(source) || [];
        // Remove timestamps outside the time window
        const windowStart = now - this.options.windowMs;
        const recentTimestamps = timestamps.filter(ts => ts > windowStart);
        // Check if we're in a backoff period
        const backoffUntil = this.backoffDelays.get(source) || 0;
        if (now < backoffUntil) {
            return false;
        }
        // Check if we've exceeded the rate limit
        if (recentTimestamps.length >= this.options.maxRequests) {
            if (this.options.useExponentialBackoff) {
                this.applyBackoff(source);
            }
            return false;
        }
        // Update timestamps
        recentTimestamps.push(now);
        this.requestTimestamps.set(source, recentTimestamps);
        return true;
    }
    /**
     * Wait for rate limit if necessary
     * Returns a promise that resolves when the request can be made
     */
    async waitIfNeeded(source) {
        const backoffUntil = this.backoffDelays.get(source) || 0;
        const now = Date.now();
        if (now < backoffUntil) {
            const waitTime = backoffUntil - now;
            await this.sleep(waitTime);
        }
        while (!this.canMakeRequest(source)) {
            const nextAvailable = this.getNextAvailableTime(source);
            const waitTime = Math.max(nextAvailable - now, 100); // Minimum 100ms
            await this.sleep(waitTime);
        }
    }
    /**
     * Apply exponential backoff
     */
    applyBackoff(source) {
        const currentBackoff = this.backoffDelays.get(source) || 0;
        const now = Date.now();
        const currentDelay = Math.max(0, currentBackoff - now);
        const initialBackoff = this.options.initialBackoffMs || 1000;
        const maxBackoff = this.options.maxBackoffMs || 60000;
        // Exponential backoff: double the delay, capped at max
        const nextDelay = Math.min(currentDelay * 2 || initialBackoff, maxBackoff);
        this.backoffDelays.set(source, now + nextDelay);
    }
    /**
     * Get the next available time for making a request
     */
    getNextAvailableTime(source) {
        const timestamps = this.requestTimestamps.get(source) || [];
        if (timestamps.length === 0) {
            return Date.now();
        }
        // Find the oldest timestamp in the window
        const windowStart = Date.now() - this.options.windowMs;
        const oldestInWindow = Math.min(...timestamps.filter(ts => ts > windowStart));
        // Return when we can make the next request (when oldest leaves the window)
        return oldestInWindow + this.options.windowMs;
    }
    /**
     * Reset rate limit state for a source
     */
    reset(source) {
        this.requestTimestamps.delete(source);
        this.backoffDelays.delete(source);
    }
    /**
     * Clear all rate limit state
     */
    clear() {
        this.requestTimestamps.clear();
        this.backoffDelays.clear();
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.RateLimiter = RateLimiter;
/**
 * Default rate limiters for different API sources
 */
// Gmail API: 250 quota units per user per second
exports.gmailRateLimiter = new RateLimiter({
    maxRequests: 10,
    windowMs: 1000, // 1 second
    useExponentialBackoff: true,
    initialBackoffMs: 1000,
    maxBackoffMs: 30000,
});
// Microsoft Graph API: Varies, but conservative defaults
exports.microsoftRateLimiter = new RateLimiter({
    maxRequests: 5,
    windowMs: 1000,
    useExponentialBackoff: true,
    initialBackoffMs: 1000,
    maxBackoffMs: 30000,
});
// Facebook Graph API: 200 calls per hour per user
exports.facebookRateLimiter = new RateLimiter({
    maxRequests: 50,
    windowMs: 60 * 60 * 1000, // 1 hour
    useExponentialBackoff: true,
    initialBackoffMs: 2000,
    maxBackoffMs: 60000,
});
// Twitter API v2: 300 requests per 15 minutes
exports.twitterRateLimiter = new RateLimiter({
    maxRequests: 300,
    windowMs: 15 * 60 * 1000, // 15 minutes
    useExponentialBackoff: true,
    initialBackoffMs: 2000,
    maxBackoffMs: 60000,
});
// File parsing rate limiter (to prevent CPU abuse)
exports.fileParsingRateLimiter = new RateLimiter({
    maxRequests: 3,
    windowMs: 1000,
    useExponentialBackoff: false,
});
