/**
 * Email Page
 * Shows Gmail and Outlook instructions with import/paste functionality.
 */

import React, { useState } from 'react';
import { useMasterList } from '../contexts/MasterListContext';
import { DataSource, DiscoveredAccount } from '@shared/types';
import { ExternalLink } from '../components/ExternalLink';
import './PageCommon.css';

interface EmailPageProps {
  onNavigate: (page: string) => void;
}

export function EmailPage({ onNavigate }: EmailPageProps) {
  const { addAccounts } = useMasterList();
  const [accountEmail, setAccountEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteContent, setPasteContent] = useState('');

  const isValidEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  const handlePasteSubmit = async () => {
    if (!pasteContent.trim()) {
      setError('Please paste the content');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Parse pasted content - extract account, email, username, password, etc.
      const lines = pasteContent.split('\n').filter(line => line.trim());
      const accounts: DiscoveredAccount[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Try to parse CSV line or structured text
        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        
        if (parts.length >= 2) {
          const service = parts[0] || 'Unknown';
          const email = parts[1] || accountEmail || 'unknown@example.com';

          accounts.push({
            id: `pasted-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
            service: service.substring(0, 200),
            accountEmail: email.substring(0, 254),
            source: DataSource.GMAIL_TAKEOUT,
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
          <h3>Option 1: Upload File (Gmail MBOX)</h3>
          <button
            onClick={() => handleFileUpload(DataSource.GMAIL_TAKEOUT)}
            disabled={isLoading || !accountEmail}
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
        <strong>Privacy:</strong> All processing happens locally. Your email content is never sent to external servers.
      </div>
    </div>
  );
}
