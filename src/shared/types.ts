/**
 * Core data types for the privacy-first account discovery application.
 * All data structures are designed to avoid storing sensitive information.
 */

export enum DataSource {
  GMAIL_OAUTH = 'Gmail (OAuth)',
  GMAIL_TAKEOUT = 'Gmail (Takeout)',
  CHROME_CSV = 'Chrome (CSV)',
  APPLE_EXPORT = 'Apple (Export)',
  MICROSOFT_OAUTH = 'Microsoft (OAuth)',
  FACEBOOK_OAUTH = 'Facebook (OAuth)',
  TWITTER_OAUTH = 'Twitter/X (OAuth)',
  APPLE_OAUTH = 'Apple (OAuth)',
  GITHUB_OAUTH = 'GitHub (OAuth)',
  OTHER_OAUTH = 'Other (OAuth)',
}

export interface DiscoveredAccount {
  /** Unique identifier for deduplication */
  id: string;
  /** Platform/service name (e.g., "Netflix", "Spotify") */
  service: string;
  /** Originating account email (e.g., "user@gmail.com") */
  accountEmail: string;
  /** Data source where this was discovered */
  source: DataSource;
  /** Date when this entry was discovered */
  discoveredAt: Date;
  /** Additional metadata (non-sensitive) */
  metadata?: Record<string, string>;
}

export interface ParsedFileResult {
  accounts: DiscoveredAccount[];
  errors: string[];
}

export interface OAuthConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
}

export interface RateLimitState {
  lastRequestTime: number;
  requestCount: number;
  resetTime: number;
}
