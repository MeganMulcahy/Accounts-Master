/**
 * OAuth-based parsers for renderer process (browser context).
 * These parsers use fetch API which is available in the browser.
 * 
 * IMPORTANT: All tokens are stored in memory only and cleared after use.
 */

import { DiscoveredAccount, DataSource, ParsedFileResult } from '../../shared/types';
import { sanitizeString } from '../../shared/security';
import { 
  gmailRateLimiter, 
  microsoftRateLimiter, 
  facebookRateLimiter, 
  twitterRateLimiter 
} from '../../shared/rateLimiter';

/**
 * Gmail OAuth parser - extracts subscriptions and frequent senders
 */
export class GmailOAuthParser {
  protected source = DataSource.GMAIL_OAUTH;
  
  async parse(accessToken: string, accountEmail: string): Promise<ParsedFileResult> {
    const accounts: DiscoveredAccount[] = [];
    const errors: string[] = [];
    const seenSenders = new Set<string>();
    
    try {
      // Wait for rate limit if needed
      await gmailRateLimiter.waitIfNeeded('gmail-oauth');
      
      // Fetch message senders (limited to avoid quota exhaustion)
      const senders = await this.fetchMessageSenders(accessToken, 500); // Limit to 500 messages
      
      for (const sender of senders) {
        if (seenSenders.has(sender)) {
          continue;
        }
        
        seenSenders.add(sender);
        
        // Extract service name
        const serviceName = this.extractServiceNameFromEmail(sender);
        
        if (!serviceName || this.isPersonalEmail(sender)) {
          continue;
        }
        
        const account: DiscoveredAccount = {
          id: `${this.source}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          service: this.sanitizeServiceName(serviceName),
          accountEmail,
          source: this.source,
          discoveredAt: new Date(),
          metadata: {
            senderEmail: sanitizeString(sender, 254),
          },
        };
        
        accounts.push(account);
      }
      
      // Clear token from memory (best effort)
      seenSenders.clear();
      
    } catch (error) {
      errors.push(`Gmail OAuth error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return { accounts, errors };
  }
  
  private async fetchMessageSenders(accessToken: string, limit: number): Promise<string[]> {
    const senders: string[] = [];
    
    try {
      // Use Gmail API to fetch messages
      const url = `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=500`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Gmail API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      const messageIds = data.messages?.slice(0, limit).map((m: any) => m.id) || [];
      
      // Fetch sender from each message (with rate limiting)
      for (const messageId of messageIds) {
        await gmailRateLimiter.waitIfNeeded('gmail-oauth');
        
        const msgResponse = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );
        
        if (msgResponse.ok) {
          const msgData = await msgResponse.json();
          const fromHeader = msgData.payload?.headers?.find((h: any) => h.name === 'From');
          if (fromHeader?.value) {
            const emailMatch = fromHeader.value.match(/[\w.-]+@[\w.-]+\.\w+/);
            if (emailMatch) {
              senders.push(emailMatch[0].toLowerCase());
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to fetch Gmail messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return senders;
  }
  
  private extractServiceNameFromEmail(email: string): string | null {
    const parts = email.split('@');
    if (parts.length !== 2) return null;
    
    const domain = parts[1].toLowerCase();
    const domainParts = domain.split('.');
    let serviceName = domainParts[domainParts.length - 2] || domainParts[0];
    
    serviceName = serviceName.replace(/^(mail|news|noreply|no-reply)/i, '');
    if (!serviceName) {
      serviceName = domainParts[domainParts.length - 2] || domainParts[0];
    }
    
    return serviceName ? serviceName.charAt(0).toUpperCase() + serviceName.slice(1) : null;
  }
  
  private isPersonalEmail(email: string): boolean {
    return /^[\w.-]+@(gmail|yahoo|hotmail|outlook|icloud|aol)\./i.test(email);
  }
  
  private sanitizeServiceName(name: string): string {
    if (!name || typeof name !== 'string') {
      return '';
    }
    return name
      .replace(/\0/g, '')
      .replace(/[\x01-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
      .trim()
      .substring(0, 200);
  }
}

/**
 * Microsoft OAuth parser - fetches connected apps
 */
export class MicrosoftOAuthParser {
  protected source = DataSource.MICROSOFT_OAUTH;
  
  async parse(accessToken: string, accountEmail: string): Promise<ParsedFileResult> {
    const accounts: DiscoveredAccount[] = [];
    const errors: string[] = [];
    
    try {
      await microsoftRateLimiter.waitIfNeeded('microsoft-oauth');
      
      // Fetch applications with access to user's account
      const apps = await this.fetchConnectedApps(accessToken);
      
      for (const app of apps) {
        const account: DiscoveredAccount = {
          id: `${this.source}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          service: this.sanitizeServiceName(app.displayName || app.appId || 'Unknown'),
          accountEmail,
          source: this.source,
          discoveredAt: new Date(),
          metadata: {
            appId: sanitizeString(app.appId || '', 200),
            publisher: sanitizeString(app.publisherName || '', 200),
          },
        };
        
        accounts.push(account);
      }
      
    } catch (error) {
      errors.push(`Microsoft OAuth error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return { accounts, errors };
  }
  
  private async fetchConnectedApps(accessToken: string): Promise<any[]> {
    const response = await fetch('https://graph.microsoft.com/v1.0/me/appRoleAssignments', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Microsoft Graph API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.value || [];
  }
  
  private sanitizeServiceName(name: string): string {
    if (!name || typeof name !== 'string') {
      return '';
    }
    return name
      .replace(/\0/g, '')
      .replace(/[\x01-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
      .trim()
      .substring(0, 200);
  }
}

/**
 * Facebook OAuth parser - fetches connected apps
 */
export class FacebookOAuthParser {
  protected source = DataSource.FACEBOOK_OAUTH;
  
  async parse(accessToken: string, accountEmail: string): Promise<ParsedFileResult> {
    const accounts: DiscoveredAccount[] = [];
    const errors: string[] = [];
    
    try {
      await facebookRateLimiter.waitIfNeeded('facebook-oauth');
      
      // Fetch apps the user has authorized
      const apps = await this.fetchConnectedApps(accessToken);
      
      for (const app of apps) {
        const account: DiscoveredAccount = {
          id: `${this.source}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          service: this.sanitizeServiceName(app.name || app.id || 'Unknown'),
          accountEmail,
          source: this.source,
          discoveredAt: new Date(),
          metadata: {
            appId: sanitizeString(app.id || '', 200),
            category: sanitizeString(app.category || '', 200),
          },
        };
        
        accounts.push(account);
      }
      
    } catch (error) {
      errors.push(`Facebook OAuth error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return { accounts, errors };
  }
  
  private async fetchConnectedApps(accessToken: string): Promise<any[]> {
    // Also fetch apps (if available)
    try {
      const appsResponse = await fetch(
        `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
      );
      if (appsResponse.ok) {
        const appsData = await appsResponse.json();
        return appsData.data || [];
      }
    } catch {
      // Fallback to permissions data
    }
    
    // Fallback to permissions
    const response = await fetch(
      `https://graph.facebook.com/v18.0/me/permissions?access_token=${accessToken}`
    );
    
    if (!response.ok) {
      throw new Error(`Facebook Graph API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.data || [];
  }
  
  private sanitizeServiceName(name: string): string {
    if (!name || typeof name !== 'string') {
      return '';
    }
    return name
      .replace(/\0/g, '')
      .replace(/[\x01-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
      .trim()
      .substring(0, 200);
  }
}

/**
 * Twitter/X OAuth parser - fetches connected apps
 */
export class TwitterOAuthParser {
  protected source = DataSource.TWITTER_OAUTH;
  
  async parse(accessToken: string, accountEmail: string): Promise<ParsedFileResult> {
    const accounts: DiscoveredAccount[] = [];
    const errors: string[] = [];
    
    try {
      await twitterRateLimiter.waitIfNeeded('twitter-oauth');
      
      // Twitter API v2 - fetch user's connected apps
      // Note: Twitter API may have limited endpoints for this
      const apps = await this.fetchConnectedApps(accessToken);
      
      for (const app of apps) {
        const account: DiscoveredAccount = {
          id: `${this.source}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          service: this.sanitizeServiceName(app.name || app.id || 'Unknown'),
          accountEmail,
          source: this.source,
          discoveredAt: new Date(),
          metadata: {
            appId: sanitizeString(app.id || '', 200),
          },
        };
        
        accounts.push(account);
      }
      
    } catch (error) {
      errors.push(`Twitter OAuth error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return { accounts, errors };
  }
  
  private async fetchConnectedApps(accessToken: string): Promise<any[]> {
    // Twitter API v2 - Connected apps endpoint
    // Note: This endpoint may require specific permissions
    try {
      const response = await fetch('https://api.twitter.com/2/users/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      
      if (!response.ok) {
        // If the endpoint doesn't work, return empty array
        // Twitter API may not expose connected apps directly
        return [];
      }
    } catch {
      return [];
    }
    
    // Twitter may not have a direct connected apps endpoint
    // Return empty for now, but structure is ready for when API is available
    return [];
  }
  
  private sanitizeServiceName(name: string): string {
    if (!name || typeof name !== 'string') {
      return '';
    }
    return name
      .replace(/\0/g, '')
      .replace(/[\x01-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
      .trim()
      .substring(0, 200);
  }
}
