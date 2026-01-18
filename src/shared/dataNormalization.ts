/**
 * Data Normalization Service
 * Enforces STRICT RULES for data structure after import/inference
 * 
 * MANDATORY: All rows MUST be normalized before being displayed or stored
 */

import { DiscoveredAccount } from './types';

export interface NormalizedAccount extends DiscoveredAccount {
  /** Normalized provider email (valid email only) */
  providerEmail: string;
  /** Normalized service link (valid URL only) */
  serviceLink: string;
  /** Normalized service name (human-readable, no @ or URLs) */
  serviceName: string;
  /** Whether this row required normalization */
  normalizationApplied: boolean;
  /** Whether normalization failed - needs review */
  needsReview: boolean;
  /** Fields that were inferred/filled */
  inferredFields?: string[];
}

/**
 * Validates email format
 * MUST match regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
 */
function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validates URL format
 * MUST start with http:// or https://
 * MUST NOT contain @ symbols
 */
function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  const trimmed = url.trim();
  // Must start with http:// or https://
  if (!trimmed.match(/^https?:\/\//i)) {
    return false;
  }
  // Must not contain @ symbols
  if (trimmed.includes('@')) {
    return false;
  }
  // Basic URL validation
  try {
    new URL(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates service name
 * MUST be human-readable
 * MUST NOT contain @ or URLs
 */
function isValidServiceName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }
  const trimmed = name.trim();
  // Must not contain @
  if (trimmed.includes('@')) {
    return false;
  }
  // Must not contain URLs
  if (trimmed.match(/https?:\/\//i)) {
    return false;
  }
  // Must be at least 1 character and reasonable length
  return trimmed.length >= 1 && trimmed.length <= 200;
}

/**
 * Extract email from a string that may contain multiple values
 * Example: "billing@netflix.com https://netflix.com" → "billing@netflix.com"
 */
function extractEmail(input: string): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }
  
  // Try to find email pattern
  const emailPattern = /([^\s@]+@[^\s@]+\.[^\s@]+)/;
  const match = input.match(emailPattern);
  
  if (match && isValidEmail(match[1])) {
    return match[1].trim();
  }
  
  return null;
}

/**
 * Extract URL from a string that may contain multiple values
 * Example: "billing@netflix.com https://netflix.com" → "https://netflix.com"
 */
function extractUrl(input: string): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }
  
  // Try to find URL pattern
  const urlPattern = /(https?:\/\/[^\s@]+)/i;
  const match = input.match(urlPattern);
  
  if (match && isValidUrl(match[1])) {
    return match[1].trim();
  }
  
  return null;
}

/**
 * Extract clean service name from complex strings
 * Examples:
 *   "accounts.spotify.com (meganmulcahy9)" → "Spotify"
 *   "www.netflix.com" → "Netflix"
 *   "mail.google.com" → "Google"
 */
function extractServiceNameFromString(input: string): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }
  
  // Remove parenthetical text like "(meganmulcahy9)"
  let cleaned = input.replace(/\s*\([^)]*\)\s*/g, '').trim();
  
  // Extract domain from URL-like strings
  // Pattern: something like "accounts.spotify.com" or "www.netflix.com"
  const domainMatch = cleaned.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.)?([a-zA-Z0-9-]+)\.(?:com|net|org|io|co|us|uk|de|fr|ca|au|jp|in|edu|gov|app|dev)/i);
  
  if (domainMatch) {
    // Extract the main domain (second capture group)
    const mainDomain = domainMatch[2]?.toLowerCase();
    if (mainDomain) {
      return inferServiceNameFromDomain(mainDomain + '.com'); // Pass as domain for mapping
    }
  }
  
  // If it's already a clean domain-like string without protocol
  if (cleaned.match(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
    return inferServiceNameFromDomain(cleaned);
  }
  
  return null;
}

/**
 * Infer service name from email domain or URL
 */
function inferServiceNameFromDomain(domain: string): string | null {
  if (!domain || typeof domain !== 'string') {
    return null;
  }
  
  const domainLower = domain.toLowerCase().replace(/^www\./, '');
  
  // Extract base domain - handle subdomains like "accounts.spotify.com"
  // Split by dots and take the second-to-last part (main domain before TLD)
  const parts = domainLower.split('.');
  let baseDomain: string;
  
  if (parts.length >= 2) {
    // For "accounts.spotify.com", take "spotify" (parts[parts.length - 2])
    // For "spotify.com", take "spotify" (parts[0])
    baseDomain = parts[parts.length - 2] || parts[0];
  } else {
    baseDomain = parts[0] || domainLower;
  }
  
  // Remove common email/service prefixes (but not for main domain extraction)
  // This is for email domains like "mail.google.com" where we still want "Google"
  // But for "accounts.spotify.com", baseDomain is already "spotify"
  
  if (!baseDomain || baseDomain.length < 2) {
    return null;
  }
  
  // Known service name mappings
  const serviceMap: Record<string, string> = {
    'googlemail': 'Gmail',
    'google': 'Google',
    'yahoo': 'Yahoo',
    'hotmail': 'Hotmail',
    'outlook': 'Microsoft Outlook',
    'live': 'Microsoft',
    'msn': 'Microsoft',
    'aol': 'AOL',
    'icloud': 'Apple iCloud',
    'apple': 'Apple',
    'facebook': 'Facebook',
    'twitter': 'Twitter/X',
    'x': 'Twitter/X',
    'instagram': 'Instagram',
    'linkedin': 'LinkedIn',
    'github': 'GitHub',
    'amazon': 'Amazon',
    'netflix': 'Netflix',
    'spotify': 'Spotify',
    'hulu': 'Hulu',
    'disney': 'Disney+',
    'paypal': 'PayPal',
    'stripe': 'Stripe',
    'uber': 'Uber',
    'airbnb': 'Airbnb',
    'appfolio': 'Allied', // Map appfolio.com to Allied
    'crimson': 'Crimson',
    'domini': 'DominI',
  };
  
  if (serviceMap[baseDomain]) {
    return serviceMap[baseDomain];
  }
  
  // Capitalize first letter
  return baseDomain.charAt(0).toUpperCase() + baseDomain.slice(1);
}

/**
 * Infer service link from service name
 */
function inferServiceLink(serviceName: string): string | null {
  if (!serviceName || typeof serviceName !== 'string') {
    return null;
  }
  
  // Convert service name to domain (e.g., "Spotify" → "spotify.com")
  const domain = serviceName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (domain.length < 2) {
    return null;
  }
  
  return `https://${domain}.com`;
}

/**
 * Infer provider email from account context
 * NEVER infer from service domain alone - must have source context
 */
function inferProviderEmail(account: DiscoveredAccount): string | null {
  // Use accountEmail if valid
  if (account.accountEmail && isValidEmail(account.accountEmail)) {
    return account.accountEmail;
  }
  
  // For Gmail source, the accountEmail should be set during parsing
  // For Chrome/Apple, it should come from the import context
  // We don't infer from service domain alone per requirements
  
  return null;
}

/**
 * Normalize a single account - MANDATORY step
 * Enforces strict rules and auto-separates combined values
 */
export function normalizeAccount(account: DiscoveredAccount): NormalizedAccount {
  const normalized: NormalizedAccount = {
    ...account,
    providerEmail: '',
    serviceLink: '',
    serviceName: '',
    normalizationApplied: false,
    needsReview: false,
    inferredFields: [],
  };

  // STEP 1: Extract and separate values from accountEmail field
  let extractedEmail: string | null = null;
  let extractedUrl: string | null = null;
  
  if (account.accountEmail) {
    // Try to extract email from accountEmail field
    extractedEmail = extractEmail(account.accountEmail);
    
    // Try to extract URL from accountEmail field (may contain both)
    extractedUrl = extractUrl(account.accountEmail);
  }

  // STEP 2: Extract values from service field
  let extractedServiceName: string | null = null;
  
  if (account.service) {
    // Check if service field contains email/URL (wrong placement)
    const serviceEmail = extractEmail(account.service);
    const serviceUrl = extractUrl(account.service);
    
    if (serviceEmail && !extractedEmail) {
      extractedEmail = serviceEmail;
      normalized.inferredFields!.push('providerEmail');
    }
    if (serviceUrl && !extractedUrl) {
      extractedUrl = serviceUrl;
      normalized.inferredFields!.push('serviceLink');
    }
    
    // Try to extract clean service name from complex strings like "accounts.spotify.com (meganmulcahy9)"
    const extractedFromString = extractServiceNameFromString(account.service);
    if (extractedFromString) {
      extractedServiceName = extractedFromString;
      normalized.inferredFields!.push('serviceName');
      normalized.normalizationApplied = true;
    } else if (!serviceEmail && !serviceUrl && isValidServiceName(account.service)) {
      // If service is clean (no email/URL), use it as serviceName
      extractedServiceName = account.service.trim();
    }
  }

  // STEP 3: Check metadata for additional values
  if (account.metadata) {
    // Check metadata.link
    if (account.metadata.link && !extractedUrl && isValidUrl(account.metadata.link)) {
      extractedUrl = account.metadata.link;
      normalized.inferredFields!.push('serviceLink');
    }
  }

  // STEP 4: Assign extracted or existing values
  // Provider Email
  if (extractedEmail && isValidEmail(extractedEmail)) {
    normalized.providerEmail = extractedEmail;
  } else if (account.accountEmail && isValidEmail(account.accountEmail)) {
    normalized.providerEmail = account.accountEmail;
  } else {
    // Try to infer from source context
    const inferred = inferProviderEmail(account);
    if (inferred) {
      normalized.providerEmail = inferred;
      normalized.inferredFields!.push('providerEmail');
      normalized.normalizationApplied = true;
    }
  }

  // Service Link
  if (extractedUrl && isValidUrl(extractedUrl)) {
    normalized.serviceLink = extractedUrl;
  } else if (account.metadata?.link && isValidUrl(account.metadata.link)) {
    normalized.serviceLink = account.metadata.link;
  } else {
    // Infer from service name
    const serviceNameForInference = extractedServiceName || account.service;
    if (serviceNameForInference) {
      const inferred = inferServiceLink(serviceNameForInference);
      if (inferred) {
        normalized.serviceLink = inferred;
        normalized.inferredFields!.push('serviceLink');
        normalized.normalizationApplied = true;
      }
    }
  }

  // Service Name
  if (extractedServiceName && isValidServiceName(extractedServiceName)) {
    normalized.serviceName = extractedServiceName;
  } else if (account.service && isValidServiceName(account.service)) {
    normalized.serviceName = account.service;
  } else {
    // Infer from email domain or URL
    let domain: string | null = null;
    if (normalized.providerEmail && normalized.providerEmail.includes('@')) {
      domain = normalized.providerEmail.split('@')[1];
    } else if (normalized.serviceLink) {
      try {
        const url = new URL(normalized.serviceLink);
        domain = url.hostname;
      } catch {
        // Invalid URL, skip
      }
    }
    
    if (domain) {
      const inferred = inferServiceNameFromDomain(domain);
      if (inferred) {
        normalized.serviceName = inferred;
        normalized.inferredFields!.push('serviceName');
        normalized.normalizationApplied = true;
      }
    }
  }

  // STEP 5: Validate all required fields
  const hasValidProviderEmail = normalized.providerEmail && isValidEmail(normalized.providerEmail);
  const hasValidServiceLink = normalized.serviceLink && isValidUrl(normalized.serviceLink);
  const hasValidServiceName = normalized.serviceName && isValidServiceName(normalized.serviceName);

  // STEP 6: Mark as needs review if required fields are missing
  if (!hasValidProviderEmail || !hasValidServiceLink || !hasValidServiceName) {
    normalized.needsReview = true;
  }

  // Mark normalization applied if any inference happened
  if (normalized.inferredFields && normalized.inferredFields.length > 0) {
    normalized.normalizationApplied = true;
  }

  return normalized;
}

/**
 * Normalize multiple accounts
 */
export function normalizeAccounts(accounts: DiscoveredAccount[]): NormalizedAccount[] {
  return accounts.map(account => normalizeAccount(account));
}
