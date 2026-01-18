/**
 * AI-Assisted Link Discovery Module
 * Finds official "Change Password" and "Delete Account" pages for discovered services.
 * 
 * IMPORTANT SAFETY CONSTRAINTS:
 * - NEVER attempts to log into any service
 * - NEVER submits forms or performs actions
 * - ONLY searches for public help and settings URLs
 * - No credentials may ever be used
 * - READ-ONLY discovery feature
 */

export interface DiscoveredLink {
  /** The discovered URL */
  url: string;
  /** Type of link (change-password, delete-account, security-settings, homepage) */
  type: 'change-password' | 'delete-account' | 'security-settings' | 'homepage';
  /** Confidence score (0-1) indicating reliability */
  confidence: number;
  /** Source domain of the URL */
  domain: string;
  /** Title/description of the link (if available) */
  title?: string;
}

export interface LinkDiscoveryResult {
  /** Service name */
  service: string;
  /** Discovered links */
  links: DiscoveredLink[];
  /** Any errors encountered */
  errors: string[];
}

/**
 * LinkFinder - Core service for discovering account management links
 */
export class LinkFinder {
  /**
   * Discover links for a service
   * Uses heuristics and search to find official account management pages
   */
  async discoverLinks(
    serviceName: string,
    serviceDomain?: string
  ): Promise<LinkDiscoveryResult> {
    const errors: string[] = [];
    const links: DiscoveredLink[] = [];

    try {
      // Extract domain from service name if not provided
      const domain = serviceDomain || this.extractDomainFromService(serviceName);

      // Generate search queries
      const queries = this.generateSearchQueries(serviceName, domain);

      // Search for each link type
      const changePasswordLink = await this.searchForLink(
        queries.changePassword,
        domain,
        'change-password'
      );
      if (changePasswordLink) {
        links.push(changePasswordLink);
      }

      const deleteAccountLink = await this.searchForLink(
        queries.deleteAccount,
        domain,
        'delete-account'
      );
      if (deleteAccountLink) {
        links.push(deleteAccountLink);
      }

      const securityLink = await this.searchForLink(
        queries.securitySettings,
        domain,
        'security-settings'
      );
      if (securityLink) {
        links.push(securityLink);
      }

      // Search for homepage link
      const homepageLink = this.discoverHomepageLink(domain);
      if (homepageLink) {
        links.push(homepageLink);
      }

      // Also try heuristic-based discovery for known patterns
      const heuristicLinks = this.discoverLinksHeuristically(domain);
      links.push(...heuristicLinks);

      // Deduplicate and sort by confidence
      const uniqueLinks = this.deduplicateLinks(links);
      uniqueLinks.sort((a, b) => b.confidence - a.confidence);

      return {
        service: serviceName,
        links: uniqueLinks,
        errors,
      };
    } catch (error) {
      errors.push(
        `Failed to discover links: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return {
        service: serviceName,
        links: [],
        errors,
      };
    }
  }

  /**
   * Generate structured search queries for a service
   */
  private generateSearchQueries(
    serviceName: string,
    domain: string
  ): {
    changePassword: string[];
    deleteAccount: string[];
    securitySettings: string[];
  } {
    const baseQueries = [
      `${serviceName}`,
      domain.includes('.') ? domain.split('.')[0] : domain,
    ].filter(Boolean);

    return {
      changePassword: [
        ...baseQueries.map(base => `${base} change password page`),
        ...baseQueries.map(base => `${base} reset password official`),
        `${domain} password settings`,
        `${domain} change password`,
      ],
      deleteAccount: [
        ...baseQueries.map(base => `${base} delete account page`),
        ...baseQueries.map(base => `${base} close account official`),
        ...baseQueries.map(base => `${base} cancel account`),
        `${domain} delete account`,
        `${domain} close account`,
      ],
      securitySettings: [
        ...baseQueries.map(base => `${base} security settings`),
        ...baseQueries.map(base => `${base} account settings`),
        `${domain} security`,
        `${domain} account settings`,
      ],
    };
  }

  /**
   * Search for a specific link type using heuristics
   * In a full implementation, this would use a search API or AI model
   * For now, we'll use heuristic-based discovery
   */
  private async searchForLink(
    queries: string[],
    domain: string,
    type: DiscoveredLink['type']
  ): Promise<DiscoveredLink | null> {
    // Try heuristic discovery first (faster, no external calls)
    const heuristicUrl = this.findHeuristicUrl(domain, type);
    if (heuristicUrl) {
      return {
        url: heuristicUrl,
        type,
        confidence: 0.8, // High confidence for official domain patterns
        domain,
      };
    }

    // In a production implementation, you would:
    // 1. Call a search API (Google Custom Search, DuckDuckGo API, etc.)
    // 2. Parse search results
    // 3. Filter for official domain matches
    // 4. Score results based on domain match and keywords

    // For now, return null - the heuristic discovery will handle common cases
    return null;
  }

  /**
   * Discover links using domain-based heuristics
   * Tries common URL patterns on the service domain
   */
  private discoverLinksHeuristically(domain: string): DiscoveredLink[] {
    const links: DiscoveredLink[] = [];

    if (!domain || !this.isValidDomain(domain)) {
      return links;
    }

    const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;

    // Common URL patterns for account management
    const patterns = [
      { path: '/account/password', type: 'change-password' as const },
      { path: '/settings/password', type: 'change-password' as const },
      { path: '/password', type: 'change-password' as const },
      { path: '/security/password', type: 'change-password' as const },
      { path: '/account/delete', type: 'delete-account' as const },
      { path: '/account/close', type: 'delete-account' as const },
      { path: '/settings/delete-account', type: 'delete-account' as const },
      { path: '/delete-account', type: 'delete-account' as const },
      { path: '/account/security', type: 'security-settings' as const },
      { path: '/settings/security', type: 'security-settings' as const },
      { path: '/security', type: 'security-settings' as const },
      { path: '/account/settings', type: 'security-settings' as const },
    ];

    for (const pattern of patterns) {
      const url = `${baseUrl}${pattern.path}`;
      links.push({
        url,
        type: pattern.type,
        confidence: this.calculateConfidence(url, pattern.type, domain),
        domain,
      });
    }

    return links;
  }

  /**
   * Find heuristic URL for a specific type
   */
  private findHeuristicUrl(
    domain: string,
    type: DiscoveredLink['type']
  ): string | null {
    if (!domain || !this.isValidDomain(domain)) {
      return null;
    }

    const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;

    const typePatterns: Partial<Record<DiscoveredLink['type'], string[]>> = {
      'change-password': [
        '/account/password',
        '/settings/password',
        '/password',
        '/security/password',
      ],
      'delete-account': [
        '/account/delete',
        '/account/close',
        '/settings/delete-account',
        '/delete-account',
      ],
      'security-settings': [
        '/account/security',
        '/settings/security',
        '/security',
        '/account/settings',
      ],
    };

    // Return first pattern (most common) - in production, you'd test URLs
    const patterns = typePatterns[type];
    if (!patterns || patterns.length === 0) {
      return null;
    }
    return `${baseUrl}${patterns[0]}`;
  }

  /**
   * Calculate confidence score for a discovered link
   */
  private calculateConfidence(
    url: string,
    type: DiscoveredLink['type'],
    expectedDomain: string
  ): number {
    let confidence = 0.5; // Base confidence

    // Domain match bonus
    try {
      const urlObj = new URL(url);
      const urlDomain = urlObj.hostname.replace(/^www\./, '');
      const expected = expectedDomain.replace(/^www\./, '').replace(/^https?:\/\//, '');

      if (urlDomain === expected || urlDomain.endsWith(`.${expected}`)) {
        confidence += 0.3; // Strong domain match
      } else if (urlDomain.includes(expected) || expected.includes(urlDomain)) {
        confidence += 0.1; // Partial match
      } else {
        confidence -= 0.3; // Different domain, reduce confidence
      }
    } catch {
      confidence -= 0.2; // Invalid URL
    }

    // HTTPS bonus
    if (url.startsWith('https://')) {
      confidence += 0.1;
    }

    // Path keyword bonus
    const urlLower = url.toLowerCase();
    const typeKeywords: Partial<Record<DiscoveredLink['type'], string[]>> = {
      'change-password': ['password', 'reset', 'change'],
      'delete-account': ['delete', 'close', 'remove', 'cancel'],
      'security-settings': ['security', 'settings', 'account'],
      'homepage': ['home', 'index', 'main'],
    };

    const keywords = typeKeywords[type] || [];
    const keywordMatches = keywords.filter(keyword => urlLower.includes(keyword)).length;
    confidence += keywordMatches * 0.05;

    // Penalize non-official patterns
    if (urlLower.includes('forum') || urlLower.includes('blog') || urlLower.includes('community')) {
      confidence -= 0.2;
    }

    // Penalize third-party domains
    const thirdPartyDomains = ['reddit.com', 'stackoverflow.com', 'quora.com', 'medium.com'];
    if (thirdPartyDomains.some(domain => urlLower.includes(domain))) {
      confidence -= 0.4;
    }

    return Math.max(0, Math.min(1, confidence)); // Clamp between 0 and 1
  }

  /**
   * Extract domain from service name
   */
  private extractDomainFromService(serviceName: string): string {
    // Try to infer domain from service name
    const cleaned = serviceName.toLowerCase().trim();

    // Common patterns
    if (cleaned.includes('.')) {
      // Already looks like a domain
      return cleaned;
    }

    // Try adding .com
    return `${cleaned}.com`;
  }

  /**
   * Validate if a string is a valid domain
   */
  private isValidDomain(domain: string): boolean {
    if (!domain || domain.length < 3) {
      return false;
    }

    // Basic domain validation
    const domainPattern = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;
    return domainPattern.test(domain.replace(/^https?:\/\//, '').replace(/^www\./, ''));
  }

  /**
   * Discover homepage link for a service
   */
  private discoverHomepageLink(domain: string): DiscoveredLink | null {
    if (!domain || !this.isValidDomain(domain)) {
      return null;
    }

    const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
    const homepageUrl = baseUrl;

    return {
      url: homepageUrl,
      type: 'homepage',
      confidence: 0.9, // High confidence for domain-based homepage
      domain,
      title: 'Homepage',
    };
  }

  /**
   * Deduplicate links, keeping highest confidence
   */
  private deduplicateLinks(links: DiscoveredLink[]): DiscoveredLink[] {
    const linkMap = new Map<string, DiscoveredLink>();

    for (const link of links) {
      const key = `${link.type}:${link.url}`;
      const existing = linkMap.get(key);

      if (!existing || link.confidence > existing.confidence) {
        linkMap.set(key, link);
      }
    }

    return Array.from(linkMap.values());
  }
}

// Export singleton instance
export const linkFinder = new LinkFinder();
