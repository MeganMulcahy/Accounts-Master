/**
 * Electron main process.
 * Handles local file processing, IPC communication, and application lifecycle.
 * 
 * IMPORTANT: All file processing happens locally. No data is sent to external servers.
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import * as readline from 'readline';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { 
  ChromeParser, 
  AppleParser, 
  GmailTakeoutParser 
} from './parsers';
import { DiscoveredAccount, DataSource } from '../shared/types';
import { validateFileSize } from '../shared/security';
import { deduplicateAccounts } from '../shared/deduplication';

let mainWindow: BrowserWindow | null = null;

/**
 * Create the main application window
 */
function createWindow(): void {
  // Determine preload path - in development, files are in dist/, in production they may be elsewhere
  const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';
  const preloadPath = path.join(__dirname, 'preload.js');
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  });

  // Load the React app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Handle app initialization
 */
app.whenReady().then(() => {
  // Wait a bit for Vite dev server to be ready
  setTimeout(() => {
    createWindow();
  }, 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * IPC Handlers for local file processing
 */

/**
 * Select and parse a file
 */
ipcMain.handle('select-and-parse-file', async (event, source: DataSource, accountEmail: string) => {
  try {
    // Show file selection dialog
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: 'All Supported', extensions: ['csv', 'tsv', 'mbox', 'txt'] },
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'TSV Files', extensions: ['tsv'] },
        { name: 'MBOX Files', extensions: ['mbox'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { accounts: [], errors: ['File selection cancelled'] };
    }

    const filePath = result.filePaths[0];
    
    // Read file
    const fileStats = await fs.stat(filePath);
    
    // Validate file size
    if (!validateFileSize(fileStats.size)) {
      return { accounts: [], errors: ['File size exceeds maximum allowed size (5.5GB)'] };
    }

    // For files over 2GB, use streaming approach (especially for MBOX files)
    const TWO_GB = 2 * 1024 * 1024 * 1024; // 2 GiB
    
    // Parse based on source type
    let parser;
    let result_data;
    
    if (fileStats.size > TWO_GB && source === DataSource.GMAIL_TAKEOUT) {
      // Use streaming parser for large MBOX files to avoid memory issues
      parser = new GmailTakeoutParser();
      result_data = await parseLargeMboxFile(filePath, parser, accountEmail);
    } else {
      // Read normally for smaller files
      const fileContent = await fs.readFile(filePath);
      
      switch (source) {
        case DataSource.CHROME_CSV:
          parser = new ChromeParser();
          break;
        case DataSource.APPLE_EXPORT:
          parser = new AppleParser();
          break;
        case DataSource.GMAIL_TAKEOUT:
          parser = new GmailTakeoutParser();
          break;
        default:
          return { accounts: [], errors: [`Unsupported source type: ${source}`] };
      }

      // Parse file
      result_data = await parser.parse(fileContent, accountEmail);
      
      // Clear file content from memory (best effort)
      if (Buffer.isBuffer(fileContent)) {
        fileContent.fill(0);
      }
    }
    
    return result_data;
  } catch (error) {
    return { 
      accounts: [], 
      errors: [`Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}`] 
    };
  }
});

/**
 * Export accounts to CSV or Excel
 */
ipcMain.handle('export-accounts', async (event, accounts: DiscoveredAccount[], format: 'csv' | 'excel') => {
  try {
    const defaultPath = format === 'csv' 
      ? `accounts-export-${Date.now()}.csv`
      : `accounts-export-${Date.now()}.xlsx`;

    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath,
      filters: format === 'csv' 
        ? [{ name: 'CSV Files', extensions: ['csv'] }]
        : [{ name: 'Excel Files', extensions: ['xlsx'] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Export cancelled' };
    }

    if (format === 'csv') {
      await exportToCSV(accounts, result.filePath);
    } else {
      await exportToExcel(accounts, result.filePath);
    }

    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { 
      success: false, 
      error: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
});

/**
 * Export accounts to CSV
 */
async function exportToCSV(accounts: DiscoveredAccount[], filePath: string): Promise<void> {
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
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  await fs.writeFile(filePath, csvContent, 'utf-8');
}

/**
 * Export accounts to Excel (using xlsx library loaded in renderer)
 * This is a placeholder - actual Excel export happens in renderer process
 */
async function exportToExcel(accounts: DiscoveredAccount[], filePath: string): Promise<void> {
  // Excel export requires xlsx library which is available in renderer
  // This function is a placeholder - actual export will be done in renderer
  // We'll write JSON and have renderer convert it
  const data = JSON.stringify(accounts);
  await fs.writeFile(filePath + '.json', data, 'utf-8');
}

/**
 * Import accounts from CSV or Excel file
 */
ipcMain.handle('import-accounts', async (event) => {
  try {
    // Show file selection dialog
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: 'Account Files', extensions: ['csv', 'xlsx'] },
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'Excel Files', extensions: ['xlsx'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, accounts: [], errors: ['File selection cancelled'] };
    }

    const filePath = result.filePaths[0];
    const fileExtension = path.extname(filePath).toLowerCase();

    // Read file
    const fileStats = await fs.stat(filePath);
    
    // Validate file size
    if (!validateFileSize(fileStats.size)) {
      return { success: false, accounts: [], errors: ['File size exceeds maximum allowed size (5.5GB)'] };
    }

    if (fileExtension === '.csv') {
      // Parse CSV
      const content = await fs.readFile(filePath, 'utf-8');
      const accounts = parseCSVImport(content);
      return { success: true, accounts, errors: [] };
    } else if (fileExtension === '.xlsx') {
      // For Excel, read as buffer and send to renderer for parsing
      // The renderer has xlsx library available
      const fileBuffer = await fs.readFile(filePath);
      const fileBase64 = fileBuffer.toString('base64');
      return { success: true, accounts: [], errors: [], fileData: fileBase64, format: 'excel' };
    } else {
      return { success: false, accounts: [], errors: ['Unsupported file format'] };
    }
  } catch (error) {
    return { 
      success: false,
      accounts: [], 
      errors: [`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`] 
    };
  }
});

/**
 * Parse large MBOX file using streaming to handle files > 2GB
 * Processes line-by-line without loading entire file into memory
 * This avoids both Buffer size limits and JavaScript string length limits
 */
async function parseLargeMboxFile(
  filePath: string,
  parser: GmailTakeoutParser,
  accountEmail: string
): Promise<{ accounts: DiscoveredAccount[]; errors: string[] }> {
  return new Promise((resolve, reject) => {
    const accounts: DiscoveredAccount[] = [];
    const errors: string[] = [];
    const seenSenders = new Set<string>();
    
    let currentEmail: string[] = [];
    let inHeader = true;
    
    const fileStream = createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity, // Handle Windows line endings
    });
    
    rl.on('line', (line: string) => {
      try {
        // Check if this is a new email header (MBOX format: "From " starts new email)
        if (line.startsWith('From ')) {
          // Process previous email if exists
          if (currentEmail.length > 0) {
            const emailBlock = currentEmail.join('\n');
            const sender = extractSenderFromEmailBlock(emailBlock);
            
            if (sender && !seenSenders.has(sender)) {
              seenSenders.add(sender);
              const serviceName = extractServiceNameFromEmail(sender);
              
              if (serviceName && !isPersonalEmail(sender)) {
                accounts.push({
                  id: `gmail-takeout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  service: sanitizeServiceName(serviceName),
                  accountEmail: sender, // Use sender email as account email instead of provided accountEmail
                  source: DataSource.GMAIL_TAKEOUT,
                  discoveredAt: new Date(),
                  metadata: {},
                });
              }
            }
          }
          
          // Start new email
          currentEmail = [line];
          inHeader = true;
        } else {
          currentEmail.push(line);
          
          // Stop reading headers after empty line
          if (inHeader && line.trim() === '') {
            inHeader = false;
            // Skip body - we only need headers for sender info
            // Continue collecting until next "From " line
          }
        }
      } catch (error) {
        // Skip individual line errors
      }
    });
    
    rl.on('close', () => {
      // Process last email
      if (currentEmail.length > 0) {
        const emailBlock = currentEmail.join('\n');
        const sender = extractSenderFromEmailBlock(emailBlock);
        
        if (sender && !seenSenders.has(sender)) {
          const serviceName = extractServiceNameFromEmail(sender);
          
          if (serviceName && !isPersonalEmail(sender)) {
            accounts.push({
              id: `gmail-takeout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              service: sanitizeServiceName(serviceName),
              accountEmail,
              source: DataSource.GMAIL_TAKEOUT,
              discoveredAt: new Date(),
              metadata: {
                senderEmail: sender,
              },
            });
          }
        }
      }
      
      resolve({ accounts, errors });
    });
    
    rl.on('error', (error: Error) => {
      reject(error);
    });
  });
}

// Helper functions for streaming parser
function extractSenderFromEmailBlock(emailBlock: string): string | null {
  const lines = emailBlock.split('\n');
  
  for (const line of lines) {
    if (line.toLowerCase().startsWith('from:')) {
      const match = line.match(/From:\s*(.+)/i);
      if (match) {
        const emailMatch = match[1].match(/[\w.-]+@[\w.-]+\.\w+/);
        if (emailMatch) {
          return emailMatch[0].toLowerCase();
        }
      }
    }
    if (line.trim() === '') break; // Stop after headers
  }
  
  return null;
}

function extractServiceNameFromEmail(email: string): string | null {
  if (!email) return null;
  
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  
  const domain = parts[1].toLowerCase();
  const emailProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com'];
  if (emailProviders.includes(domain)) return null;
  
  const domainParts = domain.split('.');
  let serviceName = domainParts[domainParts.length - 2] || domainParts[0];
  
  serviceName = serviceName.replace(/^(mail|news|noreply|no-reply|donotreply|support|info|hello|contact)/i, '');
  if (!serviceName) {
    serviceName = domainParts[domainParts.length - 2] || domainParts[0];
  }
  
  if (serviceName) {
    serviceName = serviceName.charAt(0).toUpperCase() + serviceName.slice(1);
    return serviceName;
  }
  
  return null;
}

function isPersonalEmail(email: string): boolean {
  const personalPatterns = [
    /^[\w.-]+@(gmail|yahoo|hotmail|outlook|icloud|aol|protonmail|zoho)\./i,
    /^[\w.-]+@[\w.-]+\.edu$/i,
  ];
  
  return personalPatterns.some(pattern => pattern.test(email));
}

function sanitizeServiceName(service: string): string {
  return service.substring(0, 200).trim();
}

/**
 * Parse CSV import file
 * Expected format: Service, Account Email, Source, Discovered At
 */
function parseCSVImport(csvContent: string): DiscoveredAccount[] {
  const accounts: DiscoveredAccount[] = [];
  const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line);
  
  if (lines.length === 0) {
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

  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const headers = parseCSVLine(lines[i]);
    const lowerHeaders = headers.map(h => h.toLowerCase());
    
    if (lowerHeaders.includes('service') && lowerHeaders.includes('account email')) {
      headerRowIndex = i;
      serviceIndex = headers.findIndex(h => h.toLowerCase() === 'service');
      emailIndex = headers.findIndex(h => h.toLowerCase() === 'account email' || h.toLowerCase() === 'accountemail');
      // More flexible username/password detection
      usernameIndex = headers.findIndex(h => {
        const lower = h.toLowerCase();
        return lower === 'username' || lower === 'user' || lower.includes('username') || lower.includes('user name');
      });
      passwordIndex = headers.findIndex(h => {
        const lower = h.toLowerCase();
        return lower === 'password' || lower === 'pass' || lower.includes('password') || lower === 'passwd';
      });
      sourceIndex = headers.findIndex(h => h.toLowerCase() === 'source');
      dateIndex = headers.findIndex(h => h.toLowerCase().includes('discovered') || h.toLowerCase().includes('date'));
      break;
    }
  }

  if (headerRowIndex === -1) {
    // Try to parse without headers - assume first row is data
    headerRowIndex = -1;
    serviceIndex = 0;
    emailIndex = 1;
    usernameIndex = 2;
    passwordIndex = 3;
    sourceIndex = 4;
    dateIndex = 5;
  }

  // Parse data rows
  const startRow = headerRowIndex + 1;
  for (let i = startRow; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    
    if (row.length < 2) continue; // Skip invalid rows

    const service = row[serviceIndex]?.trim();
    const accountEmail = row[emailIndex]?.trim();
    const source = row[sourceIndex]?.trim() || 'Imported';
    const dateStr = row[dateIndex]?.trim();

    if (!service || !accountEmail) continue;

    // Extract username and password - handle all cases
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
      const discoveredAt = dateStr ? new Date(dateStr) : new Date();
      
      // ALWAYS create metadata when username/password columns exist
      let metadata: Record<string, string> | undefined = undefined;
      if (usernameIndex >= 0 || passwordIndex >= 0) {
        metadata = {};
        if (usernameIndex >= 0) {
          metadata.username = username; // Store even if empty string
        }
        if (passwordIndex >= 0) {
          metadata.password = password; // Store even if empty string
        }
      }
      
      const account: DiscoveredAccount = {
        id: `imported-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
        service: service.substring(0, 200),
        accountEmail: accountEmail.substring(0, 254),
        source: source as any,
        discoveredAt,
        metadata: metadata, // Store metadata object when columns exist
      };

      accounts.push(account);
    } catch (err) {
      // Skip invalid rows
      console.warn(`Skipping invalid row ${i}:`, err);
    }
  }

  return accounts;
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
  result.push(current.trim());

  return result;
}

/**
 * Process OAuth token and fetch accounts
 * Note: OAuth processing happens in renderer due to browser-based auth flow
 * This handler is a placeholder for any additional processing needed
 */
ipcMain.handle('process-oauth-accounts', async (event, accounts: DiscoveredAccount[]) => {
  // OAuth accounts are already processed in renderer
  // This handler can be used for additional validation or processing
  return { accounts, errors: [] };
});

/**
 * Clean duplicates using Python script
 */
ipcMain.handle('clean-duplicates', async (event, accounts: DiscoveredAccount[]) => {
  try {
    const pythonScriptPath = path.join(__dirname, '..', 'scripts', 'deduplicate.py');
    
    // Check if Python script exists
    try {
      await fs.access(pythonScriptPath);
    } catch {
      // Python script not found, use JavaScript fallback
      const cleaned = deduplicateAccounts(accounts);
      return {
        success: true,
        accounts: cleaned.map(acc => ({
          ...acc,
          discoveredAt: acc.discoveredAt instanceof Date ? acc.discoveredAt.toISOString() : acc.discoveredAt,
          firstDiscoveredAt: (acc as any).firstDiscoveredAt instanceof Date 
            ? (acc as any).firstDiscoveredAt.toISOString() 
            : (acc as any).firstDiscoveredAt,
          lastDiscoveredAt: (acc as any).lastDiscoveredAt instanceof Date 
            ? (acc as any).lastDiscoveredAt.toISOString() 
            : (acc as any).lastDiscoveredAt,
        })),
        method: 'javascript',
      };
    }

    // Convert accounts to JSON for Python script
    const accountsJson = JSON.stringify(accounts.map(acc => ({
      ...acc,
      discoveredAt: acc.discoveredAt instanceof Date ? acc.discoveredAt.toISOString() : acc.discoveredAt,
    })));

    // Call Python script
    return new Promise((resolve, reject) => {
      const python = spawn('python3', [pythonScriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          // Python script failed, fall back to JavaScript
          console.warn(`Python deduplication failed (code ${code}), using JavaScript fallback`);
          const cleaned = deduplicateAccounts(accounts);
          resolve({
            success: true,
            accounts: cleaned.map(acc => ({
              ...acc,
              discoveredAt: acc.discoveredAt instanceof Date ? acc.discoveredAt.toISOString() : acc.discoveredAt,
              firstDiscoveredAt: (acc as any).firstDiscoveredAt instanceof Date 
                ? (acc as any).firstDiscoveredAt.toISOString() 
                : (acc as any).firstDiscoveredAt,
              lastDiscoveredAt: (acc as any).lastDiscoveredAt instanceof Date 
                ? (acc as any).lastDiscoveredAt.toISOString() 
                : (acc as any).lastDiscoveredAt,
            })),
            method: 'javascript',
          });
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve({
            success: true,
            accounts: result.accounts || result,
            method: 'python',
          });
        } catch (err) {
          reject(new Error(`Failed to parse Python output: ${err instanceof Error ? err.message : 'Unknown error'}`));
        }
      });

      python.on('error', (err) => {
        // Python not available, use JavaScript fallback
        console.warn('Python not available, using JavaScript fallback');
        const cleaned = deduplicateAccounts(accounts);
        resolve({
          success: true,
          accounts: cleaned.map(acc => ({
            ...acc,
            discoveredAt: acc.discoveredAt instanceof Date ? acc.discoveredAt.toISOString() : acc.discoveredAt,
            firstDiscoveredAt: (acc as any).firstDiscoveredAt instanceof Date 
              ? (acc as any).firstDiscoveredAt.toISOString() 
              : (acc as any).firstDiscoveredAt,
            lastDiscoveredAt: (acc as any).lastDiscoveredAt instanceof Date 
              ? (acc as any).lastDiscoveredAt.toISOString() 
              : (acc as any).lastDiscoveredAt,
          })),
          method: 'javascript',
        });
      });

      // Send accounts JSON to Python script
      python.stdin.write(accountsJson);
      python.stdin.end();
    });
  } catch (error) {
    return {
      success: false,
      error: `Failed to clean duplicates: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
});

/**
 * Open URL in default system browser (preserves cookies)
 */
ipcMain.handle('open-external-url', async (event, url: string) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

/**
 * Open URL in Chrome browser (macOS)
 */
ipcMain.handle('open-external-url-chrome', async (event, url: string) => {
  try {
    const execAsync = promisify(exec);
    // Try different Chrome paths on macOS
    const chromePaths = [
      '/Applications/Google Chrome.app',
      '/Applications/Google Chrome Canary.app',
      '/Applications/Chromium.app'
    ];
    
    let opened = false;
    for (const chromePath of chromePaths) {
      try {
        await execAsync(`open -a "${chromePath}" "${url}"`);
        opened = true;
        break;
      } catch {
        // Try next path
        continue;
      }
    }
    
    if (!opened) {
      // Fallback to default browser
      await shell.openExternal(url);
    }
    
    return { success: true };
  } catch (error) {
    // Fallback to default browser if Chrome not found
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (fallbackError) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
});

/**
 * Open Apple Passwords settings (macOS)
 */
ipcMain.handle('open-apple-passwords', async () => {
  try {
    const execAsync = promisify(exec);
    
    try {
      // Try opening System Settings to Passwords section (macOS Ventura+)
      await execAsync('open "x-apple.systempreferences:com.apple.preferences.security?Privacy_Passwords"');
      return { success: true };
    } catch {
      // Fallback: Open Keychain Access app
      await execAsync('open -a "Keychain Access"');
      return { success: true };
    }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
});

/**
 * Get app version and info
 */
ipcMain.handle('get-app-info', async () => {
  return {
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
  };
});
