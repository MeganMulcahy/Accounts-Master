/**
 * Twitter/X OAuth handler component.
 */

import React, { useState } from 'react';
import { TwitterOAuthParser } from '../../utils/oauthParsers';
import { DiscoveredAccount } from '../../../shared/types';
import './OAuthHandler.css';

interface TwitterOAuthHandlerProps {
  onAccountsDiscovered: (accounts: DiscoveredAccount[]) => void;
  onError: (error: string) => void;
  setIsLoading: (loading: boolean) => void;
}

export const TwitterOAuthHandler: React.FC<TwitterOAuthHandlerProps> = ({
  onAccountsDiscovered,
  onError,
  setIsLoading,
}) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string>('');

  const CLIENT_ID = process.env.REACT_APP_TWITTER_CLIENT_ID || '';
  const REDIRECT_URI = 'http://localhost:5173/oauth/callback';
  const SCOPES = 'tweet.read users.read';

  const handleOAuth = () => {
    alert('OAuth implementation requires Twitter API v2 credentials. Please check the documentation.');
  };

  const handleFetchAccounts = async () => {
    if (!accessToken) {
      onError('Please authenticate first');
      return;
    }

    if (!accountEmail) {
      onError('Please enter your Twitter/X account email');
      return;
    }

    try {
      setIsLoading(true);
      const parser = new TwitterOAuthParser();
      const result = await parser.parse(accessToken, accountEmail);

      if (result.errors && result.errors.length > 0) {
        onError(result.errors.join('; '));
      } else {
        onAccountsDiscovered(result.accounts);
      }

      setAccessToken(null);
    } catch (error) {
      onError(`Failed to fetch accounts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="oauth-handler">
      <h3>Twitter/X OAuth Connection</h3>
      <p className="oauth-description">
        Connect your Twitter/X account to discover connected apps.
      </p>

      <div className="oauth-inputs">
        <input
          type="email"
          value={accountEmail}
          onChange={(e) => setAccountEmail(e.target.value)}
          placeholder="your-email@example.com"
          className="oauth-email-input"
        />
      </div>

      <div className="oauth-buttons">
        {!accessToken ? (
          <button onClick={handleOAuth} className="btn btn-primary">
            Authenticate with Twitter/X
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
    </div>
  );
};
