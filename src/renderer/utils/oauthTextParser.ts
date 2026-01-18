/**
 * Parser for OAuth connected apps text
 * Extracts only clean service names, ignoring expired/dates/status messages
 */

/**
 * Clean service name by removing common non-service text patterns
 */
function cleanServiceName(name: string): string {
  if (!name) return '';
  
  let cleaned = name.trim();
  
  // Remove common status indicators
  const statusPatterns = [
    /expired/gi,
    /expires?\s+\d+/gi,
    /\d{1,2}\/\d{1,2}\/\d{2,4}/g, // Dates like 12/31/2024
    /\d{4}-\d{2}-\d{2}/g, // Dates like 2024-12-31
    /last\s+used\s+\d+/gi,
    /accessed\s+\d+/gi,
    /status:\s*\w+/gi,
    /active/gi,
    /inactive/gi,
    /revoked/gi,
    /removed/gi,
    /deleted/gi,
    /\d+\s+days?\s+ago/gi,
    /\d+\s+months?\s+ago/gi,
    /\d+\s+years?\s+ago/gi,
    /usage\s+timeline/gi,
    /timeline/gi,
    /\(.*?\)/g, // Remove parenthetical content that might be dates/status
  ];
  
  for (const pattern of statusPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Remove leading/trailing punctuation
  cleaned = cleaned.replace(/^[^\w]+|[^\w]+$/g, '');
  
  return cleaned;
}

/**
 * Check if a line contains only service name (not status/date info)
 */
function isValidServiceName(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  
  const cleaned = cleanServiceName(text);
  
  // Must have at least 2 characters after cleaning
  if (cleaned.length < 2) return false;
  
  // Reject if it's mostly numbers or dates
  if (/^\d+$/.test(cleaned)) return false;
  
  // Reject if it's clearly a date
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(cleaned)) return false;
  
  // Reject common non-service words
  const rejectWords = [
    'expired', 'expires', 'last used', 'accessed', 'status', 'active', 
    'inactive', 'revoked', 'removed', 'deleted', 'timeline', 'usage',
    'days ago', 'months ago', 'years ago', 'ago'
  ];
  
  const lowerText = cleaned.toLowerCase();
  for (const word of rejectWords) {
    if (lowerText.includes(word)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Parse OAuth connected apps text and extract only service names
 * Ignores expired, dates, usage timelines, status messages
 */
export function parseOAuthText(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }
  
  // Split by newlines, commas, semicolons, or tabs
  const lines = text
    .split(/[\n,;\t]+/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  const serviceNames: string[] = [];
  const seen = new Set<string>();
  
  for (const line of lines) {
    // Clean and validate the service name
    const cleaned = cleanServiceName(line);
    
    if (isValidServiceName(cleaned)) {
      // Normalize for deduplication (case-insensitive)
      const normalized = cleaned.toLowerCase();
      
      if (!seen.has(normalized)) {
        seen.add(normalized);
        serviceNames.push(cleaned);
      }
    }
  }
  
  return serviceNames;
}
