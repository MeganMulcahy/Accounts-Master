/**
 * Connected Apps & OAuth Page
 * Provides links to review OAuth apps and allows pasting app names.
 */

import { useState } from 'react';
import { useMasterList } from '../contexts/MasterListContext';
import { DiscoveredAccount, DataSource } from '../../shared/types';
import { ExternalLink } from '../components/ExternalLink';
import { AccountTable } from '../components/AccountTable';
import { parseOAuthText } from '../utils/oauthTextParser';
import './PageCommon.css';

interface ConnectedAppsPageProps {
  onNavigate: (page: string) => void;
}

interface ImportedItem {
  service: string;
  email: string;
  source: string;
  importMethod: string;
}

const OAUTH_LINKS = [
  { name: 'Google', url: 'https://myaccount.google.com/permissions', source: DataSource.GMAIL_OAUTH },
  { name: 'Microsoft', url: 'https://account.microsoft.com/account/privacy', source: DataSource.MICROSOFT_OAUTH },
  { name: 'Facebook', url: 'https://www.facebook.com/settings?tab=applications', source: DataSource.FACEBOOK_OAUTH },
  { name: 'GitHub', url: 'https://github.com/settings/applications', source: DataSource.GITHUB_OAUTH },
];

// OAuth source options
const OAUTH_SOURCES = [
  { value: DataSource.GMAIL_OAUTH, label: 'Google' },
  { value: DataSource.APPLE_OAUTH, label: 'Apple' },
  { value: DataSource.MICROSOFT_OAUTH, label: 'Microsoft' },
  { value: DataSource.FACEBOOK_OAUTH, label: 'Facebook' },
  { value: DataSource.GITHUB_OAUTH, label: 'GitHub' },
  { value: DataSource.OTHER_OAUTH, label: 'Other' },
];

export function ConnectedAppsPage({ onNavigate }: ConnectedAppsPageProps) {
  const { addAccounts, accounts } = useMasterList();
  const [appNames, setAppNames] = useState('');
  const [selectedSource, setSelectedSource] = useState<DataSource>(DataSource.GMAIL_OAUTH);
  const [accountEmail, setAccountEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importedItems, setImportedItems] = useState<ImportedItem[]>([]);

  const getSourceLabel = (source: DataSource): string => {
    const option = OAUTH_SOURCES.find(opt => opt.value === source);
    return option ? `${option.label} OAuth` : 'OAuth';
  };

  const handleAppNamesSubmit = () => {
    if (!appNames.trim()) {
      setError('Please paste the app names');
      return;
    }

    if (!accountEmail.trim()) {
      setError('Please enter the email address associated with these OAuth apps');
      return;
    }

    try {
      // Parse app names using the improved parser that filters out expired/dates/status
      const serviceNames = parseOAuthText(appNames);

      if (serviceNames.length === 0) {
        setError('No valid service names found. Please check that you pasted app names and not status messages or dates.');
        return;
      }

      const sourceLabel = getSourceLabel(selectedSource);
      const importMethod = 'Copy/Paste';

      // Create discovered accounts from parsed service names
      // OAuth apps have no username/password - they use OAuth authentication
      const newAccounts: DiscoveredAccount[] = serviceNames.map((name, index) => ({
        id: `oauth-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
        service: name,
        accountEmail: accountEmail.trim(),
        source: selectedSource,
        discoveredAt: new Date(),
        metadata: {
          source: sourceLabel,
          email: accountEmail.trim(),
          importMethod: importMethod,
          username: '', // Empty username for OAuth apps
          password: '', // Empty password for OAuth apps (uses OAuth instead)
        },
      }));

      // Add to per-page import history
      const newImportedItems: ImportedItem[] = serviceNames.map(name => ({
        service: name,
        email: accountEmail.trim(),
        source: sourceLabel,
        importMethod: importMethod,
      }));
      setImportedItems(prev => [...prev, ...newImportedItems]);

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
              {OAUTH_SOURCES.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label htmlFor="oauth-email" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              Email Address:
            </label>
            <input
              id="oauth-email"
              type="email"
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
              placeholder="user@example.com"
              className="filter-input"
              style={{ width: '100%', maxWidth: '400px' }}
            />
            <p className="info-note" style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
              Enter the email address associated with these OAuth connected apps.
            </p>
          </div>
          
          <textarea
            value={appNames}
            onChange={(e) => setAppNames(e.target.value)}
            placeholder={`Paste app names here. The parser will automatically filter out:
- Expired status messages
- Dates and timelines
- Usage information
- Status indicators

Example:
Netflix
Spotify
Dropbox
Slack, Zoom, Microsoft Teams`}
            className="form-textarea"
            rows={10}
          />
          <button
            onClick={handleAppNamesSubmit}
            disabled={!appNames.trim() || !accountEmail.trim()}
            className="btn btn-primary"
          >
            Add Apps to Master List
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

      {/* Master List Filtered by OAuth Sources */}
      <div className="master-list-section" style={{ marginTop: '2rem', width: '100%', maxWidth: '100%' }}>
        <h2>Accounts from OAuth Connectors</h2>
        <AccountTable 
          accounts={accounts.filter(acc => 
            acc.allSources.some((s: DataSource) => 
              s === DataSource.GMAIL_OAUTH ||
              s === DataSource.APPLE_OAUTH ||
              s === DataSource.MICROSOFT_OAUTH ||
              s === DataSource.FACEBOOK_OAUTH ||
              s === DataSource.GITHUB_OAUTH ||
              s === DataSource.OTHER_OAUTH ||
              s === DataSource.TWITTER_OAUTH
            )
          )} 
        />
      </div>

      <div className="privacy-note">
        <strong>Privacy:</strong> Only app names are stored. No authentication tokens or sensitive data is collected.
      </div>
    </div>
  );
}
