/**
 * Password Manager Import Page
 * Shows Chrome and Apple Keychain instructions with import/paste functionality.
 */

import React, { useState } from 'react';
import { useMasterList } from '../contexts/MasterListContext';
import { DataSource, DiscoveredAccount } from '@shared/types';
import { ExternalLink } from '../components/ExternalLink';
import { AccountTable } from '../components/AccountTable';
import './PageCommon.css';

interface PasswordManagerPageProps {
  onNavigate: (page: string) => void;
  source?: 'chrome' | 'keychain'; // Optional for backward compatibility
}

interface ImportedItem {
  service: string;
  email: string;
  source: string;
  importMethod: string;
}

export function PasswordManagerPage({ onNavigate, source }: PasswordManagerPageProps) {
  const { addAccounts, accounts } = useMasterList();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteContent, setPasteContent] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [accountEmail, setAccountEmail] = useState('');
  const [selectedSource, setSelectedSource] = useState<DataSource>(DataSource.CHROME_CSV);
  const [importedItems, setImportedItems] = useState<ImportedItem[]>([]);

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

      const sourceLabel = selectedSource === DataSource.CHROME_CSV 
        ? 'Chrome CSV Import' 
        : selectedSource === DataSource.APPLE_EXPORT 
        ? 'Apple Keychain Import' 
        : 'Password Manager Import';
      const importMethod = result.format === 'excel' ? 'File Upload (Excel)' : 'File Upload (CSV)';

      // Handle Excel files
      if (result.format === 'excel' && result.fileData) {
        const { parseExcelImport } = await import('../utils/export');
        const importedAccounts = parseExcelImport(result.fileData);
        
        // Add metadata: source, email, import method
        const accountsWithMetadata = importedAccounts.map(acc => ({
          ...acc,
          accountEmail: acc.accountEmail || accountEmail.trim(),
          metadata: {
            ...acc.metadata,
            source: sourceLabel,
            email: acc.accountEmail || accountEmail.trim(),
            importMethod: importMethod,
          },
        }));

        // Add to per-page import history
        const newImportedItems: ImportedItem[] = accountsWithMetadata.map(acc => ({
          service: acc.service,
          email: acc.accountEmail,
          source: sourceLabel,
          importMethod: importMethod,
        }));
        setImportedItems(prev => [...prev, ...newImportedItems]);

        addAccounts(accountsWithMetadata);
        alert(`Successfully imported ${accountsWithMetadata.length} accounts from Excel file!`);
      } else if (result.accounts && result.accounts.length > 0) {
        // Handle CSV files (already parsed in main process)
        // Add metadata: source, email, import method
        const accountsWithMetadata = result.accounts.map(acc => ({
          ...acc,
          accountEmail: acc.accountEmail || accountEmail.trim(),
          metadata: {
            ...acc.metadata,
            source: sourceLabel,
            email: acc.accountEmail || accountEmail.trim(),
            importMethod: importMethod,
          },
        }));

        // Add to per-page import history
        const newImportedItems: ImportedItem[] = accountsWithMetadata.map(acc => ({
          service: acc.service,
          email: acc.accountEmail,
          source: sourceLabel,
          importMethod: importMethod,
        }));
        setImportedItems(prev => [...prev, ...newImportedItems]);

        addAccounts(accountsWithMetadata);
        alert(`Successfully imported ${accountsWithMetadata.length} accounts from CSV file!`);
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

  const handlePasteSubmit = async () => {
    if (!pasteContent.trim()) {
      setError('Please paste the content');
      return;
    }

    if (!accountEmail.trim()) {
      setError('Please enter the email address associated with these accounts');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Parse as CSV
      const lines = pasteContent.split('\n').filter(line => line.trim());
      const accounts: DiscoveredAccount[] = [];
      const sourceLabel = selectedSource === DataSource.CHROME_CSV 
        ? 'Chrome CSV Import' 
        : selectedSource === DataSource.APPLE_EXPORT 
        ? 'Apple Keychain Import' 
        : 'Password Manager Import';
      const importMethod = 'Copy/Paste';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Try to parse CSV line
        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        
        if (parts.length >= 1) {
          const service = parts[0] || 'Unknown';
          const email = parts[1] || accountEmail.trim(); // Extract email from pasted content if available

          accounts.push({
            id: `pasted-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
            service: service.substring(0, 200),
            accountEmail: email.substring(0, 254) || accountEmail.trim(),
            source: selectedSource,
            discoveredAt: new Date(),
            metadata: {
              source: sourceLabel,
              email: email.substring(0, 254) || accountEmail.trim(),
              importMethod: importMethod,
            },
          });
        }
      }

      if (accounts.length > 0) {
        // Add to per-page import history
        const newImportedItems: ImportedItem[] = accounts.map(acc => ({
          service: acc.service,
          email: acc.accountEmail,
          source: sourceLabel,
          importMethod: importMethod,
        }));
        setImportedItems(prev => [...prev, ...newImportedItems]);

        try {
          addAccounts(accounts);
          alert(`Successfully added ${accounts.length} accounts from pasted content!`);
          setPasteContent('');
        } catch (addError) {
          const addErrorMessage = addError instanceof Error ? addError.message : 'Unknown error';
          console.error('Error adding accounts:', addError);
          setError(`Failed to add accounts: ${addErrorMessage}`);
          alert(`Content parsed but failed to add accounts: ${addErrorMessage}`);
        }
      } else {
        setError('Could not parse any accounts from the pasted content');
      }
    } catch (err) {
      setError(`Failed to parse content: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (dataSource: DataSource) => {
    try {
      setIsLoading(true);
      setError(null);

      if (!accountEmail.trim() && dataSource === DataSource.APPLE_EXPORT) {
        setError('Please enter the email address associated with this Apple Keychain export');
        setIsLoading(false);
        return;
      }

      if (window.electronAPI) {
        const emailToUse = accountEmail.trim() || '';
        const result = await window.electronAPI.selectAndParseFile(dataSource, emailToUse);
        
        if (result.errors && result.errors.length > 0) {
          setError(result.errors.join('; '));
        } else {
          const sourceLabel = dataSource === DataSource.APPLE_EXPORT ? 'Apple Keychain Import' : 'Chrome CSV Import';
          const importMethod = 'File Upload';
          
          // Add metadata: source, email, import method
          const accountsWithMetadata = result.accounts.map(acc => ({
            ...acc,
            accountEmail: acc.accountEmail || emailToUse,
            metadata: {
              ...acc.metadata,
              source: sourceLabel,
              email: acc.accountEmail || emailToUse,
              importMethod: importMethod,
            },
          }));

          // Add to per-page import history
          const newImportedItems: ImportedItem[] = accountsWithMetadata.map(acc => ({
            service: acc.service,
            email: acc.accountEmail,
            source: sourceLabel,
            importMethod: importMethod,
          }));
          setImportedItems(prev => [...prev, ...newImportedItems]);

          try {
            addAccounts(accountsWithMetadata);
            alert(`Successfully added ${accountsWithMetadata.length} accounts!`);
          } catch (addError) {
            const addErrorMessage = addError instanceof Error ? addError.message : 'Unknown error';
            console.error('Error adding accounts:', addError);
            setError(`Failed to add accounts: ${addErrorMessage}`);
            alert(`File processed but failed to add accounts: ${addErrorMessage}`);
          }
        }
      } else {
        setError('Electron API not available');
      }
    } catch (err) {
      setError(`Failed to process file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <button onClick={() => onNavigate('home')} className="btn-back">
          ← Back to Home
        </button>
        <h1>Password Managers</h1>
        <div></div>
      </div>

      {/* Chrome Instructions */}
      <div className="instructions-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
          <h2 style={{ margin: 0 }}>Chrome Passwords</h2>
          <button
            onClick={async () => {
              // chrome:// protocol doesn't work with shell.openExternal
              // So we'll copy to clipboard and show instructions
              const url = 'chrome://password-manager/settings';
              try {
                await navigator.clipboard.writeText(url);
                alert('Chrome URL copied to clipboard! Please paste it in your Chrome browser address bar.');
              } catch (err) {
                alert(`Please copy this URL and paste it in Chrome: ${url}`);
              }
            }}
            className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.9em' }}
          >
            🔗 Open Chrome Passwords Settings
          </button>
        </div>
        <ol>
          <li>
            Click the button above or manually open Chrome and navigate to{' '}
            <code>chrome://password-manager/settings</code>
          </li>
          <li>Click "Export passwords" button</li>
          <li>Confirm your computer password if prompted</li>
          <li>Save the CSV file and import it below</li>
        </ol>
      </div>

      {/* Apple Keychain Instructions */}
      <div className="instructions-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
          <h2 style={{ margin: 0 }}>Apple Keychain</h2>
          <button
            onClick={async () => {
              if (window.electronAPI?.openApplePasswords) {
                try {
                  const result = await window.electronAPI.openApplePasswords();
                  if (!result.success) {
                    alert('Could not open Apple Passwords. Please manually go to System Settings → Passwords');
                  }
                } catch (err) {
                  alert('Could not open Apple Passwords. Please manually go to System Settings → Passwords');
                }
              } else {
                alert('Please open System Settings → Passwords on your Mac');
              }
            }}
            className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.9em' }}
          >
            🔗 Open Apple Passwords
          </button>
        </div>
        <ol>
          <li>Click the button above to open Apple Passwords settings, or manually go to System Settings → Passwords</li>
          <li>Alternatively, open Keychain Access app on your Mac</li>
          <li>Select "All Items" or specific keychain items</li>
          <li>Go to File → Export Items...</li>
          <li>Choose CSV format</li>
          <li>Save the file and import it below</li>
        </ol>
        <p className="instruction-note">
          <strong>Note:</strong> You may need to enter your Mac password to export keychain items.
        </p>
      </div>

      {/* Import/Paste Section */}
      <div className="input-section">
        <h2>Import or Paste Accounts</h2>
        <p>You can paste: account, email associated with provider, email account associated with account found, username, password, etc.</p>

        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <label htmlFor="password-manager-source" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Password Manager Source:
          </label>
          <select
            id="password-manager-source"
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value as DataSource)}
            className="filter-select"
            style={{ width: '100%', maxWidth: '400px' }}
          >
            <option value={DataSource.CHROME_CSV}>Chrome</option>
            <option value={DataSource.APPLE_EXPORT}>Apple Keychain</option>
            <option value={DataSource.OTHER_OAUTH}>Other</option>
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <label htmlFor="password-manager-email" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Your Email Address (for this import):
          </label>
          <input
            type="email"
            id="password-manager-email"
            value={accountEmail}
            onChange={(e) => setAccountEmail(e.target.value)}
            placeholder="e.g., yourname@example.com"
            className="filter-input"
            style={{ width: '100%', maxWidth: '400px' }}
            required
          />
        </div>

        <div className="upload-section">
          <h3>Option 1: Import Excel or CSV File</h3>
          <button
            onClick={handleImport}
            disabled={isImporting}
            className="btn btn-primary"
          >
            {isImporting ? 'Importing...' : '📥 Import from File (Excel/CSV)'}
          </button>
        </div>

        <div className="paste-section">
          <h3>Option 2: Paste Content</h3>
          <p>Paste your account data (CSV format or any structured text):</p>
          <textarea
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
            placeholder={`Paste your accounts here. Format:
Service/Account, Email, Username, Password, etc.
Example:
Netflix, user@example.com, username, password
Spotify, user@example.com, username, password`}
            disabled={isLoading}
            className="form-textarea"
            rows={12}
          />
          <button
            onClick={handlePasteSubmit}
            disabled={isLoading || !pasteContent.trim() || !accountEmail.trim()}
            className="btn btn-primary"
          >
            {isLoading ? 'Processing...' : 'Parse Pasted Content'}
          </button>
        </div>
      </div>

      {/* Per-Page Import History */}
      {importedItems.length > 0 && (
        <div className="import-history-section" style={{ marginTop: '2rem' }}>
          <h2>Items Imported From This Page</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600 }}>Service Name</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600 }}>Email</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600 }}>Source</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600 }}>Import Method</th>
                </tr>
              </thead>
              <tbody>
                {importedItems.map((item, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.75rem' }}>{item.service}</td>
                    <td style={{ padding: '0.75rem' }}>{item.email}</td>
                    <td style={{ padding: '0.75rem' }}>{item.source}</td>
                    <td style={{ padding: '0.75rem' }}>{item.importMethod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
              Total: {importedItems.length} item{importedItems.length !== 1 ? 's' : ''} imported from this page
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Master List Filtered by Source */}
      <div className="master-list-section" style={{ marginTop: '2rem' }}>
        <h2>Accounts from Password Managers</h2>
        <AccountTable 
          accounts={accounts} 
          forceSourceFilter={DataSource.CHROME_CSV} 
        />
      </div>

      <div className="privacy-note">
        <strong>Privacy:</strong> All processing happens locally. Your passwords are never sent to external servers.
      </div>
    </div>
  );
}
