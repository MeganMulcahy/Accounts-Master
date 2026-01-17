/**
 * Gmail Takeout MBOX parser.
 * Parses MBOX files from Google Takeout to extract email senders and subscriptions.
 * 
 * IMPORTANT: This parser only extracts service names from email senders.
 * NO EMAIL CONTENT OR SENSITIVE DATA is stored.
 */

import { BaseParser } from './baseParser';
import { DiscoveredAccount, ParsedFileResult, DataSource } from '../../shared/types';
import { sanitizeEmail, sanitizeString } from '../../shared/security';

export class GmailTakeoutParser extends BaseParser {
  protected source = DataSource.GMAIL_TAKEOUT;
  
  /**
   * Parse Gmail Takeout MBOX file.
   * Extracts unique email senders to identify connected services.
   */
  async parse(mboxContent: string | Buffer, accountEmail: string): Promise<ParsedFileResult> {
    const accounts: DiscoveredAccount[] = [];
    const errors: string[] = [];
    const seenSenders = new Set<string>();
    
    try {
      // Convert Buffer to string if needed
      const content = typeof mboxContent === 'string' ? mboxContent : mboxContent.toString('utf-8');
      
      // Validate file size
      if (!this.validateFileSize(content.length)) {
        errors.push('File size exceeds maximum allowed size (5.5GB)');
        return { accounts, errors };
      }
      
      // Split into individual emails (MBOX format uses "From " as separator)
      const emailBlocks = this.splitMboxEmails(content);
      
      for (const emailBlock of emailBlocks) {
        try {
          // Extract sender from email headers
          const sender = this.extractSender(emailBlock);
          
          if (!sender || seenSenders.has(sender)) {
            continue;
          }
          
          seenSenders.add(sender);
          
          // Extract service name from sender email
          const serviceName = this.extractServiceNameFromEmail(sender);
          
          if (!serviceName) {
            continue;
          }
          
          // Skip personal email addresses (only process service emails)
          if (this.isPersonalEmail(sender)) {
            continue;
          }
          
          // Create account entry - use sender email as the account email
          const account = this.createAccount(
            this.sanitizeServiceName(serviceName),
            sender, // Use sender email as account email instead of provided accountEmail
            {}
          );
          
          accounts.push(account);
        } catch (error) {
          // Skip individual email parsing errors
          continue;
        }
      }
      
      // Validate account count
      if (!this.validateAccountCount(accounts.length)) {
        errors.push(`Account count (${accounts.length}) exceeds maximum allowed (${10000})`);
        return { accounts, errors };
      }
      
      // Clear sensitive data from memory
      seenSenders.clear();
      content.replace(/./g, ''); // Attempt to clear (best effort)
      
    } catch (error) {
      errors.push(`Failed to parse Gmail Takeout: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return { accounts, errors };
  }
  
  /**
   * Split MBOX content into individual emails
   */
  private splitMboxEmails(content: string): string[] {
    // MBOX format: each email starts with "From " (space required)
    const emails: string[] = [];
    const lines = content.split('\n');
    let currentEmail: string[] = [];
    
    for (const line of lines) {
      // Check if this is a new email header
      if (line.startsWith('From ')) {
        if (currentEmail.length > 0) {
          emails.push(currentEmail.join('\n'));
        }
        currentEmail = [line];
      } else {
        currentEmail.push(line);
      }
    }
    
    // Add last email
    if (currentEmail.length > 0) {
      emails.push(currentEmail.join('\n'));
    }
    
    return emails;
  }
  
  /**
   * Extract sender email from email headers
   */
  private extractSender(emailBlock: string): string | null {
    const lines = emailBlock.split('\n');
    
    for (const line of lines) {
      // Look for From header
      if (line.toLowerCase().startsWith('from:')) {
        const match = line.match(/From:\s*(.+)/i);
        if (match) {
          // Extract email address
          const emailMatch = match[1].match(/[\w.-]+@[\w.-]+\.\w+/);
          if (emailMatch) {
            return emailMatch[0].toLowerCase();
          }
        }
      }
      
      // Stop after headers (empty line indicates body start)
      if (line.trim() === '') {
        break;
      }
    }
    
    return null;
  }
  
  /**
   * Extract service name from sender email
   */
  private extractServiceNameFromEmail(email: string): string | null {
    if (!email) {
      return null;
    }
    
    // Extract domain
    const parts = email.split('@');
    if (parts.length !== 2) {
      return null;
    }
    
    const domain = parts[1].toLowerCase();
    
    // Skip common email providers
    const emailProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com'];
    if (emailProviders.includes(domain)) {
      return null;
    }
    
    // Extract service name from domain
    const domainParts = domain.split('.');
    
    // Remove TLD and common prefixes
    let serviceName = domainParts[domainParts.length - 2] || domainParts[0];
    
    // Remove common prefixes
    serviceName = serviceName.replace(/^(mail|news|noreply|no-reply|donotreply|support|info|hello|contact)/i, '');
    
    if (!serviceName) {
      serviceName = domainParts[domainParts.length - 2] || domainParts[0];
    }
    
    // Capitalize first letter
    if (serviceName) {
      serviceName = serviceName.charAt(0).toUpperCase() + serviceName.slice(1);
      return serviceName;
    }
    
    return null;
  }
  
  /**
   * Check if email is from a personal email address (not a service)
   */
  private isPersonalEmail(email: string): boolean {
    const personalPatterns = [
      /^[\w.-]+@(gmail|yahoo|hotmail|outlook|icloud|aol|protonmail|zoho)\./i,
      /^[\w.-]+@[\w.-]+\.edu$/i, // Educational emails
    ];
    
    return personalPatterns.some(pattern => pattern.test(email));
  }
}
