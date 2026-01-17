/**
 * Preload script for Electron.
 * Exposes safe IPC methods to the renderer process.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { DiscoveredAccount, DataSource } from '../shared/types';

/**
 * Expose protected methods that allow the renderer process
 * to use ipcRenderer without exposing the entire object
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Select and parse a file
   */
  selectAndParseFile: (source: DataSource, accountEmail: string) =>
    ipcRenderer.invoke('select-and-parse-file', source, accountEmail),

  /**
   * Export accounts to CSV or Excel
   */
  exportAccounts: (accounts: DiscoveredAccount[], format: 'csv' | 'excel') =>
    ipcRenderer.invoke('export-accounts', accounts, format),

  /**
   * Process OAuth accounts
   */
  processOAuthAccounts: (accounts: DiscoveredAccount[]) =>
    ipcRenderer.invoke('process-oauth-accounts', accounts),

  /**
   * Get app info
   */
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  /**
   * Clean duplicates using Python script
   */
  cleanDuplicates: (accounts: DiscoveredAccount[]) =>
    ipcRenderer.invoke('clean-duplicates', accounts),

  /**
   * Import accounts from CSV or Excel file
   */
  importAccounts: () =>
    ipcRenderer.invoke('import-accounts'),

  /**
   * Open URL in default system browser (preserves cookies)
   */
  openExternalUrl: (url: string) =>
    ipcRenderer.invoke('open-external-url', url),

  /**
   * Open URL in Chrome browser (macOS)
   */
  openExternalUrlChrome: (url: string) =>
    ipcRenderer.invoke('open-external-url-chrome', url),

  /**
   * Open Apple Passwords settings (macOS)
   */
  openApplePasswords: () =>
    ipcRenderer.invoke('open-apple-passwords'),
});

/**
 * Type definitions for window.electronAPI
 */
declare global {
  interface Window {
    electronAPI: {
      selectAndParseFile: (source: DataSource, accountEmail: string) => Promise<{ accounts: DiscoveredAccount[]; errors: string[] }>;
      exportAccounts: (accounts: DiscoveredAccount[], format: 'csv' | 'excel') => Promise<{ success: boolean; filePath?: string; error?: string }>;
      processOAuthAccounts: (accounts: DiscoveredAccount[]) => Promise<{ accounts: DiscoveredAccount[]; errors: string[] }>;
      getAppInfo: () => Promise<{ name: string; version: string; platform: string }>;
      cleanDuplicates: (accounts: DiscoveredAccount[]) => Promise<{ success: boolean; accounts?: DiscoveredAccount[]; error?: string; method?: string }>;
      importAccounts: () => Promise<{ success: boolean; accounts?: DiscoveredAccount[]; errors?: string[]; fileData?: string; format?: string }>;
      openExternalUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
      openExternalUrlChrome: (url: string) => Promise<{ success: boolean; error?: string }>;
      openApplePasswords: () => Promise<{ success: boolean; error?: string }>;
    };
  }
}
