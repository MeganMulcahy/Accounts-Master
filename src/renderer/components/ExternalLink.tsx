/**
 * External Link Component
 * Opens URLs in the default system browser (preserves cookies)
 */

import React from 'react';

interface ExternalLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function ExternalLink({ href, children, className, style }: ExternalLinkProps) {
  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    
    if (window.electronAPI?.openExternalUrl) {
      try {
        const result = await window.electronAPI.openExternalUrl(href);
        if (!result.success) {
          console.error('Failed to open URL:', result.error);
        }
      } catch (err) {
        console.error('Error opening URL:', err);
      }
    } else {
      // Fallback to regular link if Electron API not available
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <a 
      href={href} 
      onClick={handleClick}
      className={className}
      style={style}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}
