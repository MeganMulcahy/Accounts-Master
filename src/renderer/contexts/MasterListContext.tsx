/**
 * Master List Context - Stores all discovered accounts in session memory.
 * This context is shared across all pages and persists during navigation.
 * All data is cleared when the app closes.
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { DiscoveredAccount, DataSource } from '@shared/types';
import { DeduplicatedAccount, deduplicateAccounts } from '@shared/deduplication';

interface MasterListContextType {
  accounts: DeduplicatedAccount[];
  addAccounts: (newAccounts: DiscoveredAccount[]) => void;
  removeAccounts: (accountIds: string[]) => void;
  clearAccounts: () => void;
  cleanDuplicates: () => Promise<void>;
}

const MasterListContext = createContext<MasterListContextType | undefined>(undefined);

export function MasterListProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<DeduplicatedAccount[]>([]);

  /**
   * Add new accounts to the master list and deduplicate
   */
  const addAccounts = (newAccounts: DiscoveredAccount[]) => {
    if (newAccounts.length === 0) return;

    // Convert existing DeduplicatedAccount to DiscoveredAccount for deduplication
    const existingAccounts: DiscoveredAccount[] = accounts.map(a => ({
      id: a.id,
      service: a.service,
      accountEmail: a.accountEmail,
      source: a.source,
      discoveredAt: a.discoveredAt,
      metadata: a.metadata,
    }));

    // Combine and deduplicate
    const allAccounts = [...existingAccounts, ...newAccounts];
    const deduplicated = deduplicateAccounts(allAccounts);
    setAccounts(deduplicated);
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
   * Clear all accounts from the master list
   */
  const clearAccounts = () => {
    setAccounts([]);
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
        addAccounts,
        removeAccounts,
        clearAccounts,
        cleanDuplicates,
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
