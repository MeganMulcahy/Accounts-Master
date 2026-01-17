/**
 * File upload handler component.
 * Handles file selection and parsing for file-based data sources.
 */

import React from 'react';
import { DataSource, DiscoveredAccount } from '../../shared/types';
import './FileUploadHandler.css';

interface FileUploadHandlerProps {
  source: DataSource;
  accountEmail: string;
  onAccountsDiscovered: (accounts: DiscoveredAccount[]) => void;
  onError: (error: string) => void;
  setIsLoading: (loading: boolean) => void;
}

export const FileUploadHandler: React.FC<FileUploadHandlerProps> = ({
  source,
  accountEmail,
  onAccountsDiscovered,
  onError,
  setIsLoading,
}) => {
  const handleFileSelect = async () => {
    if (!accountEmail || !isValidEmail(accountEmail)) {
      onError('Please enter a valid account email address');
      return;
    }

    try {
      setIsLoading(true);

      if (window.electronAPI) {
        const result = await window.electronAPI.selectAndParseFile(source, accountEmail);
        
        if (result.errors && result.errors.length > 0) {
          onError(result.errors.join('; '));
        } else {
          onAccountsDiscovered(result.accounts);
        }
      } else {
        onError('Electron API not available');
      }
    } catch (error) {
      onError(`Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const isValidEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const getFileDescription = (): string => {
    switch (source) {
      case DataSource.CHROME_CSV:
        return 'Select your Chrome passwords CSV export file';
      case DataSource.APPLE_EXPORT:
        return 'Select your Apple Keychain export file';
      case DataSource.GMAIL_TAKEOUT:
        return 'Select your Gmail Takeout MBOX file';
      default:
        return 'Select a file to process';
    }
  };

  return (
    <div className="file-upload-handler">
      <p className="file-upload-description">{getFileDescription()}</p>
      <button onClick={handleFileSelect} className="btn btn-primary">
        Select and Process File
      </button>
      <p className="file-upload-note">
        <strong>Note:</strong> File processing happens locally. No data is sent to external servers.
      </p>
    </div>
  );
};
