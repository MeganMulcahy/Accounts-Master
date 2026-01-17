/**
 * Data source selector component.
 * Allows users to select and process data from various sources.
 */

import React, { useState } from 'react';
import { DataSource } from '../../shared/types';
import { GmailOAuthHandler } from './oauth/GmailOAuthHandler';
import { MicrosoftOAuthHandler } from './oauth/MicrosoftOAuthHandler';
import { FacebookOAuthHandler } from './oauth/FacebookOAuthHandler';
import { TwitterOAuthHandler } from './oauth/TwitterOAuthHandler';
import { FileUploadHandler } from './FileUploadHandler';
import './DataSourceSelector.css';

interface DataSourceSelectorProps {
  onAccountsDiscovered: (accounts: any[]) => void;
  onError: (error: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  selectedAccount: string;
  setSelectedAccount: (account: string) => void;
}

export const DataSourceSelector: React.FC<DataSourceSelectorProps> = ({
  onAccountsDiscovered,
  onError,
  isLoading,
  setIsLoading,
  selectedAccount,
  setSelectedAccount,
}) => {
  const [activeSource, setActiveSource] = useState<DataSource | null>(null);

  const handleFileSource = (source: DataSource) => {
    setActiveSource(source);
  };

  const handleOAuthSource = (source: DataSource) => {
    setActiveSource(source);
  };

  const handleAccountsDiscovered = (accounts: any[]) => {
    onAccountsDiscovered(accounts);
    setActiveSource(null);
    setIsLoading(false);
  };

  const handleSourceError = (error: string) => {
    onError(error);
    setIsLoading(false);
  };

  return (
    <div className="data-source-selector">
      <h2>Select Data Source</h2>
      
      <div className="account-input-section">
        <label htmlFor="account-email">
          Originating Account Email (for file-based sources):
        </label>
        <input
          id="account-email"
          type="email"
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          placeholder="your-email@example.com"
          className="account-email-input"
        />
        <small>This helps identify which account the discovered services belong to.</small>
      </div>

      <div className="data-source-grid">
        <div className="data-source-section">
          <h3>File-Based Sources</h3>
          <div className="data-source-buttons">
            <button
              onClick={() => handleFileSource(DataSource.CHROME_CSV)}
              disabled={isLoading}
              className="btn btn-source"
            >
              Chrome Passwords (CSV)
            </button>
            <button
              onClick={() => handleFileSource(DataSource.APPLE_EXPORT)}
              disabled={isLoading}
              className="btn btn-source"
            >
              Apple Keychain (Export)
            </button>
            <button
              onClick={() => handleFileSource(DataSource.GMAIL_TAKEOUT)}
              disabled={isLoading}
              className="btn btn-source"
            >
              Gmail Takeout (MBOX)
            </button>
          </div>
        </div>

        <div className="data-source-section">
          <h3>OAuth-Based Sources</h3>
          <div className="data-source-buttons">
            <button
              onClick={() => handleOAuthSource(DataSource.GMAIL_OAUTH)}
              disabled={isLoading}
              className="btn btn-source btn-oauth"
            >
              Gmail (OAuth)
            </button>
            <button
              onClick={() => handleOAuthSource(DataSource.MICROSOFT_OAUTH)}
              disabled={isLoading}
              className="btn btn-source btn-oauth"
            >
              Microsoft (OAuth)
            </button>
            <button
              onClick={() => handleOAuthSource(DataSource.FACEBOOK_OAUTH)}
              disabled={isLoading}
              className="btn btn-source btn-oauth"
            >
              Facebook (OAuth)
            </button>
            <button
              onClick={() => handleOAuthSource(DataSource.TWITTER_OAUTH)}
              disabled={isLoading}
              className="btn btn-source btn-oauth"
            >
              Twitter/X (OAuth)
            </button>
          </div>
        </div>
      </div>

      {activeSource && (
        <div className="active-source-handler">
          {activeSource === DataSource.CHROME_CSV && (
            <FileUploadHandler
              source={DataSource.CHROME_CSV}
              accountEmail={selectedAccount}
              onAccountsDiscovered={handleAccountsDiscovered}
              onError={handleSourceError}
              setIsLoading={setIsLoading}
            />
          )}
          {activeSource === DataSource.APPLE_EXPORT && (
            <FileUploadHandler
              source={DataSource.APPLE_EXPORT}
              accountEmail={selectedAccount}
              onAccountsDiscovered={handleAccountsDiscovered}
              onError={handleSourceError}
              setIsLoading={setIsLoading}
            />
          )}
          {activeSource === DataSource.GMAIL_TAKEOUT && (
            <FileUploadHandler
              source={DataSource.GMAIL_TAKEOUT}
              accountEmail={selectedAccount}
              onAccountsDiscovered={handleAccountsDiscovered}
              onError={handleSourceError}
              setIsLoading={setIsLoading}
            />
          )}
          {activeSource === DataSource.GMAIL_OAUTH && (
            <GmailOAuthHandler
              onAccountsDiscovered={handleAccountsDiscovered}
              onError={handleSourceError}
              setIsLoading={setIsLoading}
            />
          )}
          {activeSource === DataSource.MICROSOFT_OAUTH && (
            <MicrosoftOAuthHandler
              onAccountsDiscovered={handleAccountsDiscovered}
              onError={handleSourceError}
              setIsLoading={setIsLoading}
            />
          )}
          {activeSource === DataSource.FACEBOOK_OAUTH && (
            <FacebookOAuthHandler
              onAccountsDiscovered={handleAccountsDiscovered}
              onError={handleSourceError}
              setIsLoading={setIsLoading}
            />
          )}
          {activeSource === DataSource.TWITTER_OAUTH && (
            <TwitterOAuthHandler
              onAccountsDiscovered={handleAccountsDiscovered}
              onError={handleSourceError}
              setIsLoading={setIsLoading}
            />
          )}
        </div>
      )}
    </div>
  );
};
