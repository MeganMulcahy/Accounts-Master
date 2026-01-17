/**
 * Export utilities for CSV and Excel formats.
 * All processing happens locally in the browser.
 */

import * as XLSX from 'xlsx';
import { DiscoveredAccount } from '../../shared/types';

/**
 * Export accounts to CSV format
 */
export function exportToCSV(accounts: DiscoveredAccount[]): string {
  const headers = ['Service', 'Account Email', 'Username', 'Password', 'Source'];
  const rows = accounts.map(account => [
    account.service,
    account.accountEmail,
    account.metadata?.username || '',
    account.metadata?.password || '',
    account.source,
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => 
      row.map(cell => {
        const cellStr = String(cell);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(',')
    ),
  ].join('\n');

  return csvContent;
}

/**
 * Download CSV file
 */
export function downloadCSV(accounts: DiscoveredAccount[], filename: string = 'accounts-export.csv'): void {
  const csvContent = exportToCSV(accounts);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Export accounts to Excel format
 */
export function exportToExcel(accounts: DiscoveredAccount[], filename: string = 'accounts-export.xlsx'): void {
  // Prepare data for Excel
  const worksheetData = [
    ['Service', 'Account Email', 'Username', 'Password', 'Source'],
    ...accounts.map(account => [
      account.service,
      account.accountEmail,
      account.metadata?.username || '',
      account.metadata?.password || '',
      account.source,
    ]),
  ];

  // Create workbook and worksheet
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 30 }, // Service
    { wch: 35 }, // Account Email
    { wch: 25 }, // Username
    { wch: 25 }, // Password
    { wch: 20 }, // Source
  ];

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Accounts');

  // Write file
  XLSX.writeFile(workbook, filename);
}

/**
 * Parse Excel import file (base64 encoded)
 * Expected format: Service, Account Email, Source, Discovered At
 */
export function parseExcelImport(fileBase64: string): DiscoveredAccount[] {
  const accounts: DiscoveredAccount[] = [];

  try {
    // Convert base64 to binary string
    const binaryString = atob(fileBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Parse workbook
    const workbook = XLSX.read(bytes, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert to JSON array
    const data = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1, defval: '' });

    if (data.length === 0) {
      return accounts;
    }

    // Find header row
    let headerRowIndex = -1;
    let serviceIndex = -1;
    let emailIndex = -1;
    let usernameIndex = -1;
    let passwordIndex = -1;
    let sourceIndex = -1;
    let dateIndex = -1;

    for (let i = 0; i < Math.min(5, data.length); i++) {
      const row = data[i] as any[];
      const headers = row.map(h => String(h).toLowerCase().trim());

      if (headers.includes('service') && (headers.includes('account email') || headers.includes('accountemail'))) {
        headerRowIndex = i;
        serviceIndex = headers.findIndex(h => h === 'service');
        emailIndex = headers.findIndex(h => h === 'account email' || h === 'accountemail');
        // More flexible username/password detection using includes for partial matches
        usernameIndex = headers.findIndex(h => {
          const lower = h.toLowerCase();
          return lower === 'username' || lower === 'user' || lower.includes('username') || lower.includes('user name');
        });
        passwordIndex = headers.findIndex(h => {
          const lower = h.toLowerCase();
          return lower === 'password' || lower === 'pass' || lower.includes('password') || lower === 'passwd';
        });
        sourceIndex = headers.findIndex(h => h === 'source');
        dateIndex = headers.findIndex(h => h.includes('discovered') || h.includes('date'));
        break;
      }
    }

    if (headerRowIndex === -1) {
      // Assume first row is headers
      headerRowIndex = 0;
      serviceIndex = 0;
      emailIndex = 1;
      usernameIndex = 2;
      passwordIndex = 3;
      sourceIndex = 4;
      dateIndex = 5;
    }

    // Parse data rows
    const startRow = headerRowIndex + 1;
    for (let i = startRow; i < data.length; i++) {
      const row = data[i] as any[];

      if (row.length < 2) continue; // Skip empty rows

      const service = String(row[serviceIndex] || '').trim();
      const accountEmail = String(row[emailIndex] || '').trim();
      const source = String(row[sourceIndex] || '').trim() || 'Imported';
      const dateValue = row[dateIndex];

      if (!service || !accountEmail) continue;

      // Extract username and password - FORCE extraction from Excel row
      let username = '';
      let password = '';
      
      if (usernameIndex >= 0 && usernameIndex < row.length) {
        const usernameRaw = row[usernameIndex];
        username = (usernameRaw != null && usernameRaw !== undefined) ? String(usernameRaw).trim() : '';
      }
      
      if (passwordIndex >= 0 && passwordIndex < row.length) {
        const passwordRaw = row[passwordIndex];
        password = (passwordRaw != null && passwordRaw !== undefined) ? String(passwordRaw).trim() : '';
      }

      try {
        let discoveredAt: Date;
        if (dateValue) {
          // Excel date handling
          if (typeof dateValue === 'number') {
            // Excel stores dates as serial numbers (days since Jan 1, 1900)
            // Convert Excel date to JavaScript date
            const excelEpoch = new Date(1900, 0, 1);
            excelEpoch.setDate(excelEpoch.getDate() + dateValue - 2); // Excel epoch is Jan 1, 1900, JS epoch is Jan 0, 1900
            discoveredAt = excelEpoch;
          } else if (dateValue instanceof Date) {
            discoveredAt = dateValue;
          } else {
            discoveredAt = new Date(String(dateValue));
          }
        } else {
          discoveredAt = new Date();
        }

        // Validate date
        if (isNaN(discoveredAt.getTime())) {
          discoveredAt = new Date();
        }

        // ALWAYS create and populate metadata when username/password columns exist
        let metadata: Record<string, string> | undefined = undefined;
        
        // Force metadata creation if columns were detected (even with -1 as fallback means columns exist)
        if (usernameIndex >= 0 || passwordIndex >= 0) {
          metadata = {};
          if (usernameIndex >= 0) {
            metadata.username = username; // Store value, empty string is OK
          }
          if (passwordIndex >= 0) {
            metadata.password = password; // Store value, empty string is OK
          }
        }

        const account: DiscoveredAccount = {
          id: `imported-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
          service: service.substring(0, 200),
          accountEmail: accountEmail.substring(0, 254),
          source: source as any,
          discoveredAt,
          metadata: metadata, // Store metadata object, even if values are empty strings
        };

        accounts.push(account);
      } catch (err) {
        // Skip invalid rows
        console.warn(`Skipping invalid row ${i}:`, err);
      }
    }
  } catch (err) {
    console.error('Error parsing Excel file:', err);
    throw new Error(`Failed to parse Excel file: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  return accounts;
}
