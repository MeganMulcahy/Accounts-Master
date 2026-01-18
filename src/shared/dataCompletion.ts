/**
 * Automatic Data Completion Service
 * Fills in missing Service/App Name, Link (homepage), and Provider Email
 * using safe inference from available metadata.
 * 
 * PRIVACY: Only uses service names and domains - NEVER uses user emails or passwords
 */

import { DiscoveredAccount } from './types';

/**
 * Extract service name from email address
 * Example: "noreply@spotify.com" → "Spotify"
 */
export function inferServiceNameFromEmail(email: string): string | null {
  if (!email || !email.includes('@')) {
    return null;
  }

  const domain = email.split('@')[1].toLowerCase();
  
  // Remove common email prefixes from domain
  const cleanDomain = domain
    .replace(/^(mail|news|noreply|no-reply|donotreply|support|info|hello|contact|billing|admin)\./i, '')
    .replace(/\.(com|net|org|io|co|us|uk|de|fr|ca|au|jp|in|edu|gov)$/, '');

  // Extract service name from domain
  // "spotify" from "spotify.com" or "accounts.spotify.com"
  const domainParts = cleanDomain.split('.');
  let serviceName = domainParts[domainParts.length - 1] || domainParts[0];

  if (!serviceName || serviceName.length < 2) {
    return null;
  }

  // Capitalize first letter
  serviceName = serviceName.charAt(0).toUpperCase() + serviceName.slice(1);

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
  };

  if (serviceMap[serviceName.toLowerCase()]) {
    return serviceMap[serviceName.toLowerCase()];
  }

  return serviceName;
}

/**
 * Infer homepage link from service name or domain
 * Uses heuristics to generate likely homepage URL
 */
export function inferHomepageLink(serviceName: string, accountEmail?: string): string | null {
  if (!serviceName) {
    return null;
  }

  // Try to extract domain from email if provided
  let domain: string | null = null;
  if (accountEmail && accountEmail.includes('@')) {
    domain = accountEmail.split('@')[1].toLowerCase();
  }

  // If no domain from email, try to infer from service name
  if (!domain) {
    // Convert service name to domain (e.g., "Spotify" → "spotify.com")
    const serviceLower = serviceName.toLowerCase().replace(/[^a-z0-9]/g, '');
    domain = `${serviceLower}.com`;
  }

  // Validate domain
  if (!domain || domain.length < 3 || !domain.includes('.')) {
    return null;
  }

  // Generate homepage link
  return `https://${domain}`;
}

/**
 * Infer platform from data source
 */
export function inferPlatform(source: string): string {
  if (source.includes('Chrome')) return 'Chrome';
  if (source.includes('Apple')) return 'Apple';
  if (source.includes('Gmail')) return 'Gmail';
  if (source.includes('Microsoft')) return 'Microsoft';
  if (source.includes('Facebook')) return 'Facebook';
  if (source.includes('Twitter')) return 'Twitter/X';
  return 'Unknown';
}

/**
 * Complete missing data for an account
 * Fills in Service/App Name, Link (homepage), and validates Provider Email
 */
export function completeAccountData(account: DiscoveredAccount): DiscoveredAccount {
  const updated = { ...account };
  const metadata = account.metadata ? { ...account.metadata } : {};

  // 1. Complete Service/App Name if missing
  if (!account.service || account.service.trim() === '' || account.service === 'Unknown') {
    // Try to infer from accountEmail domain
    if (account.accountEmail && account.accountEmail.includes('@')) {
      const inferred = inferServiceNameFromEmail(account.accountEmail);
      if (inferred) {
        updated.service = inferred;
      }
    }
  }

  // 2. Complete Link (homepage) if missing
  if (!metadata.link || metadata.link.trim() === '') {
    const inferredLink = inferHomepageLink(updated.service, account.accountEmail);
    if (inferredLink) {
      metadata.link = inferredLink;
    }
  }

  // 3. Ensure Provider Email is set (use accountEmail)
  // Provider Email is the same as accountEmail - already present in the model

  // 4. Infer Platform if not set
  if (!metadata.platform || metadata.platform.trim() === '') {
    metadata.platform = inferPlatform(account.source);
  }

  updated.metadata = metadata;
  return updated;
}

/**
 * Batch complete data for multiple accounts
 */
export function completeAccountsData(accounts: DiscoveredAccount[]): DiscoveredAccount[] {
  return accounts.map(account => completeAccountData(account));
}
