/**
 * Master List Context - Stores all discovered accounts in session memory.
 * This context is shared across all pages and persists during navigation.
 * All data is cleared when the app closes.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { DiscoveredAccount, DataSource } from '@shared/types';
import { DeduplicatedAccount, deduplicateAccounts, consolidateAccounts, ConsolidationResult } from '@shared/deduplication';
import { analyzeAccountPasswords } from '@shared/passwordAnalyzer';
import { normalizeAccounts, NormalizedAccount } from '@shared/dataNormalization';

interface MasterListContextType {
  accounts: DeduplicatedAccount[];
  commonPasswordPhrases: string;
  setCommonPasswordPhrases: (phrases: string) => void;
  addAccounts: (newAccounts: DiscoveredAccount[]) => void;
  removeAccounts: (accountIds: string[]) => void;
  updateAccountLinks: (accountId: string, links: Record<string, string>) => void;
  clearAccounts: () => void;
  cleanDuplicates: () => Promise<void>;
  consolidateData: () => ConsolidationResult;
}

const MasterListContext = createContext<MasterListContextType | undefined>(undefined);

export function MasterListProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<DeduplicatedAccount[]>([]);
  const [commonPasswordPhrases, setCommonPasswordPhrases] = useState<string>('');

  /**
   * Re-analyze all accounts when names change
   * This ensures password strength is updated if names are entered after accounts are imported
   */
  React.useEffect(() => {
    if (accounts.length > 0) {
      // Re-analyze passwords with updated name information
      const accountsWithPasswords = accounts.map(acc => ({
        id: acc.id,
        password: acc.metadata?.password || '',
        providerEmail: acc.accountEmail,
      }));

              const passwordAnalyses = analyzeAccountPasswords(accountsWithPasswords, commonPasswordPhrases);

      // Update accounts with new password analysis
      const updatedAccounts = accounts.map(acc => {
        const analysis = passwordAnalyses.get(acc.id);
        if (analysis) {
          return {
            ...acc,
            metadata: {
              ...acc.metadata,
              passwordStrength: analysis.strength || undefined,
              passwordScore: analysis.score.toString(),
              passwordReused: analysis.isReused ? 'yes' : 'no',
              passwordRecommendation: analysis.recommendation || '',
              strengthOverrideReason: analysis.strengthOverrideReason || null,
            },
          };
        }
        return acc;
      });

      setAccounts(updatedAccounts);
    }
          }, [commonPasswordPhrases]); // Re-run when phrases change

  /**
   * Add new accounts to the master list and deduplicate
   * Automatically analyzes passwords for strength and reuse
   * PRIVACY: Analysis happens locally in memory, no data stored
   */
  const addAccounts = (newAccounts: DiscoveredAccount[]) => {
    if (newAccounts.length === 0) return;

    try {
      // Convert existing DeduplicatedAccount to DiscoveredAccount for deduplication
      const existingAccounts: DiscoveredAccount[] = accounts.map(a => ({
        id: a.id,
        service: a.service,
        accountEmail: a.accountEmail,
        source: a.source,
        discoveredAt: a.discoveredAt,
        metadata: a.metadata,
      }));

      // STEP 1: NORMALIZE all accounts (MANDATORY - enforces strict rules)
    const normalizedNewAccounts = normalizeAccounts(newAccounts);
    const normalizedExistingAccounts = normalizeAccounts(
      accounts.map(a => ({
        id: a.id,
        service: a.service,
        accountEmail: a.accountEmail,
        source: a.source,
        discoveredAt: a.discoveredAt,
        metadata: a.metadata,
      }))
    );

    // Convert NormalizedAccount back to DiscoveredAccount for deduplication
    // CRITICAL: Preserve ALL metadata including username and password
    const completedNewAccounts: DiscoveredAccount[] = normalizedNewAccounts.map(acc => ({
      ...acc,
      accountEmail: acc.providerEmail, // Use normalized providerEmail
      service: acc.serviceName, // Use normalized serviceName
      metadata: {
        ...(acc.metadata || {}), // Preserve ALL existing metadata (including username/password)
        link: acc.serviceLink, // Store normalized link in metadata
        platform: acc.metadata?.platform || 'Unknown',
        normalizationApplied: acc.normalizationApplied.toString(),
        needsReview: acc.needsReview.toString(),
        inferredFields: acc.inferredFields?.join(',') || '',
        // Explicitly preserve username and password if they exist
        ...(acc.metadata?.username !== undefined && acc.metadata?.username !== null ? { username: acc.metadata.username } : {}),
        ...(acc.metadata?.password !== undefined && acc.metadata?.password !== null ? { password: acc.metadata.password } : {}),
      },
    }));

    const completedExistingAccounts: DiscoveredAccount[] = normalizedExistingAccounts.map(acc => ({
      ...acc,
      accountEmail: acc.providerEmail,
      service: acc.serviceName,
      metadata: {
        ...(acc.metadata || {}), // Preserve ALL existing metadata (including username/password)
        link: acc.serviceLink,
        platform: acc.metadata?.platform || 'Unknown',
        normalizationApplied: acc.normalizationApplied.toString(),
        needsReview: acc.needsReview.toString(),
        inferredFields: acc.inferredFields?.join(',') || '',
        // Explicitly preserve username and password if they exist
        ...(acc.metadata?.username !== undefined && acc.metadata?.username !== null ? { username: acc.metadata.username } : {}),
        ...(acc.metadata?.password !== undefined && acc.metadata?.password !== null ? { password: acc.metadata.password } : {}),
      },
    }));

    // STEP 2: Consolidate within new accounts first (remove duplicates within the import)
    const consolidationResultNew = consolidateAccounts(completedNewAccounts);
    
    // STEP 3: Combine and consolidate with existing accounts (merge with master list)
    // Convert DeduplicatedAccount back to DiscoveredAccount for consolidation
    const existingAsDiscovered: DiscoveredAccount[] = completedExistingAccounts.map(acc => ({
      id: acc.id,
      service: acc.service,
      accountEmail: acc.accountEmail,
      source: acc.source,
      discoveredAt: acc.discoveredAt,
      metadata: acc.metadata,
    }));
    
    const newAsDiscovered: DiscoveredAccount[] = consolidationResultNew.accounts.map(acc => ({
      id: acc.id,
      service: acc.service,
      accountEmail: acc.accountEmail,
      source: acc.source,
      discoveredAt: acc.discoveredAt,
      metadata: acc.metadata,
    }));
    
    const allAccounts = [...existingAsDiscovered, ...newAsDiscovered];
    const consolidationResult = consolidateAccounts(allAccounts);
    
    // Show feedback about consolidation
    if (consolidationResultNew.mergedCount > 0 || consolidationResultNew.removedCount > 0) {
      const messages: string[] = [];
      if (consolidationResultNew.mergedCount > 0) {
        messages.push(`${consolidationResultNew.mergedCount} duplicate ${consolidationResultNew.mergedCount === 1 ? 'entry' : 'entries'} merged`);
      }
      if (consolidationResultNew.removedCount > 0) {
        messages.push(`${consolidationResultNew.removedCount} empty ${consolidationResultNew.removedCount === 1 ? 'row' : 'rows'} removed`);
      }
      if (messages.length > 0) {
        console.log(`Import consolidation: ${messages.join(', ')}`);
        // Store message for UI display (could be shown in a toast/notification)
      }
    }
    
    const deduplicated = consolidationResult.accounts;

    // Analyze passwords for strength and reuse (local analysis only)
    // CRITICAL: After consolidation, each account ID represents a unique service
    // Password reuse is only detected if the same password is used by DIFFERENT account IDs (different services)
    // Use normalized providerEmail (stored in accountEmail after normalization)
    // Pass commonPasswordPhrases for password checking
    const accountsWithPasswords = deduplicated.map(acc => ({
      id: acc.id,
      password: acc.metadata?.password || '',
      providerEmail: acc.accountEmail, // accountEmail now contains normalized providerEmail
    }));

    // After consolidation, analyze passwords - reuse is only detected across different account IDs
    // If two accounts with same password were merged, they're now one account ID, so not reused
    const passwordAnalyses = analyzeAccountPasswords(accountsWithPasswords, commonPasswordPhrases);

    // Add password analysis to metadata
    const accountsWithAnalysis = deduplicated.map(acc => {
      const analysis = passwordAnalyses.get(acc.id);
      
      // Store normalized fields in metadata for UI access
      // accountEmail contains normalized providerEmail, service contains normalized serviceName
      // CRITICAL: Preserve username and password from original metadata
      const metadata = {
        ...(acc.metadata || {}), // Preserve ALL existing metadata first
        // Ensure serviceLink (link) is filled - use normalized link or infer
        link: acc.metadata?.link || (acc.service ? `https://${acc.service.toLowerCase().replace(/[^a-z0-9]/g, '')}.com` : ''),
        // Password analysis - only set if password exists (analysis not null)
        passwordStrength: analysis?.strength || undefined, // undefined if no password
        passwordScore: analysis ? analysis.score.toString() : undefined,
        passwordReused: analysis?.isReused ? 'yes' : 'no',
        passwordRecommendation: analysis?.recommendation || '',
        strengthOverrideReason: analysis?.strengthOverrideReason || null,
        // Explicitly ensure username and password are preserved
        ...(acc.metadata?.username !== undefined && acc.metadata?.username !== null ? { username: acc.metadata.username } : {}),
        ...(acc.metadata?.password !== undefined && acc.metadata?.password !== null ? { password: acc.metadata.password } : {}),
      };
      
      return {
        ...acc,
        metadata,
      };
    });

      setAccounts(accountsWithAnalysis);
    } catch (error) {
      console.error('Error adding accounts:', error);
      // Don't crash the app - log error but don't update state
      // In production, you might want to show a user-friendly error message
      throw error; // Re-throw so caller can handle it
    }
  };

  /**
   * Remove accounts by IDs from the master list
   */
  const removeAccounts = (accountIds: string[]) => {
    if (accountIds.length === 0) return;
    setAccounts(prevAccounts => 
      prevAccounts.filter(account => !accountIds.includes(account.id))
    );
  };

  /**
   * Update links for a specific account
   */
  const updateAccountLinks = (accountId: string, links: Record<string, string>) => {
    setAccounts(prevAccounts =>
      prevAccounts.map(account => {
        if (account.id === accountId) {
          // Merge links into metadata
          const updatedMetadata = {
            ...account.metadata,
            ...links,
          };
          return {
            ...account,
            metadata: updatedMetadata,
          };
        }
        return account;
      })
    );
  };

  /**
   * Clear all accounts from the master list
   */
  const clearAccounts = () => {
    setAccounts([]);
  };

  /**
   * Re-analyze all accounts when names change
   * This ensures password strength is updated if names are entered after accounts are imported
   */
  useEffect(() => {
    if (accounts.length > 0) {
      // Re-analyze passwords with updated name information
      const accountsWithPasswords = accounts.map(acc => ({
        id: acc.id,
        password: acc.metadata?.password || '',
        providerEmail: acc.accountEmail,
      }));

              const passwordAnalyses = analyzeAccountPasswords(accountsWithPasswords, commonPasswordPhrases);

      // Update accounts with new password analysis
      const updatedAccounts = accounts.map(acc => {
        const analysis = passwordAnalyses.get(acc.id);
        if (analysis) {
          return {
            ...acc,
            metadata: {
              ...acc.metadata,
              passwordStrength: analysis.strength || undefined,
              passwordScore: analysis.score.toString(),
              passwordReused: analysis.isReused ? 'yes' : 'no',
              passwordRecommendation: analysis.recommendation || '',
              strengthOverrideReason: analysis.strengthOverrideReason || null,
            },
          };
        }
        return acc;
      });

      // Only update if there are actual changes to avoid infinite loops
      const hasChanges = updatedAccounts.some((acc, idx) => {
        const oldAcc = accounts[idx];
        return acc.metadata?.passwordStrength !== oldAcc.metadata?.passwordStrength ||
               acc.metadata?.strengthOverrideReason !== oldAcc.metadata?.strengthOverrideReason;
      });

      if (hasChanges) {
        setAccounts(updatedAccounts);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
          }, [commonPasswordPhrases]); // Re-run when phrases change

  /**
   * Consolidate existing data - runs consolidation on all current accounts
   * Returns consolidation result with merge/remove counts
   */
  const consolidateData = (): ConsolidationResult => {
    if (accounts.length === 0) {
      return { accounts: [], mergedCount: 0, removedCount: 0 };
    }

    // Convert DeduplicatedAccount back to DiscoveredAccount for consolidation
    const accountsToConsolidate: DiscoveredAccount[] = accounts.map(a => ({
      id: a.id,
      service: a.service,
      accountEmail: a.accountEmail,
      source: a.source,
      discoveredAt: a.discoveredAt,
      metadata: a.metadata,
    }));

    // Run consolidation
    const result = consolidateAccounts(accountsToConsolidate);

    // Re-analyze passwords for consolidated accounts
    // CRITICAL: After consolidation, each account ID represents a unique service
    // Password reuse is only detected if the same password is used by DIFFERENT account IDs (different services)
    const accountsWithPasswords = result.accounts.map(acc => ({
      id: acc.id,
      password: acc.metadata?.password || '',
      providerEmail: acc.accountEmail,
    }));

    // After consolidation, analyze passwords - reuse is only detected across different account IDs
    // If two accounts with same password were merged, they're now one account ID, so not reused
    const passwordAnalyses = analyzeAccountPasswords(accountsWithPasswords, commonPasswordPhrases);

    // Add password analysis to consolidated accounts
    const accountsWithAnalysis = result.accounts.map(acc => {
      const analysis = passwordAnalyses.get(acc.id);
      
      const metadata = {
        ...(acc.metadata || {}),
        link: acc.metadata?.link || (acc.service ? `https://${acc.service.toLowerCase().replace(/[^a-z0-9]/g, '')}.com` : ''),
        passwordStrength: analysis?.strength || undefined,
        passwordScore: analysis ? analysis.score.toString() : undefined,
        passwordReused: analysis?.isReused ? 'yes' : 'no',
        passwordRecommendation: analysis?.recommendation || '',
        strengthOverrideReason: analysis?.strengthOverrideReason || null,
        ...(acc.metadata?.username !== undefined && acc.metadata?.username !== null ? { username: acc.metadata.username } : {}),
        ...(acc.metadata?.password !== undefined && acc.metadata?.password !== null ? { password: acc.metadata.password } : {}),
      };
      
      return {
        ...acc,
        metadata,
      };
    });

    // Update accounts with consolidated data
    setAccounts(accountsWithAnalysis);

    return result;
  };

  /**
   * Clean duplicates using Python script
   */
  const cleanDuplicates = async (): Promise<void> => {
    if (accounts.length === 0) return;

    try {
      // Call Python script via Electron IPC
      if (window.electronAPI && window.electronAPI.cleanDuplicates) {
        const convertedAccounts: DiscoveredAccount[] = accounts.map(a => ({
          id: a.id,
          service: a.service,
          accountEmail: a.accountEmail,
          source: a.source,
          discoveredAt: a.discoveredAt,
          metadata: a.metadata,
        }));

        const result = await window.electronAPI.cleanDuplicates(convertedAccounts);
        
        if (result.success && result.accounts) {
          // Convert dates back from ISO strings if needed
          const accountsWithDates = result.accounts.map((acc: any) => ({
            ...acc,
            discoveredAt: acc.discoveredAt instanceof Date ? acc.discoveredAt : new Date(acc.discoveredAt),
            firstDiscoveredAt: acc.firstDiscoveredAt instanceof Date ? acc.firstDiscoveredAt : new Date(acc.firstDiscoveredAt || acc.discoveredAt),
            lastDiscoveredAt: acc.lastDiscoveredAt instanceof Date ? acc.lastDiscoveredAt : new Date(acc.lastDiscoveredAt || acc.discoveredAt),
          }));
          
          // Python script returns cleaned accounts
          const cleaned = deduplicateAccounts(accountsWithDates);
          setAccounts(cleaned);
        } else {
          throw new Error(result.error || 'Failed to clean duplicates');
        }
      } else {
        // Fallback to JavaScript deduplication if Python not available
        const convertedAccounts: DiscoveredAccount[] = accounts.map(a => ({
          id: a.id,
          service: a.service,
          accountEmail: a.accountEmail,
          source: a.source,
          discoveredAt: a.discoveredAt,
          metadata: a.metadata,
        }));
        const cleaned = deduplicateAccounts(convertedAccounts);
        setAccounts(cleaned);
        console.warn('Python deduplication not available, using JavaScript fallback');
      }
    } catch (error) {
      console.error('Error cleaning duplicates:', error);
      throw error;
    }
  };

  return (
    <MasterListContext.Provider
      value={{
        accounts,
        commonPasswordPhrases,
        setCommonPasswordPhrases,
        addAccounts,
        removeAccounts,
        updateAccountLinks,
        clearAccounts,
        cleanDuplicates,
        consolidateData,
      }}
    >
      {children}
    </MasterListContext.Provider>
  );
}

export function useMasterList() {
  const context = useContext(MasterListContext);
  if (context === undefined) {
    throw new Error('useMasterList must be used within a MasterListProvider');
  }
  return context;
}
