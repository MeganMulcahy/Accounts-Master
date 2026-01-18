/**
 * Gmail Subscriptions Page
 * Allows users to upload Gmail Takeout files or paste content.
 */

import React, { useState } from 'react';
import { useMasterList } from '../contexts/MasterListContext';
import { DataSource } from '@shared/types';
import { ExternalLink } from '../components/ExternalLink';
import './PageCommon.css';

interface GmailSubscriptionsPageProps {
  onNavigate: (page: string) => void;
}

export function GmailSubscriptionsPage({ onNavigate }: GmailSubscriptionsPageProps) {
  const { addAccounts } = useMasterList();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteContent, setPasteContent] = useState('');

  const handleFileUpload = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (window.electronAPI) {
        // Use empty string for accountEmail - it will be derived from the file
        const result = await window.electronAPI.selectAndParseFile(DataSource.GMAIL_TAKEOUT, '');
        
        if (result.errors && result.errors.length > 0) {
          setError(result.errors.join('; '));
        } else {
          addAccounts(result.accounts);
          alert(`Successfully added ${result.accounts.length} accounts from Gmail Takeout!`);
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

    try {
      setIsLoading(true);
      setError(null);

      // For paste content, we'll need to parse it in the main process
      // This is a simplified version - you may need to implement paste parsing
      if (window.electronAPI && (window.electronAPI as any).parseGmailTakeoutPaste) {
        // Use empty string for accountEmail - it will be derived from the content
        const result = await (window.electronAPI as any).parseGmailTakeoutPaste(pasteContent, '');
        
        if (result.errors && result.errors.length > 0) {
          setError(result.errors.join('; '));
        } else {
          addAccounts(result.accounts);
          alert(`Successfully added ${result.accounts.length} accounts from pasted content!`);
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
          ← Back to Home
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
        <div className="upload-section">
          <h3>Option 1: Upload File</h3>
          <p>Upload your Gmail Takeout MBOX file:</p>
          <button
            onClick={handleFileUpload}
            disabled={isLoading}
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
