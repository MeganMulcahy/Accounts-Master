/**
 * Deduplication and consolidation logic for discovered accounts.
 * 
 * CONSOLIDATION RULES:
 * - Merge rows with SAME providerEmail (case-insensitive) AND SAME password (case-sensitive)
 *   AND (platform/source match OR serviceLink match)
 * - Concatenate links as comma-separated strings (not arrays)
 * - Recompute source from link domains
 * - Keep worst password strength and recommendation
 */

import { DiscoveredAccount, DataSource } from './types';

export interface DeduplicatedAccount extends DiscoveredAccount {
  /** All sources where this account was discovered */
  allSources: DataSource[];
  /** First discovery date */
  firstDiscoveredAt: Date;
  /** Most recent discovery date */
  lastDiscoveredAt: Date;
}

export interface ConsolidationResult {
  /** Consolidated accounts */
  accounts: DeduplicatedAccount[];
  /** Number of duplicate rows merged */
  mergedCount: number;
  /** Number of empty-only rows removed */
  removedCount: number;
}

/**
 * STEP 1 - HARD EMPTY DETECTION
 * 
 * Define EMPTY as any of: "", null, undefined, "-", "none", "n/a"
 */
function isEmpty(value: string | undefined | null): boolean {
  if (value === null || value === undefined) return true;
  const trimmed = String(value).trim().toLowerCase();
  return trimmed === '' || trimmed === '-' || trimmed === 'none' || trimmed === 'n/a';
}

/**
 * Normalize a value - convert empty values to empty string
 */
function normalizeEmpty(value: string | undefined | null): string {
  return isEmpty(value) ? '' : String(value).trim();
}

/**
 * Extract domain from URL and infer source
 */
function extractSourceFromLink(link: string | undefined | null): string {
  if (!link || isEmpty(link)) {
    return 'Unknown';
  }

  // Handle arrays (backward compatibility)
  if (Array.isArray(link)) {
    link = link[0] || '';
  }
  
  if (!link || typeof link !== 'string') {
    return 'Unknown';
  }

  try {
    const url = new URL(link);
    const hostname = url.hostname.toLowerCase();
    
    // Map known domains to sources
    if (hostname.includes('gmail.com')) return 'Gmail';
    if (hostname.includes('appfolio.com')) return 'Allied';
    if (hostname.includes('crimson.com')) return 'Crimson';
    if (hostname.includes('domini.com')) return 'DominI';
    
    // Extract second-level domain as fallback
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      const domain = parts[parts.length - 2];
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }
    
    return hostname;
  } catch {
    // Invalid URL, return unknown
    return 'Unknown';
  }
}

/**
 * Combine comma-separated link strings, removing duplicates
 */
function combineLinkStrings(link1: string | string[] | undefined | null, link2: string | string[] | undefined | null): string {
  // Convert to string arrays
  const links1: string[] = [];
  const links2: string[] = [];
  
  if (link1) {
    if (Array.isArray(link1)) {
      links1.push(...link1.filter(l => l && typeof l === 'string' && !isEmpty(l)));
    } else if (typeof link1 === 'string') {
      // Handle comma-separated strings
      const split = link1.split(',').map(l => l.trim()).filter(l => !isEmpty(l));
      links1.push(...split);
    }
  }
  
  if (link2) {
    if (Array.isArray(link2)) {
      links2.push(...link2.filter(l => l && typeof l === 'string' && !isEmpty(l)));
    } else if (typeof link2 === 'string') {
      // Handle comma-separated strings
      const split = link2.split(',').map(l => l.trim()).filter(l => !isEmpty(l));
      links2.push(...split);
    }
  }
  
  // Combine and deduplicate (case-insensitive)
  const uniqueLinks = new Set<string>();
  const normalizedLinks = new Map<string, string>(); // normalized -> original
  
  for (const link of [...links1, ...links2]) {
    const normalized = link.toLowerCase().trim();
    if (!isEmpty(link) && !uniqueLinks.has(normalized)) {
      uniqueLinks.add(normalized);
      normalizedLinks.set(normalized, link.trim()); // Keep original case
    }
  }
  
  // Return as comma-separated string
  return Array.from(normalizedLinks.values()).join(',');
}

/**
 * Normalize service name for fuzzy matching
 * Removes special characters, converts to lowercase, handles variations
 */
function normalizeServiceNameForMatching(serviceName: string): string {
  if (!serviceName || isEmpty(serviceName)) {
    return '';
  }
  
  // Convert to lowercase and remove common prefixes/suffixes
  let normalized = serviceName.toLowerCase().trim();
  
  // Remove common business suffixes
  normalized = normalized.replace(/\s+(inc|llc|ltd|corp|corporation|company|co)$/i, '');
  
  // Remove special characters except spaces and hyphens
  normalized = normalized.replace(/[^\w\s-]/g, '');
  
  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Check if two service names likely refer to the same service
 * Uses fuzzy matching and domain-based heuristics
 */
function areServicesSimilar(service1: string, service2: string): boolean {
  if (isEmpty(service1) || isEmpty(service2)) {
    return false;
  }
  
  const norm1 = normalizeServiceNameForMatching(service1);
  const norm2 = normalizeServiceNameForMatching(service2);
  
  // Exact match after normalization
  if (norm1 === norm2) {
    return true;
  }
  
  // Check if one contains the other (for cases like "Disney Plus" vs "Disneyplus")
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    // But require minimum length to avoid false positives
    const minLen = Math.min(norm1.length, norm2.length);
    if (minLen >= 4) {
      return true;
    }
  }
  
  // Levenshtein-like similarity for typos/variations
  const similarity = calculateStringSimilarity(norm1, norm2);
  if (similarity > 0.85) { // 85% similarity threshold
    return true;
  }
  
  return false;
}

/**
 * Simple string similarity calculation (Jaro-Winkler-like)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;
  
  // Remove common words for better matching
  const commonWords = ['the', 'and', 'for', 'with', 'app', 'service', 'portal', 'account'];
  const words1 = str1.split(/\s+/).filter(w => !commonWords.includes(w));
  const words2 = str2.split(/\s+/).filter(w => !commonWords.includes(w));
  
  if (words1.length === 0 && words2.length === 0) return 1.0;
  
  // Check word overlap
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  if (union.size === 0) return 0.0;
  
  return intersection.size / union.size;
}

/**
 * Normalize URL for consistent comparison
 * Removes trailing slashes, www prefix, and protocol
 * Example: "https://www.abercrombie.com/" -> "abercrombie.com"
 */
function normalizeLinkForMatching(link: string): string {
  if (!link || isEmpty(link)) {
    return '';
  }
  
  let normalized = link.trim();
  
  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '');
  
  try {
    const url = new URL(normalized);
    let hostname = url.hostname.toLowerCase();
    
    // Remove www. prefix
    hostname = hostname.replace(/^www\./, '');
    
    return hostname;
  } catch {
    // If not a valid URL, try to extract and normalize
    normalized = normalized.replace(/^https?:\/\//i, '');
    normalized = normalized.replace(/^www\./i, '');
    normalized = normalized.replace(/\/+$/, '');
    
    // Extract domain from patterns like "abercrombie.com/" or "www.abercrombie.com"
    const domainMatch = normalized.match(/([a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+)/);
    if (domainMatch) {
      let domain = domainMatch[1].toLowerCase();
      domain = domain.replace(/^www\./, '');
      return domain;
    }
    
    return normalized.toLowerCase();
  }
}

/**
 * Check if two domains likely refer to the same service
 * Handles: different TLDs (.com vs .org vs .io), subdomains (app.domain.com vs domain.com)
 */
function areDomainsRelated(domain1: string, domain2: string): boolean {
  if (isEmpty(domain1) || isEmpty(domain2)) {
    return false;
  }
  
  const norm1 = normalizeLinkForMatching(domain1);
  const norm2 = normalizeLinkForMatching(domain2);
  
  // Exact match
  if (norm1 === norm2) {
    return true;
  }
  
  // Extract base domains (without TLD)
  const base1 = extractBaseDomain(norm1);
  const base2 = extractBaseDomain(norm2);
  
  // Same base domain with different TLDs (e.g., "bold.com" vs "bold.org")
  if (base1 === base2 && base1.length >= 3) {
    // Check TLDs are different
    const tld1 = getTLD(norm1);
    const tld2 = getTLD(norm2);
    if (tld1 !== tld2 && (tld1 === 'com' || tld1 === 'org' || tld1 === 'io' || tld2 === 'com' || tld2 === 'org' || tld2 === 'io')) {
      return true;
    }
  }
  
  // Same base domain but different subdomains (e.g., "app.bold.com" vs "bold.com")
  if (norm1.includes(base2) || norm2.includes(base1)) {
    // Ensure it's actually a subdomain, not just containing the name
    if (norm1.endsWith('.' + base2 + '.' + getTLD(norm1)) || norm2.endsWith('.' + base1 + '.' + getTLD(norm2))) {
      return true;
    }
    if (norm1 === base2 + '.' + getTLD(norm1) || norm2 === base1 + '.' + getTLD(norm2)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Extract base domain name (without TLD)
 * Example: "spotify.com" -> "spotify", "accounts.spotify.com" -> "spotify"
 */
function extractBaseDomain(domain: string): string {
  const parts = domain.split('.');
  if (parts.length >= 2) {
    // For domains like "accounts.spotify.com", return "spotify"
    // For domains like "spotify.com", return "spotify"
    return parts[parts.length - 2];
  }
  return parts[0] || domain;
}

/**
 * Get TLD from domain
 */
function getTLD(domain: string): string {
  const parts = domain.split('.');
  if (parts.length >= 2) {
    return parts[parts.length - 1];
  }
  return '';
}

/**
 * Extract domain from URL for better matching
 * Example: "https://accounts.spotify.com/login" -> "spotify.com"
 * Normalizes www and trailing slashes for consistency
 */
function extractDomainFromLink(link: string): string {
  const normalized = normalizeLinkForMatching(link);
  
  if (!normalized) {
    return '';
  }
  
  // Extract base domain (for subdomains like accounts.spotify.com -> spotify.com)
  const parts = normalized.split('.');
  if (parts.length >= 2) {
    // Take last two parts for domain.tld (handles .co.uk, .com.au, etc. but prioritizes main TLD)
    // For most cases, just take last two parts
    return parts.slice(-2).join('.');
  }
  
  return normalized;
}

/**
 * Check if a link matches ANY link in a comma-separated link string or array
 * This handles cases where merged accounts have multiple links like "link1.com, link2.com"
 * and a new account with "link1.com" should merge with it
 */
function linkMatchesAnyInList(
  singleLink: string,
  linkList: string | string[] | undefined | null
): boolean {
  if (!singleLink || isEmpty(singleLink)) {
    return false;
  }
  
  if (!linkList) {
    return false;
  }
  
  // Convert to array of links
  const links: string[] = [];
  if (Array.isArray(linkList)) {
    links.push(...linkList);
  } else if (typeof linkList === 'string') {
    // Split comma-separated string
    links.push(...linkList.split(',').map(l => l.trim()).filter(l => l.length > 0));
  }
  
  if (links.length === 0) {
    return false;
  }
  
  // Normalize the single link
  const normalizedSingleLink = normalizeLinkForMatching(singleLink);
  const singleDomain = extractDomainFromLink(normalizedSingleLink);
  
  // Check if any link in the list matches
  for (const link of links) {
    if (isEmpty(link)) continue;
    
    const normalizedLink = normalizeLinkForMatching(link);
    const linkDomain = extractDomainFromLink(normalizedLink);
    
    // Check exact normalized match or domain match
    if (normalizedSingleLink === normalizedLink || singleDomain === linkDomain) {
      return true;
    }
    
    // Also check if domains are related
    if (areDomainsRelated(singleLink, link)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Creates a merge key from providerEmail + password + (serviceName OR serviceLink)
 * Also handles blank login rows merging into filled rows for same serviceName
 * 
 * Merge happens if:
 * - email + password match AND (serviceName matches OR serviceLink domain matches)
 */
function createMergeKey(
  providerEmail: string,
  password: string,
  serviceName: string,
  serviceLink: string,
  accountId?: string
): string {
  const normalizedEmail = normalizeEmpty(providerEmail).toLowerCase();
  const normalizedPassword = normalizeEmpty(password); // Case-sensitive
  const normalizedService = normalizeEmpty(serviceName).toLowerCase();
  
  // Extract domain from link for better matching
  const linkDomain = extractDomainFromLink(serviceLink);
  
  // Special case: blank login rows (empty email or password) can merge with filled rows for same serviceName
  const hasEmptyCredentials = isEmpty(normalizedEmail) || isEmpty(normalizedPassword);
  
  if (hasEmptyCredentials) {
    // Blank rows merge by serviceName only
    if (!isEmpty(normalizedService)) {
      return `_BLANK_${normalizedService}|${accountId || Date.now()}`;
    }
    // Completely empty row - unique key
    return `_EMPTY_${accountId || Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Key: email + password + (serviceName OR link domain)
  // Prefer serviceName if available, otherwise use link domain
  // This allows merging when email+password+serviceName match even if links differ slightly
  const matchKey = !isEmpty(normalizedService) ? normalizedService : linkDomain;
  
  return `${normalizedEmail}|${normalizedPassword}|${matchKey}`;
}

/**
 * Gets password strength priority (lower number = worse/kept)
 */
function getPasswordStrengthPriority(strength: string | undefined): number {
  switch (strength) {
    case 'weak': return 1;
    case 'moderate': return 2;
    case 'strong': return 3;
    default: return 4;
  }
}

/**
 * Returns the worst password strength between two
 */
function getWorstPasswordStrength(
  strength1: string | undefined,
  strength2: string | undefined
): string | undefined {
  const priority1 = getPasswordStrengthPriority(strength1);
  const priority2 = getPasswordStrengthPriority(strength2);
  return priority1 <= priority2 ? strength1 : strength2;
}

/**
 * Gets recommendation priority (WEAK > MODERATE > STRONG)
 */
function getRecommendationPriority(recommendation: string | undefined): number {
  if (!recommendation) return 4;
  const rec = recommendation.toLowerCase();
  if (rec.includes('weak') || rec.includes('poor')) return 1;
  if (rec.includes('moderate')) return 2;
  if (rec.includes('strong') || rec.includes('good')) return 3;
  return 4;
}

/**
 * Returns the worst recommendation between two
 */
function getWorstRecommendation(
  rec1: string | undefined,
  rec2: string | undefined
): string | undefined {
  const priority1 = getRecommendationPriority(rec1);
  const priority2 = getRecommendationPriority(rec2);
  return priority1 <= priority2 ? rec1 : rec2;
}

/**
 * Merges two accounts with comma-separated link strings
 */
function mergeAccountsWithLinks(
  existing: DeduplicatedAccount,
  incoming: DiscoveredAccount | DeduplicatedAccount
): DeduplicatedAccount {
  // Merge sources - keep ALL sources from both accounts
  const mergedSources = [...existing.allSources];
  
  // Add sources from incoming account
  if ('allSources' in incoming && incoming.allSources) {
    for (const source of incoming.allSources) {
      if (!mergedSources.includes(source)) {
        mergedSources.push(source);
      }
    }
  }
  
  // Also add the direct source if not already in allSources
  const incomingSource = incoming.source;
  if (!mergedSources.includes(incomingSource)) {
    mergedSources.push(incomingSource);
  }
  
  // Update discovery dates
  const incomingDate = new Date(incoming.discoveredAt);
  const firstDiscoveredAt = incomingDate < existing.firstDiscoveredAt 
    ? incomingDate 
    : existing.firstDiscoveredAt;
  const lastDiscoveredAt = incomingDate > existing.lastDiscoveredAt 
    ? incomingDate 
    : existing.lastDiscoveredAt;
  
  // Merge metadata with comma-separated link strings
  // CRITICAL: Start with existing metadata to preserve all existing fields
  const mergedMetadata: Record<string, any> = {
    ...(existing.metadata || {}),
  };
  
  if (incoming.metadata) {
    // Combine serviceLink as comma-separated string
    const combinedServiceLink = combineLinkStrings(existing.metadata?.link, incoming.metadata?.link);
    if (combinedServiceLink) {
      mergedMetadata.link = combinedServiceLink;
    }
    
    // Combine changePasswordLink
    const existingChangePassword = existing.metadata?.['change-password'] || existing.metadata?.['changePassword'];
    const incomingChangePassword = incoming.metadata['change-password'] || incoming.metadata['changePassword'];
    const combinedChangePassword = combineLinkStrings(existingChangePassword, incomingChangePassword);
    if (combinedChangePassword) {
      mergedMetadata['change-password'] = combinedChangePassword;
    }
    
    // Combine deleteAccountLink
    const existingDeleteAccount = existing.metadata?.['delete-account'] || existing.metadata?.['deleteAccount'];
    const incomingDeleteAccount = incoming.metadata['delete-account'] || incoming.metadata['deleteAccount'];
    const combinedDeleteAccount = combineLinkStrings(existingDeleteAccount, incomingDeleteAccount);
    if (combinedDeleteAccount) {
      mergedMetadata['delete-account'] = combinedDeleteAccount;
    }
    
    // Combine securitySettingsLink
    const existingSecuritySettings = existing.metadata?.['security-settings'] || existing.metadata?.['securitySettings'];
    const incomingSecuritySettings = incoming.metadata['security-settings'] || incoming.metadata['securitySettings'];
    const combinedSecuritySettings = combineLinkStrings(existingSecuritySettings, incomingSecuritySettings);
    if (combinedSecuritySettings) {
      mergedMetadata['security-settings'] = combinedSecuritySettings;
    }
    
    // CRITICAL: Preserve username/password from existing first, then use incoming if existing is empty
    // This prevents overwriting valid data with empty values or wrong field mappings
    // Only update if the field doesn't exist or is empty in mergedMetadata
    if (!('username' in mergedMetadata) || isEmpty(mergedMetadata.username)) {
      if (existing.metadata && !isEmpty(existing.metadata.username)) {
        mergedMetadata.username = existing.metadata.username;
      } else if (!isEmpty(incoming.metadata.username)) {
        mergedMetadata.username = incoming.metadata.username;
      }
    }
    
    if (!('password' in mergedMetadata) || isEmpty(mergedMetadata.password)) {
      if (existing.metadata && !isEmpty(existing.metadata.password)) {
        mergedMetadata.password = existing.metadata.password;
      } else if (!isEmpty(incoming.metadata.password)) {
        mergedMetadata.password = incoming.metadata.password;
      }
    }
    
    // Keep worst password strength
    const existingStrength = existing.metadata?.passwordStrength;
    const incomingStrength = incoming.metadata?.passwordStrength;
    mergedMetadata.passwordStrength = getWorstPasswordStrength(existingStrength, incomingStrength);
    
    // Keep worst recommendation
    const existingRecommendation = existing.metadata?.passwordRecommendation;
    const incomingRecommendation = incoming.metadata?.passwordRecommendation;
    mergedMetadata.passwordRecommendation = getWorstRecommendation(
      existingRecommendation, 
      incomingRecommendation
    );
    
    // Preserve platform (should be same in mergeable rows)
    const existingPlatform = existing.metadata?.platform || 'Unknown';
    const incomingPlatform = incoming.metadata?.platform || 'Unknown';
    mergedMetadata.platform = existingPlatform || incomingPlatform || 'Unknown';
    
    // Merge other metadata (excluding already processed fields)
    // CRITICAL: Only merge fields that don't already exist in mergedMetadata to prevent overwriting
    for (const key in incoming.metadata) {
      if (key !== 'link' && 
          key !== 'change-password' && key !== 'changePassword' &&
          key !== 'delete-account' && key !== 'deleteAccount' &&
          key !== 'security-settings' && key !== 'securitySettings' &&
          key !== 'username' && key !== 'password' &&
          key !== 'passwordStrength' && key !== 'passwordRecommendation' &&
          key !== 'platform') {
        const incomingValue = incoming.metadata[key];
        // Only set if mergedMetadata doesn't already have this key, or if existing value is empty and incoming has value
        if (!(key in mergedMetadata) || isEmpty(mergedMetadata[key])) {
          if (!isEmpty(incomingValue)) {
            mergedMetadata[key] = incomingValue;
          } else if (existing.metadata && !isEmpty(existing.metadata[key])) {
            mergedMetadata[key] = existing.metadata[key];
          }
        }
      }
    }
  }
  
  // Recompute source from combined links
  const combinedLink = mergedMetadata.link || '';
  const recomputedSource = extractSourceFromLink(combinedLink);
  
  // Preserve service and accountEmail (should be identical in mergeable rows)
  const mergedService = (!isEmpty(incoming.service) ? incoming.service : existing.service) || '';
  const mergedAccountEmail = (!isEmpty(incoming.accountEmail) ? incoming.accountEmail : existing.accountEmail) || '';
  
  return {
    ...existing,
    service: mergedService,
    accountEmail: mergedAccountEmail,
    source: recomputedSource as DataSource, // Recompute from link
    metadata: mergedMetadata,
    allSources: mergedSources,
    firstDiscoveredAt,
    lastDiscoveredAt,
    id: existing.id,
  };
}

/**
 * CONSOLIDATION LOGIC
 * 
 * Merge rows with:
 * - SAME providerEmail (case-insensitive)
 * - SAME password (case-sensitive)
 * - AND (platform/source match OR serviceLink match)
 * 
 * Links stored as comma-separated strings
 */
export function consolidateAccounts(
  accounts: DiscoveredAccount[]
): ConsolidationResult {
  let mergedCount = 0;
  let removedCount = 0;
  
  // STEP 1: Group by merge key (providerEmail + password + (serviceName OR serviceLink))
  // We need to try multiple merge strategies to handle the "OR" logic
  // Use multiple passes to ensure all accounts are checked against the full merged list
  const mergeMap = new Map<string, DeduplicatedAccount>();
  const blankRowsByService = new Map<string, DeduplicatedAccount[]>(); // For blank login merging
  
  try {
    // First pass: Process all accounts and build initial merge map
    for (const account of accounts) {
      if (!account || !account.id) {
        console.warn('Skipping invalid account:', account);
        continue;
      }

      const providerEmail = account.accountEmail || '';
      const password = account.metadata?.password || '';
      const serviceName = account.service || '';
      
      // Get serviceLink (handle arrays and comma-separated strings)
      let serviceLink = '';
      const linkValue = account.metadata?.link;
      if (linkValue) {
        if (Array.isArray(linkValue)) {
          serviceLink = linkValue[0] || '';
        } else if (typeof linkValue === 'string') {
          // If comma-separated, use first link for matching
          serviceLink = linkValue.split(',')[0].trim();
        }
      }
      
      const hasEmptyCredentials = isEmpty(providerEmail) || isEmpty(password);
      
      // Handle blank login rows separately - they merge into filled rows for same serviceName
      if (hasEmptyCredentials && !isEmpty(serviceName)) {
        const serviceKey = normalizeEmpty(serviceName).toLowerCase();
        if (!blankRowsByService.has(serviceKey)) {
          blankRowsByService.set(serviceKey, []);
        }
        const dedupedAccount: DeduplicatedAccount = {
        ...account,
          metadata: account.metadata ? { ...account.metadata } : undefined,
        allSources: [account.source],
        firstDiscoveredAt: new Date(account.discoveredAt),
        lastDiscoveredAt: new Date(account.discoveredAt),
      };
        blankRowsByService.get(serviceKey)!.push(dedupedAccount);
        continue;
      }
      
      // Skip completely empty rows
      if (hasEmptyCredentials) {
        continue;
      }
      
      // Try to find existing account to merge with using smart matching
      // This checks ALL accounts in the map, not just exact key matches
      let existing: DeduplicatedAccount | undefined = undefined;
      let existingKey: string | null = null;
      let mergeKeyToUse: string = '';
      
      const normalizedEmail = normalizeEmpty(providerEmail).toLowerCase();
      const normalizedPassword = normalizeEmpty(password); // Case-sensitive
      const normalizedService = normalizeEmpty(serviceName).toLowerCase();
      
      // PRIORITY 1: Check by exact serviceName match (fast path)
      // Also check ALL entries for exact service name match (in case stored under different key)
      if (!isEmpty(normalizedService)) {
        const serviceBasedKey = `${normalizedEmail}|${normalizedPassword}|${normalizedService}`;
        existing = mergeMap.get(serviceBasedKey);
        if (existing) {
          existingKey = serviceBasedKey;
          mergeKeyToUse = serviceBasedKey;
    } else {
          // Check all entries for exact service name match (handles cases where key was different)
          // Also check if domains match (normalized) even if service names differ slightly
          for (const [key, acc] of mergeMap.entries()) {
            const accEmail = normalizeEmpty(acc.accountEmail || '').toLowerCase();
            const accPassword = normalizeEmpty(acc.metadata?.password || '');
            const accService = normalizeEmpty(acc.service || '').toLowerCase();
            
            // Exact match: same email, password, and service name
            if (accEmail === normalizedEmail && accPassword === normalizedPassword && accService === normalizedService) {
              existing = acc;
              existingKey = key;
              mergeKeyToUse = serviceBasedKey; // Use consistent key
              break;
            }
            
            // Also check if service names match (case-insensitive) OR if link matches ANY link in the account's link list
            if (accEmail === normalizedEmail && accPassword === normalizedPassword) {
              const shouldMerge = 
                (accService === normalizedService || areServicesSimilar(serviceName, acc.service)) ||
                (!isEmpty(serviceLink) && linkMatchesAnyInList(serviceLink, acc.metadata?.link));
              
              if (shouldMerge) {
                existing = acc;
                existingKey = key;
                mergeKeyToUse = serviceBasedKey; // Use service-based key for consistency
                break;
              }
            }
          }
        }
      }
      
      // PRIORITY 2: Smart matching - check ALL accounts for similar services/domains
      // This handles cases like "abercrombie.com" vs "www.abercrombie.com" or "Bold" with "bold.com" vs "bold.org"
      if (!existing) {
        for (const [key, acc] of mergeMap.entries()) {
          const accEmail = normalizeEmpty(acc.accountEmail || '').toLowerCase();
          const accPassword = normalizeEmpty(acc.metadata?.password || '');
          
          // Must have matching email and password
          if (accEmail !== normalizedEmail || accPassword !== normalizedPassword) {
            continue;
          }
          
          const accService = normalizeEmpty(acc.service || '').toLowerCase();
          const accLink = acc.metadata?.link;
          let accLinkStr = '';
          if (accLink) {
            if (Array.isArray(accLink)) {
              accLinkStr = accLink[0] || '';
            } else if (typeof accLink === 'string') {
              accLinkStr = accLink.split(',')[0].trim();
            }
          }
          
          // Check if services are similar (fuzzy match)
          let shouldMerge = false;
          
          // Normalize links BEFORE extracting domains (removes www, trailing slashes, etc.)
          const normalizedLink1 = normalizeLinkForMatching(serviceLink);
          const normalizedLink2 = normalizeLinkForMatching(accLinkStr);
          const domain1 = extractDomainFromLink(normalizedLink1);
          const domain2 = extractDomainFromLink(normalizedLink2);
          
          // EXACT service name match (case-insensitive) - highest priority
          // If service names match exactly, merge regardless of link differences (links will be concatenated)
          if (!isEmpty(normalizedService) && !isEmpty(accService)) {
            if (normalizedService === accService) {
              shouldMerge = true;
            } else if (areServicesSimilar(serviceName, acc.service)) {
              // Smart service name matching (handles "Disneyplus" vs "Disney Plus", typos, etc.)
              shouldMerge = true;
            }
          }
          
          // Check if link matches ANY link in the account's link list (handles comma-separated links)
          // This is important: if merged account has "link1.com, link2.com" and new account has "link1.com", they should merge
          if (!shouldMerge && !isEmpty(serviceLink)) {
            if (linkMatchesAnyInList(serviceLink, acc.metadata?.link)) {
              shouldMerge = true;
            }
          }
          
          // Check if domains are related (handles .com vs .org, subdomains, etc.)
          // Only check if service name didn't match (to avoid redundant checks)
          if (!shouldMerge && !isEmpty(domain1) && !isEmpty(domain2)) {
            // Exact normalized domain match (handles www.abercrombie.com vs abercrombie.com)
            if (domain1 === domain2) {
              shouldMerge = true;
            } else if (areDomainsRelated(serviceLink, accLinkStr)) {
              shouldMerge = true;
            }
          }
          
          // If serviceName matches exactly and link domain matches (or one is empty), merge
          if (!shouldMerge && !isEmpty(normalizedService) && !isEmpty(accService)) {
            // If services match exactly and link domains match (normalized) or one is empty, merge
            if (normalizedService === accService && (domain1 === domain2 || isEmpty(domain1) || isEmpty(domain2))) {
              shouldMerge = true;
            }
          }
          
          // FINAL CHECK: If everything matches exactly (exact duplicate), always merge
          if (!shouldMerge) {
            // Check for exact duplicate: same email, password, service, and normalized domain
            if (normalizedService === accService && domain1 === domain2 && !isEmpty(domain1)) {
              shouldMerge = true;
            }
          }
          
          if (shouldMerge) {
            existing = acc;
            existingKey = key;
            // Use service-based key if available for consistency
            if (!isEmpty(normalizedService)) {
              mergeKeyToUse = `${normalizedEmail}|${normalizedPassword}|${normalizedService}`;
            } else if (!isEmpty(serviceLink)) {
              const linkDomain = extractDomainFromLink(serviceLink);
              if (!isEmpty(linkDomain)) {
                mergeKeyToUse = `${normalizedEmail}|${normalizedPassword}|${linkDomain}`;
              } else {
                mergeKeyToUse = key; // Keep existing key
              }
            } else {
              mergeKeyToUse = key; // Keep existing key
            }
            break;
          }
        }
      }
      
      // PRIORITY 3: Check by link domain (if serviceName matching didn't work)
      if (!existing && !isEmpty(serviceLink)) {
        const linkDomain = extractDomainFromLink(serviceLink);
        if (!isEmpty(linkDomain)) {
          const linkBasedKey = `${normalizedEmail}|${normalizedPassword}|${linkDomain}`;
          existing = mergeMap.get(linkBasedKey);
          if (existing) {
            existingKey = linkBasedKey;
            mergeKeyToUse = linkBasedKey;
          }
        }
      }
      
      // If still not found, create new entry
      if (!mergeKeyToUse) {
        // Use service-based key if serviceName exists, otherwise use primary key
        if (!isEmpty(normalizedService)) {
          mergeKeyToUse = `${normalizedEmail}|${normalizedPassword}|${normalizedService}`;
        } else if (!isEmpty(serviceLink)) {
          const linkDomain = extractDomainFromLink(serviceLink);
          if (!isEmpty(linkDomain)) {
            mergeKeyToUse = `${normalizedEmail}|${normalizedPassword}|${linkDomain}`;
          } else {
            mergeKeyToUse = createMergeKey(providerEmail, password, serviceName, serviceLink, account.id);
          }
        } else {
          mergeKeyToUse = createMergeKey(providerEmail, password, serviceName, serviceLink, account.id);
        }
      }
      
      if (!existing) {
        // First time seeing this account - recompute source from link
        const recomputedSource = extractSourceFromLink(serviceLink || linkValue);
        const dedupedAccount: DeduplicatedAccount = {
          ...account,
          source: recomputedSource as DataSource,
          metadata: account.metadata ? { ...account.metadata } : undefined,
          allSources: [account.source],
          firstDiscoveredAt: new Date(account.discoveredAt),
          lastDiscoveredAt: new Date(account.discoveredAt),
        };
        mergeMap.set(mergeKeyToUse, dedupedAccount);
      } else {
        // Duplicate found - merge with comma-separated link strings
        mergedCount++;
        const merged = mergeAccountsWithLinks(existing, account);
        
        // Remove old entry if key changed
        if (existingKey && existingKey !== mergeKeyToUse) {
          mergeMap.delete(existingKey);
        }
        
        mergeMap.set(mergeKeyToUse, merged);
      }
    }
    
    // STEP 1a: Second pass - re-check all accounts against the FULL merged map
    // This ensures that accounts processed later can still find and merge with earlier accounts
    // that were merged together, even if keys changed
    const currentMergedList = Array.from(mergeMap.values());
    const processedIds = new Set(currentMergedList.map(acc => acc.id));
    
    // Re-check original accounts that weren't merged in first pass
    for (const account of accounts) {
      if (!account || !account.id) continue;
      if (processedIds.has(account.id)) continue; // Already processed
      
      const providerEmail = account.accountEmail || '';
      const password = account.metadata?.password || '';
      const serviceName = account.service || '';
      
      let serviceLink = '';
      const linkValue = account.metadata?.link;
      if (linkValue) {
        if (Array.isArray(linkValue)) {
          serviceLink = linkValue[0] || '';
        } else if (typeof linkValue === 'string') {
          serviceLink = linkValue.split(',')[0].trim();
        }
      }
      
      const hasEmptyCredentials = isEmpty(providerEmail) || isEmpty(password);
      if (hasEmptyCredentials) continue;
      
      const normalizedEmail = normalizeEmpty(providerEmail).toLowerCase();
      const normalizedPassword = normalizeEmpty(password);
      const normalizedService = normalizeEmpty(serviceName).toLowerCase();
      
      // Check against ALL merged accounts
      for (const mergedAcc of currentMergedList) {
        const mergedEmail = normalizeEmpty(mergedAcc.accountEmail || '').toLowerCase();
        const mergedPassword = normalizeEmpty(mergedAcc.metadata?.password || '');
        
        if (mergedEmail !== normalizedEmail || mergedPassword !== normalizedPassword) {
          continue;
        }
        
        const mergedService = normalizeEmpty(mergedAcc.service || '').toLowerCase();
        const mergedLink = mergedAcc.metadata?.link;
        let mergedLinkStr = '';
        if (mergedLink) {
          if (Array.isArray(mergedLink)) {
            mergedLinkStr = mergedLink[0] || '';
          } else if (typeof mergedLink === 'string') {
            mergedLinkStr = mergedLink.split(',')[0].trim();
          }
        }
        
        let shouldMerge = false;
        
        // Exact service name match
        if (!isEmpty(normalizedService) && !isEmpty(mergedService)) {
          if (normalizedService === mergedService) {
            shouldMerge = true;
          } else if (areServicesSimilar(serviceName, mergedAcc.service)) {
            shouldMerge = true;
          }
        }
        
        // Check if link matches ANY link in the merged account's link list (handles comma-separated links)
        // This is important: if merged account has "link1.com, link2.com" and new account has "link1.com", they should merge
        if (!shouldMerge && !isEmpty(serviceLink)) {
          if (linkMatchesAnyInList(serviceLink, mergedAcc.metadata?.link)) {
            shouldMerge = true;
          }
        }
        
        // Normalize links before domain matching
        const normalizedLink1 = normalizeLinkForMatching(serviceLink);
        const normalizedLink2 = normalizeLinkForMatching(mergedLinkStr);
        const domain1 = extractDomainFromLink(normalizedLink1);
        const domain2 = extractDomainFromLink(normalizedLink2);
        
        // Domain matching (normalized) - handles www.abercrombie.com vs abercrombie.com
        if (!shouldMerge && !isEmpty(domain1) && !isEmpty(domain2)) {
          if (domain1 === domain2 || areDomainsRelated(serviceLink, mergedLinkStr)) {
            shouldMerge = true;
          }
        }
        
        // FINAL CHECK: If service name matches exactly and domains match (normalized), merge
        if (!shouldMerge && !isEmpty(normalizedService) && !isEmpty(mergedService)) {
          if (normalizedService === mergedService && domain1 === domain2 && !isEmpty(domain1)) {
            shouldMerge = true;
          }
        }
        
        if (shouldMerge) {
          // Find the key for this merged account and update it
          let mergeKey = '';
          for (const [key, acc] of mergeMap.entries()) {
            if (acc.id === mergedAcc.id) {
              mergeKey = key;
              break;
            }
          }
          
          if (mergeKey) {
            mergedCount++;
            const merged = mergeAccountsWithLinks(mergedAcc, account);
            mergeMap.set(mergeKey, merged);
            processedIds.add(account.id);
            break;
          }
        }
      }
      
      // If still not merged, add as new entry
      if (!processedIds.has(account.id)) {
        const recomputedSource = extractSourceFromLink(serviceLink || linkValue);
        let newMergeKey = '';
        if (!isEmpty(normalizedService)) {
          newMergeKey = `${normalizedEmail}|${normalizedPassword}|${normalizedService}`;
        } else if (!isEmpty(serviceLink)) {
          const linkDomain = extractDomainFromLink(serviceLink);
          if (!isEmpty(linkDomain)) {
            newMergeKey = `${normalizedEmail}|${normalizedPassword}|${linkDomain}`;
          }
        }
        
        if (newMergeKey && !mergeMap.has(newMergeKey)) {
          const dedupedAccount: DeduplicatedAccount = {
            ...account,
            source: recomputedSource as DataSource,
            metadata: account.metadata ? { ...account.metadata } : undefined,
            allSources: [account.source],
            firstDiscoveredAt: new Date(account.discoveredAt),
            lastDiscoveredAt: new Date(account.discoveredAt),
          };
          mergeMap.set(newMergeKey, dedupedAccount);
          processedIds.add(account.id);
        }
      }
    }
    
    // STEP 1b: Merge blank login rows into filled rows for same serviceName
    for (const [serviceKey, blankRows] of blankRowsByService.entries()) {
      // Find filled rows with same serviceName
      let mergedIntoAccount: DeduplicatedAccount | null = null;
      let mergedIntoKey: string | null = null;
      
      for (const [mergeKey, filledAccount] of mergeMap.entries()) {
        const filledServiceName = normalizeEmpty(filledAccount.service).toLowerCase();
        if (filledServiceName === serviceKey) {
          mergedIntoAccount = filledAccount;
          mergedIntoKey = mergeKey;
          break; // Use first matching filled row
        }
      }
      
      if (mergedIntoAccount && mergedIntoKey) {
        // Merge all blank rows into this filled row
        let currentMerged = mergedIntoAccount;
        for (const blankRow of blankRows) {
          mergedCount++;
          currentMerged = mergeAccountsWithLinks(currentMerged, blankRow);
        }
        mergeMap.set(mergedIntoKey, currentMerged);
        // Mark blank rows as processed (they'll be removed)
        removedCount += blankRows.length;
      } else {
        // No filled row found - keep first blank row, remove others
        if (blankRows.length > 1) {
          mergeMap.set(`_BLANK_${serviceKey}`, blankRows[0]);
          removedCount += blankRows.length - 1;
        } else if (blankRows.length === 1) {
          mergeMap.set(`_BLANK_${serviceKey}`, blankRows[0]);
        }
      }
    }
  } catch (error) {
    console.error('Error during consolidation:', error);
    // Return original accounts if consolidation fails
    return {
      accounts: accounts.map(acc => ({
        ...acc,
        allSources: [acc.source],
        firstDiscoveredAt: new Date(acc.discoveredAt),
        lastDiscoveredAt: new Date(acc.discoveredAt),
      })),
      mergedCount: 0,
      removedCount: 0,
    };
  }
  
  const mergedAccounts = Array.from(mergeMap.values());
  
  // STEP 2: Remove exact duplicates and rows where ALL critical fields are empty
  // Use a Map to track unique accounts by merge key to prevent duplicates
  const finalAccountsMap = new Map<string, DeduplicatedAccount>();
  
  for (const account of mergedAccounts) {
    const providerEmail = normalizeEmpty(account.accountEmail);
    const serviceName = normalizeEmpty(account.service);
    const password = normalizeEmpty(account.metadata?.password || '');
    
    // Get first link from comma-separated string or array
    let serviceLink = '';
    const linkValue = account.metadata?.link;
    if (linkValue) {
      if (Array.isArray(linkValue)) {
        serviceLink = linkValue[0] || '';
      } else if (typeof linkValue === 'string') {
        serviceLink = linkValue.split(',')[0].trim();
      }
    }
    serviceLink = normalizeEmpty(serviceLink);
    
    // Remove if ALL critical fields are empty
    if (isEmpty(providerEmail) && isEmpty(serviceName) && isEmpty(serviceLink)) {
      removedCount++;
      continue; // DELETE this row
    }
    
    // Create merge key: email + password + (serviceName OR normalized domain)
    const normalizedLink = normalizeLinkForMatching(serviceLink);
    const domain = extractDomainFromLink(normalizedLink);
    const mergeKey = !isEmpty(serviceName) 
      ? `${providerEmail.toLowerCase()}|${password}|${serviceName.toLowerCase()}`
      : `${providerEmail.toLowerCase()}|${password}|${domain}`;
    
    // Check if we already have an account with this merge key
    const existing = finalAccountsMap.get(mergeKey);
    if (existing) {
      // Found duplicate - merge it
      mergedCount++;
      const merged = mergeAccountsWithLinks(existing, account);
      finalAccountsMap.set(mergeKey, merged);
    } else {
      // Also check all existing entries for potential merge (same email+password+service/domain)
      let foundMatch = false;
      for (const [key, acc] of finalAccountsMap.entries()) {
        const accEmail = normalizeEmpty(acc.accountEmail || '').toLowerCase();
        const accPassword = normalizeEmpty(acc.metadata?.password || '');
        const accService = normalizeEmpty(acc.service || '').toLowerCase();
        
        if (accEmail === providerEmail.toLowerCase() && accPassword === password) {
          // Same email and password - check if service or domain matches
          const accLink = acc.metadata?.link;
          let accLinkStr = '';
          if (accLink) {
            if (Array.isArray(accLink)) {
              accLinkStr = accLink[0] || '';
            } else if (typeof accLink === 'string') {
              accLinkStr = accLink.split(',')[0].trim();
            }
          }
          const accNormalizedLink = normalizeLinkForMatching(accLinkStr);
          const accDomain = extractDomainFromLink(accNormalizedLink);
          
          // If service names match OR domains match (normalized), merge
          if ((!isEmpty(serviceName) && !isEmpty(accService) && serviceName === accService) ||
              (!isEmpty(domain) && !isEmpty(accDomain) && domain === accDomain)) {
            mergedCount++;
            const merged = mergeAccountsWithLinks(acc, account);
            finalAccountsMap.set(key, merged);
            foundMatch = true;
            break;
          }
        }
      }
      
      if (!foundMatch) {
        // Not a duplicate, add to final list
        finalAccountsMap.set(mergeKey, account);
      }
    }
  }
  
  // Convert map to array
  const finalAccounts = Array.from(finalAccountsMap.values());
  
  // STEP 3: Final validation - ensure no duplicate (providerEmail + password + serviceName OR normalized domain) rows exist
  const validationMap = new Map<string, string[]>();
  for (const account of finalAccounts) {
    const providerEmail = normalizeEmpty(account.accountEmail).toLowerCase();
    const password = normalizeEmpty(account.metadata?.password || '');
    const serviceName = normalizeEmpty(account.service).toLowerCase();
    
    // Get first link and normalize
    let serviceLink = '';
    const linkValue = account.metadata?.link;
    if (linkValue) {
      if (Array.isArray(linkValue)) {
        serviceLink = linkValue[0] || '';
      } else if (typeof linkValue === 'string') {
        serviceLink = linkValue.split(',')[0].trim();
      }
    }
    const normalizedLink = normalizeLinkForMatching(serviceLink);
    const domain = extractDomainFromLink(normalizedLink);
    
    // Only validate non-empty rows
    if (!isEmpty(providerEmail) && !isEmpty(password)) {
      // Use serviceName if available, otherwise use normalized domain
      const matchKey = !isEmpty(serviceName) ? serviceName : domain;
      const validationKey = `${providerEmail}|${password}|${matchKey}`;
      if (!validationMap.has(validationKey)) {
        validationMap.set(validationKey, []);
      }
      validationMap.get(validationKey)!.push(account.id);
    }
  }
  
  // Check for remaining duplicates (should not happen after merge)
  const duplicates: string[] = [];
  for (const [key, accountIds] of validationMap.entries()) {
    if (accountIds.length > 1) {
      duplicates.push(`Duplicate key: ${key} (${accountIds.length} accounts)`);
    }
  }
  
  // STEP 4: Final pass - ensure no duplicates remain and merge any that do
  // This ensures accounts that should have merged are actually merged
  const finalMergeMap = new Map<string, DeduplicatedAccount>();
  const processedFinalIds = new Set<string>();
  
  for (const account of finalAccounts) {
    if (processedFinalIds.has(account.id)) continue;
    
    const providerEmail = normalizeEmpty(account.accountEmail).toLowerCase();
    const password = normalizeEmpty(account.metadata?.password || '');
    const serviceName = normalizeEmpty(account.service).toLowerCase();
    
    // Get normalized domain
    let serviceLink = '';
    const linkValue = account.metadata?.link;
    if (linkValue) {
      if (Array.isArray(linkValue)) {
        serviceLink = linkValue[0] || '';
      } else if (typeof linkValue === 'string') {
        serviceLink = linkValue.split(',')[0].trim();
      }
    }
    const normalizedLink = normalizeLinkForMatching(serviceLink);
    const domain = extractDomainFromLink(normalizedLink);
    
    // Create merge key: email + password + (serviceName OR domain)
    const mergeKey = !isEmpty(serviceName) 
      ? `${providerEmail}|${password}|${serviceName}`
      : `${providerEmail}|${password}|${domain}`;
    
    const existing = finalMergeMap.get(mergeKey);
    if (existing) {
      // Found duplicate - merge it
      mergedCount++;
      const merged = mergeAccountsWithLinks(existing, account);
      finalMergeMap.set(mergeKey, merged);
      processedFinalIds.add(account.id);
    } else {
      // Check all existing entries for potential merge (same email+password+service)
      let foundMatch = false;
      for (const [key, acc] of finalMergeMap.entries()) {
        const accEmail = normalizeEmpty(acc.accountEmail || '').toLowerCase();
        const accPassword = normalizeEmpty(acc.metadata?.password || '');
        const accService = normalizeEmpty(acc.service || '').toLowerCase();
        
        if (accEmail === providerEmail && accPassword === password) {
          // Same email and password - check if service or domain matches
          const accLink = acc.metadata?.link;
          let accLinkStr = '';
          if (accLink) {
            if (Array.isArray(accLink)) {
              accLinkStr = accLink[0] || '';
            } else if (typeof accLink === 'string') {
              accLinkStr = accLink.split(',')[0].trim();
            }
          }
          const accNormalizedLink = normalizeLinkForMatching(accLinkStr);
          const accDomain = extractDomainFromLink(accNormalizedLink);
          
          // If service names match OR domains match (normalized), merge
          if ((!isEmpty(serviceName) && !isEmpty(accService) && serviceName === accService) ||
              (!isEmpty(domain) && !isEmpty(accDomain) && domain === accDomain)) {
            mergedCount++;
            const merged = mergeAccountsWithLinks(acc, account);
            finalMergeMap.set(key, merged);
            processedFinalIds.add(account.id);
            foundMatch = true;
            break;
          }
        }
      }
      
      if (!foundMatch) {
        finalMergeMap.set(mergeKey, account);
        processedFinalIds.add(account.id);
      }
    }
  }
  
  // Return the final merged accounts (no duplicates)
  return {
    accounts: Array.from(finalMergeMap.values()),
    mergedCount,
    removedCount,
  };
}

/**
 * Legacy deduplication function (maintained for backward compatibility)
 */
export function deduplicateAccounts(accounts: DiscoveredAccount[]): DeduplicatedAccount[] {
  const result = consolidateAccounts(accounts);
  return result.accounts;
}
