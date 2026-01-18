/**
 * Home Page - "Explore Your Digital Presence"
 * Displays the master list and provides export functionality.
 */

import React, { useState } from 'react';
import { useMasterList } from '../contexts/MasterListContext';
import { AccountTable } from '../components/AccountTable';
import { DiscoveredAccount } from '@shared/types';
import './HomePage.css';
import './PageCommon.css';

interface HomePageProps {
  onNavigate: (page: string) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { accounts, addAccounts, commonPasswordPhrases, setCommonPasswordPhrases, consolidateData } = useMasterList();
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  /**
   * Calculate duplicate groups for accounts based on service or link (email removed to reduce false duplicates)
   * Returns Map of account ID to group number (or null if no duplicates)
   */
  const calculateDuplicateGroups = (accountsList: typeof accounts): Map<string, number | null> => {
    const serviceMap = new Map<string, string[]>();
    const linkMap = new Map<string, string[]>();
    const unionFind = new Map<string, string>();

    // Helper function to find root of a group (union-find)
    const findRoot = (id: string): string => {
      if (!unionFind.has(id)) {
        unionFind.set(id, id);
        return id;
      }
      const parent = unionFind.get(id)!;
      if (parent === id) {
        return id;
      }
      const root = findRoot(parent);
      unionFind.set(id, root);
      return root;
    };

    // Helper function to union two accounts
    const union = (id1: string, id2: string) => {
      const root1 = findRoot(id1);
      const root2 = findRoot(id2);
      if (root1 !== root2) {
        unionFind.set(root2, root1);
      }
    };

    // Index accounts by service and link (email removed)
    accountsList.forEach(account => {
      const accountId = account.id;
      const service = account.service.toLowerCase().trim();
      const link = account.metadata?.link?.toLowerCase().trim() || '';

      if (service) {
        if (!serviceMap.has(service)) serviceMap.set(service, []);
        serviceMap.get(service)!.push(accountId);
      }
      if (link) {
        if (!linkMap.has(link)) linkMap.set(link, []);
        linkMap.get(link)!.push(accountId);
      }
    });

    // Union accounts that share service or link (email removed)
    for (const ids of serviceMap.values()) {
      if (ids.length > 1) {
        for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
      }
    }
    for (const ids of linkMap.values()) {
      if (ids.length > 1) {
        for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
      }
    }

    // Count accounts per group
    const groupCounts = new Map<string, number>();
    accountsList.forEach(account => {
      const root = findRoot(account.id);
      groupCounts.set(root, (groupCounts.get(root) || 0) + 1);
    });

    // Assign group numbers
    let groupNum = 1;
    const groupNumbers = new Map<string, number>();
    const accountIdToGroupNum = new Map<string, number | null>();

    accountsList.forEach(account => {
      const root = findRoot(account.id);
      const count = groupCounts.get(root) || 0;
      if (count > 1) {
        if (!groupNumbers.has(root)) {
          groupNumbers.set(root, groupNum++);
        }
        accountIdToGroupNum.set(account.id, groupNumbers.get(root)!);
      } else {
        accountIdToGroupNum.set(account.id, null);
      }
    });

    return accountIdToGroupNum;
  };

  /**
   * Export accounts to CSV or Excel
   */
  const handleExport = async (format: 'csv' | 'excel') => {
    try {
      // Calculate duplicate groups
      const duplicateGroups = calculateDuplicateGroups(accounts);

      // Convert DeduplicatedAccount to DiscoveredAccount for export
      const exportAccounts: DiscoveredAccount[] = accounts.map(account => ({
        id: account.id,
        service: account.service,
        accountEmail: account.accountEmail,
        source: account.source,
        discoveredAt: account.discoveredAt,
        metadata: account.metadata,
      }));

      if (format === 'excel') {
        // Excel export
        const { exportToExcel } = await import('../utils/export');
        exportToExcel(exportAccounts, duplicateGroups, `accounts-export-${Date.now()}.xlsx`);
      } else {
        // CSV export through Electron - pass duplicate groups
        if (window.electronAPI) {
          // For CSV, we need to pass duplicate groups separately or embed in accounts
          // Let's embed the group number in metadata temporarily for export
          const accountsWithGroups = exportAccounts.map(acc => ({
            ...acc,
            metadata: {
              ...acc.metadata,
              _duplicateGroup: duplicateGroups.get(acc.id)?.toString() || '',
            },
          }));
          const result = await window.electronAPI.exportAccounts(accountsWithGroups, format);
          if (result.success) {
            alert(`Accounts exported successfully to: ${result.filePath}`);
          } else {
            alert(`Export failed: ${result.error}`);
          }
        }
      }
    } catch (err) {
      alert(`Export error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  /**
   * Import accounts from CSV or Excel file
   */
  const handleImport = async () => {
    try {
      setIsImporting(true);
      setError(null);

      if (!window.electronAPI?.importAccounts) {
        setError('Import functionality not available');
        return;
      }

      const result = await window.electronAPI.importAccounts();

      if (!result.success) {
        setError(result.errors?.join('; ') || 'Import failed');
        return;
      }

      // Handle Excel files
      if (result.format === 'excel' && result.fileData) {
        const { parseExcelImport } = await import('../utils/export');
        const importedAccounts = parseExcelImport(result.fileData);
        try {
          addAccounts(importedAccounts);
          alert(`Successfully imported ${importedAccounts.length} accounts from Excel file!`);
        } catch (addError) {
          const addErrorMessage = addError instanceof Error ? addError.message : 'Unknown error';
          console.error('Error adding accounts:', addError);
          setError(`Failed to add accounts: ${addErrorMessage}`);
          alert(`Import completed but failed to add accounts: ${addErrorMessage}`);
        }
      } else if (result.accounts && result.accounts.length > 0) {
        // Handle CSV files (already parsed in main process)
        try {
          addAccounts(result.accounts);
          alert(`Successfully imported ${result.accounts.length} accounts from CSV file!`);
        } catch (addError) {
          const addErrorMessage = addError instanceof Error ? addError.message : 'Unknown error';
          console.error('Error adding accounts:', addError);
          setError(`Failed to add accounts: ${addErrorMessage}`);
          alert(`Import completed but failed to add accounts: ${addErrorMessage}`);
        }
      } else {
        setError('No accounts found in the imported file');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      alert(`Import error: ${errorMessage}`);
    } finally {
      setIsImporting(false);
    }
  };

  /**
   * Merge/Clean Data - consolidates duplicates in current dataset
   */
  const handleMergeCleanData = () => {
    if (accounts.length === 0) {
      alert('No accounts to merge.');
      return;
    }

    setIsMerging(true);
    try {
      const beforeCount = accounts.length;
      const result = consolidateData();
      const afterCount = result.accounts.length;
      const merged = result.mergedCount;
      const removed = result.removedCount;

      const messages: string[] = [];
      if (merged > 0) {
        messages.push(`${merged} duplicate ${merged === 1 ? 'entry' : 'entries'} merged`);
      }
      if (removed > 0) {
        messages.push(`${removed} empty ${removed === 1 ? 'row' : 'rows'} removed`);
      }
      if (beforeCount > afterCount) {
        messages.push(`Total: ${beforeCount} → ${afterCount} accounts`);
      }

      if (messages.length > 0) {
        alert(`Data merged successfully!\n\n${messages.join('\n')}`);
      } else {
        alert('No duplicates found. Data is already clean.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to merge data: ${errorMessage}`);
      alert(`Error merging data: ${errorMessage}`);
    } finally {
      setIsMerging(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const uniqueEmails = new Set(accounts.map(a => a.accountEmail)).size;

  return (
    <div className="home-page">
      <div className="page-header-centered">
        <h1>Explore Your Digital Presence</h1>
      </div>

      <div className="master-list-stats">
        <p>
          <strong>{accounts.length}</strong> unique accounts discovered across{' '}
          <strong>{uniqueEmails}</strong> email {uniqueEmails === 1 ? 'account' : 'accounts'}
        </p>
      </div>

      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="vertical-sections">
        {/* Email Section */}
        <div className="section-card">
          <div className="section-header" onClick={() => onNavigate('email')}>
            <h2>📧 Email</h2>
            <span className="expand-icon">→</span>
          </div>
        </div>

        {/* Password Managers Section */}
        <div className="section-card">
          <div className="section-header" onClick={() => onNavigate('passwords')}>
            <h2>🔐 Password Managers</h2>
            <span className="expand-icon">→</span>
          </div>
        </div>

        {/* OAuth Connectors Section */}
        <div className="section-card">
          <div className="section-header" onClick={() => onNavigate('oauth')}>
            <h2>🔗 OAuth Connectors</h2>
            <span className="expand-icon">→</span>
          </div>
        </div>
      </div>

      <div className="user-info-section">
        <div className="action-group">
          <h2>Phrases You Commonly Use (for Password Security Analysis)</h2>
          <p className="info-note">
            Enter phrases you commonly use in passwords (including your name, last name, and any common password phrases).
            Passwords containing these phrases will be flagged as weak. Separate phrases with commas or new lines.
          </p>
          <div className="phrases-input-group">
            <label htmlFor="commonPasswordPhrases">Common Password Phrases:</label>
            <textarea
              id="commonPasswordPhrases"
              value={commonPasswordPhrases}
              onChange={(e) => setCommonPasswordPhrases(e.target.value)}
              placeholder="Enter phrases separated by commas or new lines. For example:&#10;John&#10;Smith&#10;password123&#10;mypetname"
              className="phrases-textarea"
              rows={6}
            />
          </div>
        </div>
      </div>

      <div className="import-export-section">
        <div className="action-group">
          <h2>Import/Export Data</h2>
          <div className="button-group">
            <button
              onClick={handleImport}
              disabled={isImporting}
              className="btn btn-import"
            >
              {isImporting ? 'Importing...' : '📥 Import from File'}
            </button>
            <button
              onClick={() => handleExport('csv')}
              disabled={accounts.length === 0}
              className="btn btn-export"
            >
              Export to CSV
            </button>
            <button
              onClick={() => handleExport('excel')}
              disabled={accounts.length === 0}
              className="btn btn-export"
            >
              Export to Excel
            </button>
            <button
              onClick={handleMergeCleanData}
              disabled={accounts.length === 0 || isMerging}
              className="btn btn-danger"
            >
              {isMerging ? 'Merging...' : '🧹 Merge/Clean Data'}
            </button>
          </div>
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="master-list-section">
          <h2>Master List of Discovered Accounts</h2>
          <AccountTable accounts={accounts} />
        </div>
      )}

      {accounts.length === 0 && (
        <div className="empty-state">
          <p>No accounts discovered yet. Expand the sections above to start discovering your accounts.</p>
        </div>
      )}
    </div>
  );
}
