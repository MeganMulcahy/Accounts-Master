/**
 * Microsoft OAuth handler component.
 * Handles OAuth authentication and account discovery for Microsoft.
 */

import React, { useState } from 'react';
import { MicrosoftOAuthParser } from '../../utils/oauthParsers';
import { DiscoveredAccount } from '../../../shared/types';
import './OAuthHandler.css';

interface MicrosoftOAuthHandlerProps {
  onAccountsDiscovered: (accounts: DiscoveredAccount[]) => void;
  onError: (error: string) => void;
  setIsLoading: (loading: boolean) => void;
}

export const MicrosoftOAuthHandler: React.FC<MicrosoftOAuthHandlerProps> = ({
  onAccountsDiscovered,
  onError,
  setIsLoading,
}) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string>('');

  const CLIENT_ID = process.env.REACT_APP_MICROSOFT_CLIENT_ID || '';
  const REDIRECT_URI = 'http://localhost:5173/oauth/callback';
  const SCOPES = 'User.Read offline_access';

  const handleOAuth = () => {
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
      `client_id=${CLIENT_ID}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
      `response_mode=query&` +
      `scope=${encodeURIComponent(SCOPES)}`;

    alert('OAuth implementation requires Microsoft Azure AD app registration. Please check the documentation.');
  };

  const handleFetchAccounts = async () => {
    if (!accessToken) {
      onError('Please authenticate first');
      return;
    }

    if (!accountEmail) {
      onError('Please enter your Microsoft account email');
      return;
    }

    try {
      setIsLoading(true);
      const parser = new MicrosoftOAuthParser();
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
      <h3>Microsoft OAuth Connection</h3>
      <p className="oauth-description">
        Connect your Microsoft account to discover connected apps.
      </p>

      <div className="oauth-inputs">
        <input
          type="email"
          value={accountEmail}
          onChange={(e) => setAccountEmail(e.target.value)}
          placeholder="your-email@outlook.com"
          className="oauth-email-input"
        />
      </div>

      <div className="oauth-buttons">
        {!accessToken ? (
          <button onClick={handleOAuth} className="btn btn-primary">
            Authenticate with Microsoft
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
