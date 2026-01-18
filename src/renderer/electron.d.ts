/**
 * Type definitions for Electron API.
 * This allows the app to work in both Electron and browser contexts.
 */

export interface ElectronAPI {
  selectAndParseFile: (source: any, accountEmail: string) => Promise<{ accounts: any[]; errors: string[] }>;
  exportAccounts: (accounts: any[], format: 'csv' | 'excel') => Promise<{ success: boolean; filePath?: string; error?: string }>;
  processOAuthAccounts: (accounts: any[]) => Promise<{ accounts: any[]; errors: string[] }>;
  getAppInfo: () => Promise<{ name: string; version: string; platform: string }>;
  cleanDuplicates?: (accounts: any[]) => Promise<{ success: boolean; accounts?: any[]; error?: string; method?: string }>;
  importAccounts?: () => Promise<{ success: boolean; accounts?: any[]; errors?: string[]; fileData?: string; format?: string }>;
  openExternalUrl?: (url: string) => Promise<{ success: boolean; error?: string }>;
  openExternalUrlChrome?: (url: string) => Promise<{ success: boolean; error?: string }>;
  openApplePasswords?: () => Promise<{ success: boolean; error?: string }>;
  discoverLinks?: (serviceName: string, serviceDomain?: string) => Promise<{ service: string; links: Array<{ url: string; type: string; confidence: number; domain: string; title?: string }>; errors: string[] }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
