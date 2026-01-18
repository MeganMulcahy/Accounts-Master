/**
 * Gmail Subscriptions Page
 * Allows users to upload Gmail Takeout files or paste content.
 */

import React, { useState } from 'react';
import { useMasterList } from '../contexts/MasterListContext';
import { DataSource, DiscoveredAccount } from '@shared/types';
import { ExternalLink } from '../components/ExternalLink';
import { AccountTable } from '../components/AccountTable';
import './PageCommon.css';

interface GmailSubscriptionsPageProps {
  onNavigate: (page: string) => void;
}

interface ImportedItem {
  service: string;
  email: string;
  source: string;
  importMethod: string;
}

export function GmailSubscriptionsPage({ onNavigate }: GmailSubscriptionsPageProps) {
  const { addAccounts, accounts } = useMasterList();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteContent, setPasteContent] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [importedItems, setImportedItems] = useState<ImportedItem[]>([]);

  const handleFileUpload = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (!accountEmail.trim()) {
        setError('Please enter the email address associated with this Gmail account');
        setIsLoading(false);
        return;
      }

      if (window.electronAPI) {
        const emailToUse = accountEmail.trim();
        const result = await window.electronAPI.selectAndParseFile(DataSource.GMAIL_TAKEOUT, emailToUse);
        
        if (result.errors && result.errors.length > 0) {
          setError(result.errors.join('; '));
        } else {
          const sourceLabel = 'Gmail MBOX Parse';
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

          addAccounts(accountsWithMetadata);
          alert(`Successfully added ${accountsWithMetadata.length} accounts from Gmail Takeout!`);
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
      setError('Please paste the exported content');
      return;
    }

    if (!accountEmail.trim()) {
      setError('Please enter the email address associated with this Gmail account');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // For paste content, we'll need to parse it in the main process
      // This is a simplified version - you may need to implement paste parsing
      if (window.electronAPI && (window.electronAPI as any).parseGmailTakeoutPaste) {
        const emailToUse = accountEmail.trim();
        const result = await (window.electronAPI as any).parseGmailTakeoutPaste(pasteContent, emailToUse);
        
        if (result.errors && result.errors.length > 0) {
          setError(result.errors.join('; '));
        } else {
          const sourceLabel = 'Gmail MBOX Parse';
          const importMethod = 'Copy/Paste';
          
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

          addAccounts(accountsWithMetadata);
          alert(`Successfully added ${accountsWithMetadata.length} accounts from pasted content!`);
          setPasteContent('');
        }
      } else {
        setError('Paste parsing not yet implemented. Please use file upload instead.');
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
          ←
        </button>
        <h1>Gmail Subscriptions</h1>
        <div></div>
      </div>

      <div className="instructions-section">
        <h2>How to Export Gmail Data</h2>
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

      <div className="input-section">
        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="gmail-account-email" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Email Address:
          </label>
          <input
            id="gmail-account-email"
            type="email"
            value={accountEmail}
            onChange={(e) => setAccountEmail(e.target.value)}
            placeholder="user@example.com"
            className="filter-input"
            style={{ width: '100%', maxWidth: '400px' }}
          />
          <p className="info-note" style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
            Enter the email address associated with this Gmail account.
          </p>
        </div>

        <div className="upload-section">
          <h3>Option 1: Upload File</h3>
          <p>Upload your Gmail Takeout MBOX file:</p>
          <button
            onClick={handleFileUpload}
            disabled={isLoading || !accountEmail.trim()}
            className="btn btn-primary"
          >
            {isLoading ? 'Processing...' : 'Select and Process MBOX File'}
          </button>
        </div>

        <div className="paste-section">
          <h3>Option 2: Paste Content</h3>
          <p>Or paste the exported content directly:</p>
          <textarea
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
            placeholder="Paste your Gmail Takeout content here..."
            disabled={isLoading}
            className="form-textarea"
            rows={10}
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
        <h2>Accounts from Gmail Subscriptions</h2>
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
