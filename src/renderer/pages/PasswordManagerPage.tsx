/**
 * Password Manager Import Page
 * Shows Chrome and Apple Keychain instructions with import/paste functionality.
 */

import React, { useState } from 'react';
import { useMasterList } from '../contexts/MasterListContext';
import { DataSource, DiscoveredAccount } from '@shared/types';
import { ExternalLink } from '../components/ExternalLink';
import './PageCommon.css';

interface PasswordManagerPageProps {
  onNavigate: (page: string) => void;
  source?: 'chrome' | 'keychain'; // Optional for backward compatibility
}

export function PasswordManagerPage({ onNavigate, source }: PasswordManagerPageProps) {
  const { addAccounts } = useMasterList();
  const [accountEmail, setAccountEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteContent, setPasteContent] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const isValidEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  const handlePasteSubmit = async () => {
    if (!pasteContent.trim()) {
      setError('Please paste the content');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // For now, try to parse as CSV
      // In a real implementation, you'd parse the pasted content to extract:
      // - Account/Service name
      // - Email associated with provider
      // - Email account associated with account found
      // - Username
      // - Password (if included, though we won't store it)
      // - etc.

      // Simple CSV parsing for now
      const lines = pasteContent.split('\n').filter(line => line.trim());
      const accounts: DiscoveredAccount[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Try to parse CSV line
        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        
        if (parts.length >= 2) {
          const service = parts[0] || 'Unknown';
          const email = parts[1] || accountEmail || 'unknown@example.com';

          accounts.push({
            id: `pasted-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
            service: service.substring(0, 200),
            accountEmail: email.substring(0, 254),
            source: DataSource.CHROME_CSV,
            discoveredAt: new Date(),
            metadata: {
              pastedContent: 'Yes',
            },
          });
        }
      }

      if (accounts.length > 0) {
        addAccounts(accounts);
        alert(`Successfully added ${accounts.length} accounts from pasted content!`);
        setPasteContent('');
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
    if (!accountEmail || !isValidEmail(accountEmail)) {
      setError('Please enter a valid account email address');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      if (window.electronAPI) {
        const result = await window.electronAPI.selectAndParseFile(dataSource, accountEmail);
        
        if (result.errors && result.errors.length > 0) {
          setError(result.errors.join('; '));
        } else {
          addAccounts(result.accounts);
          alert(`Successfully added ${result.accounts.length} accounts!`);
          setAccountEmail('');
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

        <div className="form-group">
          <label htmlFor="account-email">Account Email (optional):</label>
          <input
            id="account-email"
            type="email"
            value={accountEmail}
            onChange={(e) => setAccountEmail(e.target.value)}
            placeholder="your.email@example.com"
            disabled={isLoading}
            className="form-input"
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
            disabled={isLoading || !pasteContent.trim()}
            className="btn btn-primary"
          >
            {isLoading ? 'Processing...' : 'Parse Pasted Content'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="privacy-note">
        <strong>Privacy:</strong> All processing happens locally. Your passwords are never sent to external servers.
      </div>
    </div>
  );
}
