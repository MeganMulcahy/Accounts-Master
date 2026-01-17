/**
 * Connected Apps & OAuth Page
 * Provides links to review OAuth apps and allows pasting app names.
 */

import React, { useState } from 'react';
import { useMasterList } from '../contexts/MasterListContext';
import { DiscoveredAccount, DataSource } from '@shared/types';
import { ExternalLink } from '../components/ExternalLink';
import './PageCommon.css';

interface ConnectedAppsPageProps {
  onNavigate: (page: string) => void;
}

const OAUTH_LINKS = [
  { name: 'Google', url: 'https://myaccount.google.com/permissions', source: DataSource.GMAIL_OAUTH },
  { name: 'Microsoft', url: 'https://account.microsoft.com/account/privacy', source: DataSource.MICROSOFT_OAUTH },
  { name: 'Facebook', url: 'https://www.facebook.com/settings?tab=applications', source: DataSource.FACEBOOK_OAUTH },
  { name: 'GitHub', url: 'https://github.com/settings/applications', source: DataSource.GMAIL_OAUTH },
];

export function ConnectedAppsPage({ onNavigate }: ConnectedAppsPageProps) {
  const { addAccounts } = useMasterList();
  const [appNames, setAppNames] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isValidEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleAppNamesSubmit = () => {
    if (!accountEmail || !isValidEmail(accountEmail)) {
      setError('Please enter a valid account email address');
      return;
    }

    if (!appNames.trim()) {
      setError('Please paste the app names');
      return;
    }

    try {
      // Parse app names - one per line or comma-separated
      const names = appNames
        .split(/[,\n]/)
        .map(name => name.trim())
        .filter(name => name.length > 0);

      if (names.length === 0) {
        setError('No valid app names found');
        return;
      }

      // Create discovered accounts from app names
      const newAccounts: DiscoveredAccount[] = names.map((name, index) => ({
        id: `oauth-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
        service: name,
        accountEmail,
        source: DataSource.MICROSOFT_OAUTH, // Default source, could be enhanced
        discoveredAt: new Date(),
        metadata: {
          parsedFrom: 'OAuth App List',
        },
      }));

      addAccounts(newAccounts);
      alert(`Successfully added ${newAccounts.length} connected apps to your master list!`);
      setAppNames('');
      setAccountEmail('');
      setError(null);
    } catch (err) {
      setError(`Failed to parse app names: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <button onClick={() => onNavigate('home')} className="btn-back">
          ← Back to Home
        </button>
        <h1>Connected Apps & OAuth</h1>
        <div></div>
      </div>

      <div className="instructions-section">
        <h2>Review Your Connected Apps</h2>
        <p>
          Visit the links below to review third-party apps that have access to your accounts.
          Copy the app names and paste them in the text area below.
        </p>
        
        <div className="oauth-links-vertical">
          {OAUTH_LINKS.map((link, index) => {
            // Special handler for Google link - open in Chrome
            if (link.name === 'Google') {
              return (
                <button
                  key={index}
                  onClick={async () => {
                    if (window.electronAPI?.openExternalUrlChrome) {
                      try {
                        const result = await window.electronAPI.openExternalUrlChrome(link.url);
                        if (!result.success) {
                          console.error('Failed to open URL in Chrome:', result.error);
                          alert('Failed to open in Chrome. Please make sure Chrome is installed.');
                        }
                      } catch (err) {
                        console.error('Error opening URL in Chrome:', err);
                        alert('Error opening in Chrome. Please try manually opening the link.');
                      }
                    } else {
                      // Fallback to default browser
                      if (window.electronAPI?.openExternalUrl) {
                        await window.electronAPI.openExternalUrl(link.url);
                      } else {
                        window.open(link.url, '_blank', 'noopener,noreferrer');
                      }
                    }
                  }}
                  className="oauth-link-btn-vertical"
                >
                  🔗 Review {link.name} Connected Apps
                </button>
              );
            }
            
            // Regular links for other providers
            return (
              <ExternalLink
                key={index}
                href={link.url}
                className="oauth-link-btn-vertical"
              >
                🔗 Review {link.name} Connected Apps
              </ExternalLink>
            );
          })}
        </div>
      </div>

      <div className="input-section">
        <div className="form-group">
          <label htmlFor="account-email">Account Email:</label>
          <input
            id="account-email"
            type="email"
            value={accountEmail}
            onChange={(e) => setAccountEmail(e.target.value)}
            placeholder="your.email@example.com"
            className="form-input"
          />
        </div>

        <div className="paste-section">
          <h3>Paste App Names</h3>
          <p>
            Paste the app names you found (one per line or comma-separated):
          </p>
          <textarea
            value={appNames}
            onChange={(e) => setAppNames(e.target.value)}
            placeholder={`Example:
Netflix
Spotify
Dropbox
Slack, Zoom, Microsoft Teams`}
            className="form-textarea"
            rows={10}
          />
          <button
            onClick={handleAppNamesSubmit}
            disabled={!accountEmail || !appNames.trim()}
            className="btn btn-primary"
          >
            Add Apps to Master List
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="privacy-note">
        <strong>Privacy:</strong> Only app names are stored. No authentication tokens or sensitive data is collected.
      </div>
    </div>
  );
}
