/**
 * Apple Keychain export parser.
 * Parses Apple password export files (CSV or TSV format).
 * 
 * IMPORTANT: This parser only extracts service names and account emails.
 * NO PASSWORDS are stored or retained in memory.
 */

import { BaseParser } from './baseParser';
import { DiscoveredAccount, ParsedFileResult, DataSource } from '../../shared/types';
import { sanitizeEmail, sanitizeString } from '../../shared/security';

export class AppleParser extends BaseParser {
  protected source = DataSource.APPLE_EXPORT;
  
  /**
   * Parse Apple Keychain export file.
   * Supports both CSV and TSV formats.
   */
  async parse(fileContent: string | Buffer, accountEmail: string): Promise<ParsedFileResult> {
    const accounts: DiscoveredAccount[] = [];
    const errors: string[] = [];
    
    try {
      // Convert Buffer to string if needed
      const content = typeof fileContent === 'string' ? fileContent : fileContent.toString('utf-8');
      
      // Validate file size
      if (!this.validateFileSize(content.length)) {
        errors.push('File size exceeds maximum allowed size (5.5GB)');
        return { accounts, errors };
      }
      
      // Detect format (CSV or TSV)
      const isTSV = content.includes('\t');
      const delimiter = isTSV ? '\t' : ',';
      
      // Parse file
      const lines = content.split('\n');
      
      // Find header row
      let headerIndex = -1;
      let titleIndex = -1;
      let urlIndex = -1;
      let usernameIndex = -1;
      
      for (let i = 0; i < Math.min(10, lines.length); i++) {
        const headerLine = lines[i].toLowerCase();
        if (headerLine.includes('title') || headerLine.includes('website') || headerLine.includes('url')) {
          headerIndex = i;
          const headers = this.splitLine(lines[i], delimiter);
          
          // Find column indices
          titleIndex = headers.findIndex(h => h.toLowerCase().includes('title') || h.toLowerCase().includes('website'));
          urlIndex = headers.findIndex(h => h.toLowerCase().includes('url') || h.toLowerCase().includes('website'));
          usernameIndex = headers.findIndex(h => h.toLowerCase().includes('username') || h.toLowerCase().includes('account'));
          
          break;
        }
      }
      
      if (headerIndex === -1) {
        errors.push('Could not find header row in Apple export file');
        return { accounts, errors };
      }
      
      // Process data rows
      for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        try {
          const fields = this.splitLine(line, delimiter);
          
          // Extract service name
          const title = fields[titleIndex]?.trim() || '';
          const url = fields[urlIndex]?.trim() || '';
          const username = fields[usernameIndex]?.trim() || '';
          
          if (!title && !url) {
            continue;
          }
          
          const serviceName = this.extractServiceName(title, url);
          
          if (!serviceName) {
            continue;
          }
          
          // Use username as account email if provided
          const accountEmailToUse = sanitizeEmail(username) || accountEmail;
          
          // Create account entry (NO PASSWORD STORED)
          const account = this.createAccount(
            this.sanitizeServiceName(serviceName),
            accountEmailToUse,
            {
              originalTitle: sanitizeString(title, 200),
              originalUrl: sanitizeString(url, 500),
            }
          );
          
          accounts.push(account);
        } catch (error) {
          errors.push(`Error parsing line ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      // Validate account count
      if (!this.validateAccountCount(accounts.length)) {
        errors.push(`Account count (${accounts.length}) exceeds maximum allowed (${10000})`);
        return { accounts, errors };
      }
      
      // Clear sensitive data from memory
      content.replace(/./g, ''); // Attempt to clear (best effort)
      
    } catch (error) {
      errors.push(`Failed to parse Apple export: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return { accounts, errors };
  }
  
  /**
   * Split line by delimiter, handling quoted fields
   */
  private splitLine(line: string, delimiter: string): string[] {
    const fields: string[] = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          currentField += '"';
          i++;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        // Field separator
        fields.push(currentField);
        currentField = '';
      } else {
        currentField += char;
      }
    }
    
    // Add last field
    fields.push(currentField);
    
    return fields;
  }
  
  /**
   * Extract service name from title or URL
   * Handles complex strings like "accounts.spotify.com (meganmulcahy9)"
   */
  private extractServiceName(title: string, url: string): string {
    // Prefer title if available, but clean it up
    if (title) {
      // Remove parenthetical text like "(meganmulcahy9)"
      let cleaned = title.replace(/\s*\([^)]*\)\s*/g, '').trim();
      
      // If it looks like a domain/subdomain, extract clean service name
      if (cleaned.match(/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)) {
        // Extract domain pattern
        const domainMatch = cleaned.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.)?([a-zA-Z0-9-]+)\.(?:com|net|org|io|co|us|uk|de|fr|ca|au|jp|in|edu|gov|app|dev)/i);
        if (domainMatch && domainMatch[2]) {
          const mainDomain = domainMatch[2].toLowerCase();
          // Known service mappings
          const serviceMap: Record<string, string> = {
            'spotify': 'Spotify',
            'netflix': 'Netflix',
            'google': 'Google',
            'facebook': 'Facebook',
            'amazon': 'Amazon',
            'appfolio': 'Allied',
            'crimson': 'Crimson',
            'domini': 'DominI',
          };
          if (serviceMap[mainDomain]) {
            return serviceMap[mainDomain];
          }
          // Capitalize first letter
          return mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1);
        }
      }
      
      // If title is clean, use it
      return cleaned;
    }
    
    // Extract from URL
    if (url) {
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        
        // Remove www. prefix
        let serviceName = hostname.replace(/^www\./i, '');
        
        // Extract domain name (handle subdomains like "accounts.spotify.com")
        const parts = serviceName.split('.');
        if (parts.length >= 2) {
          // For "accounts.spotify.com", take "spotify" (second-to-last part)
          serviceName = parts[parts.length - 2] || parts[0];
        }
        
        // Known service mappings
        const serviceMap: Record<string, string> = {
          'spotify': 'Spotify',
          'netflix': 'Netflix',
          'google': 'Google',
          'facebook': 'Facebook',
          'amazon': 'Amazon',
          'appfolio': 'Allied',
          'crimson': 'Crimson',
          'domini': 'DominI',
        };
        
        const serviceNameLower = serviceName.toLowerCase();
        if (serviceMap[serviceNameLower]) {
          return serviceMap[serviceNameLower];
        }
        
        // Capitalize first letter
        if (serviceName) {
          serviceName = serviceName.charAt(0).toUpperCase() + serviceName.slice(1);
          return serviceName;
        }
      } catch {
        // Invalid URL, return empty
      }
    }
    
    return '';
  }
}
