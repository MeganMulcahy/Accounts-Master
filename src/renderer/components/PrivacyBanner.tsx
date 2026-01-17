/**
 * Privacy banner component.
 * Reminds users that this is a local-only application.
 */

import React from 'react';
import './PrivacyBanner.css';

export const PrivacyBanner: React.FC = () => {
  return (
    <div className="privacy-banner">
      <div className="privacy-banner-content">
        <strong>🔒 Privacy-First Application</strong>
        <span className="privacy-banner-separator">•</span>
        <span>All data processing happens locally on your machine</span>
        <span className="privacy-banner-separator">•</span>
        <span>No passwords, tokens, or personal data is stored</span>
        <span className="privacy-banner-separator">•</span>
        <span>No data is sent to any external servers</span>
      </div>
    </div>
  );
};
