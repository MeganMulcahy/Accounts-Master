/**
 * Deduplication logic for discovered accounts.
 * Ensures that the same service/account combination is only stored once,
 * while preserving information about all sources where it was found.
 */

import { DiscoveredAccount, DataSource } from './types';
import { createDeduplicationHash } from './security';

export interface DeduplicatedAccount extends DiscoveredAccount {
  /** All sources where this account was discovered */
  allSources: DataSource[];
  /** First discovery date */
  firstDiscoveredAt: Date;
  /** Most recent discovery date */
  lastDiscoveredAt: Date;
}

/**
 * Deduplicates accounts based on service name, account email, and source.
 * Combines information from multiple sources into a single entry.
 */
export function deduplicateAccounts(accounts: DiscoveredAccount[]): DeduplicatedAccount[] {
  const accountMap = new Map<string, DeduplicatedAccount>();
  
  for (const account of accounts) {
    // Create a base hash for deduplication (without source)
    const baseHash = createDeduplicationHash(
      account.service,
      account.accountEmail,
      ''
    );
    
    let dedupedAccount = accountMap.get(baseHash);
    
    if (!dedupedAccount) {
      // First time seeing this account - PRESERVE ALL METADATA including username/password
      dedupedAccount = {
        ...account,
        metadata: account.metadata ? { ...account.metadata } : undefined, // Deep copy metadata
        allSources: [account.source],
        firstDiscoveredAt: new Date(account.discoveredAt),
        lastDiscoveredAt: new Date(account.discoveredAt),
      };
      accountMap.set(baseHash, dedupedAccount);
    } else {
      // Account already exists - merge information
      // Add source if not already present
      if (!dedupedAccount.allSources.includes(account.source)) {
        dedupedAccount.allSources.push(account.source);
      }
      
      // Update discovery dates
      const accountDate = new Date(account.discoveredAt);
      if (accountDate < dedupedAccount.firstDiscoveredAt) {
        dedupedAccount.firstDiscoveredAt = accountDate;
      }
      if (accountDate > dedupedAccount.lastDiscoveredAt) {
        dedupedAccount.lastDiscoveredAt = accountDate;
      }
      
      // Update id to reflect latest source
      dedupedAccount.id = account.id;
      
      // CRITICAL: Merge metadata, preserving username/password from both accounts
      if (account.metadata) {
        // Initialize metadata if it doesn't exist
        if (!dedupedAccount.metadata) {
          dedupedAccount.metadata = {};
        }
        // Merge metadata - new account metadata takes precedence for username/password
        dedupedAccount.metadata = {
          ...dedupedAccount.metadata,
          ...account.metadata, // This will overwrite empty strings with actual values
        };
      }
    }
  }
  
  return Array.from(accountMap.values());
}

/**
 * Groups accounts by originating account email
 */
export function groupAccountsByEmail(
  accounts: DeduplicatedAccount[]
): Map<string, DeduplicatedAccount[]> {
  const grouped = new Map<string, DeduplicatedAccount[]>();
  
  for (const account of accounts) {
    const email = account.accountEmail;
    if (!grouped.has(email)) {
      grouped.set(email, []);
    }
    grouped.get(email)!.push(account);
  }
  
  return grouped;
}

/**
 * Groups accounts by data source
 */
export function groupAccountsBySource(
  accounts: DeduplicatedAccount[]
): Map<DataSource, DeduplicatedAccount[]> {
  const grouped = new Map<DataSource, DeduplicatedAccount[]>();
  
  for (const account of accounts) {
    for (const source of account.allSources) {
      if (!grouped.has(source)) {
        grouped.set(source, []);
      }
      grouped.get(source)!.push(account);
    }
  }
  
  return grouped;
}
