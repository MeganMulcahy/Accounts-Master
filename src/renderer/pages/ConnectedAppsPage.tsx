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
  const [selectedSource, setSelectedSource] = useState<DataSource>(DataSource.GMAIL_OAUTH);
  const [error, setError] = useState<string | null>(null);

  const handleAppNamesSubmit = () => {
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
      // OAuth apps have no username/password - they use OAuth authentication
      const newAccounts: DiscoveredAccount[] = names.map((name, index) => ({
        id: `oauth-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
        service: name,
        accountEmail: '', // Empty email for OAuth apps
        source: selectedSource, // Use selected OAuth provider source
        discoveredAt: new Date(),
        metadata: {
          parsedFrom: 'OAuth App List',
          username: '', // Empty username for OAuth apps
          password: '', // Empty password for OAuth apps (uses OAuth instead)
        },
      }));

      try {
        addAccounts(newAccounts);
        alert(`Successfully added ${newAccounts.length} connected apps to your master list!`);
        setAppNames('');
        setError(null);
      } catch (addError) {
        const addErrorMessage = addError instanceof Error ? addError.message : 'Unknown error';
        console.error('Error adding accounts:', addError);
        setError(`Failed to add accounts: ${addErrorMessage}`);
        alert(`Failed to add accounts: ${addErrorMessage}`);
      }
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
        <div className="paste-section">
          <h3>Paste App Names</h3>
          <p>
            Select where these apps are coming from, then paste the app names (one per line or comma-separated):
          </p>
          
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label htmlFor="oauth-source" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              OAuth Provider:
            </label>
            <select
              id="oauth-source"
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value as DataSource)}
              className="filter-select"
              style={{ width: '100%', maxWidth: '400px' }}
            >
              <option value={DataSource.GMAIL_OAUTH}>Log in with Google</option>
              <option value={DataSource.MICROSOFT_OAUTH}>Log in with Microsoft</option>
              <option value={DataSource.FACEBOOK_OAUTH}>Log in with Facebook</option>
              <option value={DataSource.TWITTER_OAUTH}>Log in with Twitter/X</option>
            </select>
            <p className="info-note" style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
              Note: OAuth apps use authentication tokens, so username and password fields will be empty.
            </p>
          </div>
          
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
            disabled={!appNames.trim()}
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
