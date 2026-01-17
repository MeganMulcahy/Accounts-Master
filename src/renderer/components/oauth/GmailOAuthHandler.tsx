/**
 * Gmail OAuth handler component.
 * Handles OAuth authentication and account discovery for Gmail.
 * 
 * IMPORTANT: Tokens are stored in memory only and cleared after use.
 */

import React, { useState } from 'react';
import { GmailOAuthParser } from '../../utils/oauthParsers';
import { DiscoveredAccount } from '../../../shared/types';
import './OAuthHandler.css';

interface GmailOAuthHandlerProps {
  onAccountsDiscovered: (accounts: DiscoveredAccount[]) => void;
  onError: (error: string) => void;
  setIsLoading: (loading: boolean) => void;
}

export const GmailOAuthHandler: React.FC<GmailOAuthHandlerProps> = ({
  onAccountsDiscovered,
  onError,
  setIsLoading,
}) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string>('');

  // Gmail OAuth configuration
  const CLIENT_ID = process.env.REACT_APP_GMAIL_CLIENT_ID || '';
  const REDIRECT_URI = 'http://localhost:5173/oauth/callback';
  const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';

  const handleOAuth = () => {
    // Note: In a production app, you would need to set up OAuth flow
    // For now, this is a placeholder showing the structure
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(SCOPES)}&` +
      `access_type=offline&` +
      `prompt=consent`;

    // Open OAuth window
    // In Electron, you would use BrowserWindow for OAuth flow
    alert('OAuth implementation requires Gmail API credentials. Please check the documentation for setup instructions.');
  };

  const handleFetchAccounts = async () => {
    if (!accessToken) {
      onError('Please authenticate first');
      return;
    }

    if (!accountEmail) {
      onError('Please enter your Gmail account email');
      return;
    }

    try {
      setIsLoading(true);
      const parser = new GmailOAuthParser();
      const result = await parser.parse(accessToken, accountEmail);

      if (result.errors && result.errors.length > 0) {
        onError(result.errors.join('; '));
      } else {
        onAccountsDiscovered(result.accounts);
      }

      // Clear token from memory
      setAccessToken(null);
    } catch (error) {
      onError(`Failed to fetch accounts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="oauth-handler">
      <h3>Gmail OAuth Connection</h3>
      <p className="oauth-description">
        Connect your Gmail account to discover services from email senders.
        <br />
        <strong>Minimal read-only access. Token stored in memory only.</strong>
      </p>

      <div className="oauth-inputs">
        <input
          type="email"
          value={accountEmail}
          onChange={(e) => setAccountEmail(e.target.value)}
          placeholder="your-email@gmail.com"
          className="oauth-email-input"
        />
      </div>

      <div className="oauth-buttons">
        {!accessToken ? (
          <button onClick={handleOAuth} className="btn btn-primary">
            Authenticate with Gmail
          </button>
        ) : (
          <>
            <button onClick={handleFetchAccounts} className="btn btn-primary">
              Discover Accounts
            </button>
            <button onClick={() => setAccessToken(null)} className="btn btn-secondary">
              Clear Token
            </button>
          </>
        )}
      </div>

      <p className="oauth-note">
        <strong>Note:</strong> OAuth tokens are stored in memory only and cleared after use.
        No credentials are persisted.
      </p>
    </div>
  );
};
