/**
 * Chrome saved passwords CSV parser.
 * Parses Chrome password export files (CSV format).
 * 
 * IMPORTANT: This parser only extracts service names and account emails.
 * NO PASSWORDS are stored or retained in memory.
 */

import { BaseParser } from './baseParser';
import { DiscoveredAccount, ParsedFileResult, DataSource } from '../../shared/types';
import { sanitizeEmail, sanitizeString } from '../../shared/security';

export class ChromeParser extends BaseParser {
  protected source = DataSource.CHROME_CSV;
  
  /**
   * Parse Chrome passwords CSV file.
   * Expected format:
   * name,url,username,password
   * Example:
   * GitHub,https://github.com,user@example.com,password123
   */
  async parse(csvContent: string | Buffer, accountEmail: string): Promise<ParsedFileResult> {
    const accounts: DiscoveredAccount[] = [];
    const errors: string[] = [];
    
    try {
      // Convert Buffer to string if needed
      const content = typeof csvContent === 'string' ? csvContent : csvContent.toString('utf-8');
      
      // Validate file size
      if (!this.validateFileSize(content.length)) {
        errors.push('File size exceeds maximum allowed size (5.5GB)');
        return { accounts, errors };
      }
      
      // Parse CSV (simple CSV parser - handles basic cases)
      const lines = content.split('\n');
      
      // Skip header row if present
      let startIndex = 0;
      if (lines[0] && lines[0].toLowerCase().includes('name')) {
        startIndex = 1;
      }
      
      // Process each line
      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        try {
          const parsed = this.parseCSVLine(line);
          
          if (!parsed) {
            continue;
          }
          
          const { name, url, username } = parsed;
          
          // Extract service name from URL or name field
          const serviceName = this.extractServiceName(name, url);
          
          if (!serviceName) {
            continue;
          }
          
          // Use username as account email if provided, otherwise use the source account email
          const accountEmailToUse = sanitizeEmail(username) || accountEmail;
          
          // Create account entry (NO PASSWORD STORED)
          const account = this.createAccount(
            this.sanitizeServiceName(serviceName),
            accountEmailToUse,
            {
              originalName: sanitizeString(name, 200),
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
      errors.push(`Failed to parse Chrome CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return { accounts, errors };
  }
  
  /**
   * Parse a single CSV line (handles quoted fields)
   */
  private parseCSVLine(line: string): { name: string; url: string; username: string } | null {
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
      } else if (char === ',' && !inQuotes) {
        // Field separator
        fields.push(currentField);
        currentField = '';
      } else {
        currentField += char;
      }
    }
    
    // Add last field
    fields.push(currentField);
    
    // Expected format: name,url,username,password
    if (fields.length >= 4) {
      return {
        name: fields[0].trim(),
        url: fields[1].trim(),
        username: fields[2].trim(),
      };
    }
    
    return null;
  }
  
  /**
   * Extract service name from URL or name field
   * Handles complex strings like "accounts.spotify.com (meganmulcahy9)"
   */
  private extractServiceName(name: string, url: string): string {
    // Try to extract from name field first (might contain domain-like strings)
    if (name) {
      // Remove parenthetical text like "(meganmulcahy9)"
      let cleaned = name.replace(/\s*\([^)]*\)\s*/g, '').trim();
      
      // If it looks like a domain/subdomain, extract clean service name
      if (cleaned.match(/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)) {
        // Extract domain pattern (handle both with and without protocol)
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
    }
    
    // Try to extract from URL
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
        // Invalid URL, continue to name field
      }
    }
    
    // Fall back to cleaned name field
    if (name) {
      return name.replace(/\s*\([^)]*\)\s*/g, '').trim();
    }
    
    return '';
  }
}
