/**
 * Email Page
 * Shows Gmail and Outlook instructions with import/paste functionality.
 */

import React, { useState } from 'react';
import { useMasterList } from '../contexts/MasterListContext';
import { DataSource, DiscoveredAccount } from '@shared/types';
import { ExternalLink } from '../components/ExternalLink';
import { AccountTable } from '../components/AccountTable';
import './PageCommon.css';

interface EmailPageProps {
  onNavigate: (page: string) => void;
}

interface ImportedItem {
  service: string;
  email: string;
  source: string;
  importMethod: string;
}

export function EmailPage({ onNavigate }: EmailPageProps) {
  const { addAccounts, accounts } = useMasterList();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteContent, setPasteContent] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [importedItems, setImportedItems] = useState<ImportedItem[]>([]);

  const handleFileUpload = async (dataSource: DataSource) => {
    try {
      setIsLoading(true);
      setError(null);

      if (!accountEmail.trim() && dataSource === DataSource.GMAIL_TAKEOUT) {
        setError('Please enter the email address associated with this Gmail account');
        setIsLoading(false);
        return;
      }

      if (window.electronAPI) {
        // Use provided accountEmail or empty string
        const emailToUse = accountEmail.trim() || '';
        const result = await window.electronAPI.selectAndParseFile(dataSource, emailToUse);
        
        if (result.errors && result.errors.length > 0) {
          setError(result.errors.join('; '));
        } else {
          // Add metadata: source, email, import method
          const sourceLabel = dataSource === DataSource.GMAIL_TAKEOUT ? 'Gmail MBOX Parse' : 'Email Import';
          const importMethod = 'File Upload';
          
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

      // Parse pasted content - extract account, email, username, password, etc.
      const lines = pasteContent.split('\n').filter(line => line.trim());
      const accounts: DiscoveredAccount[] = [];
      const sourceLabel = 'Gmail MBOX Parse';
      const importMethod = 'Copy/Paste';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Try to parse CSV line or structured text
        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        
        if (parts.length >= 1) {
          const service = parts[0] || 'Unknown';
          // Extract email from the pasted content if available, otherwise use provided email
          const email = parts[1] || accountEmail.trim();

          accounts.push({
            id: `pasted-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
            service: service.substring(0, 200),
            accountEmail: email.substring(0, 254) || accountEmail.trim(),
            source: DataSource.GMAIL_TAKEOUT,
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

  return (
    <div className="page-container">
      <div className="page-header">
        <button onClick={() => onNavigate('home')} className="btn-back">
          ← Back to Home
        </button>
        <h1>Email</h1>
        <div></div>
      </div>

      {/* Gmail Instructions */}
      <div className="instructions-section">
        <h2>Gmail Subscriptions</h2>
        <ol>
          <li>
            Visit{' '}
            <ExternalLink href="https://takeout.google.com">
              Google Takeout
            </ExternalLink>
          </li>
          <li>Select "Mail" from the list of services</li>
          <li>Choose MBOX format for export</li>
          <li>Download and extract the archive</li>
          <li>Upload the MBOX file below or paste the raw content</li>
        </ol>
        <p className="instruction-note">
          <strong>Note:</strong> The export may take some time depending on your mailbox size.
        </p>
      </div>

      {/* Outlook Instructions */}
      <div className="instructions-section">
        <h2>Outlook Settings & Subscriptions</h2>
        <ol>
          <li>Open Outlook app on your computer</li>
          <li>Go to <strong>File → Settings → Mail</strong> (or <strong>Outlook → Preferences → Mail</strong> on Mac)</li>
          <li>Navigate to <strong>Subscriptions</strong> or <strong>Mailing Lists</strong> section</li>
          <li>Review your subscribed mailing lists and newsletters</li>
          <li>For each subscription, you'll see options to unsubscribe or manage preferences</li>
          <li>Copy the mailing list names or export the list if available</li>
          <li>Paste the subscription names below</li>
        </ol>
        <p className="instruction-note">
          <strong>Note:</strong> This helps you discover accounts from mailing lists you've subscribed to through Outlook email.
        </p>
      </div>

      {/* Import/Paste Section */}
      <div className="input-section">
        <h2>Import or Paste Accounts</h2>
        <p>You can paste: account, email associated with provider, email account associated with account found, username, password, etc.</p>

        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="email-account-email" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Email Address:
          </label>
          <input
            id="email-account-email"
            type="email"
            value={accountEmail}
            onChange={(e) => setAccountEmail(e.target.value)}
            placeholder="user@example.com"
            className="filter-input"
            style={{ width: '100%', maxWidth: '400px' }}
          />
          <p className="info-note" style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
            Enter the email address associated with these accounts.
          </p>
        </div>

        <div className="upload-section">
          <h3>Option 1: Upload File (Gmail MBOX)</h3>
          <button
            onClick={() => handleFileUpload(DataSource.GMAIL_TAKEOUT)}
            disabled={isLoading}
            className="btn btn-primary"
          >
            {isLoading ? 'Processing...' : 'Select and Process MBOX File'}
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
      <div className="master-list-section" style={{ marginTop: '2rem', width: '100%', maxWidth: '100%' }}>
        <h2>Accounts from Email Sources</h2>
        <AccountTable accounts={accounts.filter(acc => 
          acc.allSources.some((s: DataSource) => 
            s === DataSource.GMAIL_TAKEOUT
          )
        )} />
      </div>

      <div className="privacy-note">
        <strong>Privacy:</strong> All processing happens locally. Your email content is never sent to external servers.
      </div>
    </div>
  );
}
