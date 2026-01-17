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
  const { accounts, addAccounts } = useMasterList();
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  /**
   * Export accounts to CSV or Excel
   */
  const handleExport = async (format: 'csv' | 'excel') => {
    try {
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
        exportToExcel(exportAccounts, `accounts-export-${Date.now()}.xlsx`);
      } else {
        // CSV export through Electron
        if (window.electronAPI) {
          const result = await window.electronAPI.exportAccounts(exportAccounts, format);
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
        addAccounts(importedAccounts);
        alert(`Successfully imported ${importedAccounts.length} accounts from Excel file!`);
      } else if (result.accounts && result.accounts.length > 0) {
        // Handle CSV files (already parsed in main process)
        addAccounts(result.accounts);
        alert(`Successfully imported ${result.accounts.length} accounts from CSV file!`);
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
