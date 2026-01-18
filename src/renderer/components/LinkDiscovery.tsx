/**
 * Link Discovery Component
 * Displays discovered links (Change Password, Delete Account) for accounts
 * and allows user confirmation before storing
 */

import React, { useState } from 'react';
import { DiscoveredLink } from '@shared/linkFinder';
import { ExternalLink } from './ExternalLink';
import './LinkDiscovery.css';

interface LinkDiscoveryProps {
  accountId: string;
  serviceName: string;
  serviceDomain?: string;
  existingLinks?: Record<string, string>; // Map of link type to URL
  onConfirmLinks: (accountId: string, links: Record<string, string>) => void;
}

export function LinkDiscovery({
  accountId,
  serviceName,
  serviceDomain,
  existingLinks = {},
  onConfirmLinks,
}: LinkDiscoveryProps) {
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredLinks, setDiscoveredLinks] = useState<DiscoveredLink[]>([]);
  const [confirmedLinks, setConfirmedLinks] = useState<Record<string, string>>(existingLinks);
  const [errors, setErrors] = useState<string[]>([]);
  const [showResults, setShowResults] = useState(false);

  const handleDiscover = async () => {
    setIsDiscovering(true);
    setErrors([]);
    setShowResults(false);

    try {
      if (!window.electronAPI?.discoverLinks) {
        setErrors(['Link discovery not available']);
        return;
      }

      // Extract domain from service if needed
      const domain = serviceDomain || extractDomainFromService(serviceName);

      const result = await window.electronAPI.discoverLinks(serviceName, domain);

      if (result.errors && result.errors.length > 0) {
        setErrors(result.errors);
      }

      if (result.links && result.links.length > 0) {
        setDiscoveredLinks(result.links);
        setShowResults(true);
      } else {
        setErrors(['No links found. Try manual search.']);
      }
    } catch (error) {
      setErrors([`Discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`]);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleConfirmLink = (link: DiscoveredLink) => {
    const newConfirmedLinks = {
      ...confirmedLinks,
      [link.type]: link.url,
    };
    setConfirmedLinks(newConfirmedLinks);
    onConfirmLinks(accountId, newConfirmedLinks);
  };

  const handleEditLink = (type: string, url: string) => {
    const newUrl = prompt(`Edit ${getLinkTypeLabel(type)} URL:`, url);
    if (newUrl && newUrl.trim()) {
      const newConfirmedLinks = {
        ...confirmedLinks,
        [type]: newUrl.trim(),
      };
      setConfirmedLinks(newConfirmedLinks);
      onConfirmLinks(accountId, newConfirmedLinks);
    }
  };

  const handleRemoveLink = (type: string) => {
    const newConfirmedLinks = { ...confirmedLinks };
    delete newConfirmedLinks[type];
    setConfirmedLinks(newConfirmedLinks);
    onConfirmLinks(accountId, newConfirmedLinks);
  };

  const getLinkTypeLabel = (type: string): string => {
    switch (type) {
      case 'change-password':
        return 'Change Password';
      case 'delete-account':
        return 'Delete Account';
      case 'security-settings':
        return 'Security Settings';
      default:
        return type;
    }
  };

  const getLinkIcon = (type: string): string => {
    switch (type) {
      case 'change-password':
        return '🔑';
      case 'delete-account':
        return '🗑️';
      case 'security-settings':
        return '🔒';
      default:
        return '🔗';
    }
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.7) return '#4caf50'; // Green - high confidence
    if (confidence >= 0.4) return '#ff9800'; // Orange - medium confidence
    return '#f44336'; // Red - low confidence
  };

  return (
    <div className="link-discovery">
      {Object.keys(confirmedLinks).length > 0 && (
        <div className="confirmed-links">
          <strong>Saved Links:</strong>
          {Object.entries(confirmedLinks).map(([type, url]) => (
            <div key={type} className="confirmed-link-item">
              <span className="link-icon">{getLinkIcon(type)}</span>
              <ExternalLink href={url} className="link-url">
                {getLinkTypeLabel(type)}
              </ExternalLink>
              <button
                onClick={() => handleEditLink(type, url)}
                className="btn-link-edit"
                title="Edit link"
              >
                ✏️
              </button>
              <button
                onClick={() => handleRemoveLink(type)}
                className="btn-link-remove"
                title="Remove link"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleDiscover}
        disabled={isDiscovering}
        className="btn btn-primary btn-sm"
        style={{ marginTop: '0.5rem' }}
      >
        {isDiscovering ? '🔍 Discovering...' : '🔍 Find Links Automatically'}
      </button>

      {errors.length > 0 && (
        <div className="link-discovery-errors">
          {errors.map((error, index) => (
            <div key={index} className="error-message">
              {error}
            </div>
          ))}
        </div>
      )}

      {showResults && discoveredLinks.length > 0 && (
        <div className="discovered-links">
          <strong>Discovered Links:</strong>
          {discoveredLinks
            .sort((a, b) => {
              // Group by type, then sort by confidence
              if (a.type !== b.type) {
                const typeOrder = ['change-password', 'delete-account', 'security-settings'];
                return typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
              }
              return b.confidence - a.confidence;
            })
            .map((link, index) => {
              const isConfirmed = confirmedLinks[link.type] === link.url;
              
              return (
                <div key={index} className={`discovered-link-item ${isConfirmed ? 'confirmed' : ''}`}>
                  <span className="link-icon">{getLinkIcon(link.type)}</span>
                  <span className="link-type">{getLinkTypeLabel(link.type)}</span>
                  <ExternalLink href={link.url} className="link-url" title={link.url}>
                    {link.url.length > 50 ? `${link.url.substring(0, 50)}...` : link.url}
                  </ExternalLink>
                  <span
                    className="confidence-badge"
                    style={{ backgroundColor: getConfidenceColor(link.confidence) }}
                  >
                    {Math.round(link.confidence * 100)}%
                  </span>
                  {!isConfirmed && (
                    <button
                      onClick={() => handleConfirmLink(link)}
                      className="btn-link-confirm"
                      title="Confirm and save this link"
                    >
                      ✓ Confirm
                    </button>
                  )}
                  {isConfirmed && (
                    <span className="link-confirmed">✓ Saved</span>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {showResults && discoveredLinks.length === 0 && (
        <div className="no-links-found">
          <p>No links found automatically.</p>
          <button
            onClick={() => {
              const searchQuery = encodeURIComponent(`${serviceName} change password delete account`);
              if (window.electronAPI?.openExternalUrl) {
                window.electronAPI.openExternalUrl(
                  `https://www.google.com/search?q=${searchQuery}`
                );
              } else {
                window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank');
              }
            }}
            className="btn btn-secondary btn-sm"
          >
            🔍 Open Manual Search
          </button>
        </div>
      )}
    </div>
  );
}

function extractDomainFromService(serviceName: string): string {
  // Try to infer domain from service name
  const cleaned = serviceName.toLowerCase().trim();
  if (cleaned.includes('.')) {
    return cleaned;
  }
  return `${cleaned}.com`;
}
