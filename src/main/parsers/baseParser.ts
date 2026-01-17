/**
 * Base parser interface for all data source parsers.
 * All parsers must implement this interface to ensure consistent behavior.
 */

import { DiscoveredAccount, ParsedFileResult, DataSource } from '../../shared/types';
import { validateFileSize, validateAccountCount } from '../../shared/security';

export abstract class BaseParser {
  protected abstract source: DataSource;
  
  /**
   * Parse a file or data source and extract discovered accounts.
   * This method must NOT store any passwords or credentials.
   */
  abstract parse(data: string | Buffer, accountEmail: string): Promise<ParsedFileResult>;
  
  /**
   * Validate file size before parsing
   */
  protected validateFileSize(size: number): boolean {
    return validateFileSize(size);
  }
  
  /**
   * Validate account count after parsing
   */
  protected validateAccountCount(count: number): boolean {
    return validateAccountCount(count);
  }
  
  /**
   * Creates a discovered account entry
   */
  protected createAccount(
    service: string,
    accountEmail: string,
    metadata?: Record<string, string>
  ): DiscoveredAccount {
    const id = `${this.source}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      id,
      service,
      accountEmail,
      source: this.source,
      discoveredAt: new Date(),
      metadata,
    };
  }
  
  /**
   * Sanitizes service name to remove invalid characters
   */
  protected sanitizeServiceName(name: string): string {
    if (!name || typeof name !== 'string') {
      return '';
    }
    
    // Remove null bytes, control characters, and excessive whitespace
    return name
      .replace(/\0/g, '')
      .replace(/[\x01-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
      .trim()
      .substring(0, 200); // Limit length
  }
}
