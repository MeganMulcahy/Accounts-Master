/**
 * Password Strength Analyzer
 * Analyzes passwords locally in memory for security insights.
 * PRIVACY: All analysis happens locally, no data is sent to external services.
 */

export interface PasswordAnalysis {
  /** Strength rating: 'weak', 'moderate', or 'strong' */
  strength: 'weak' | 'moderate' | 'strong';
  /** Numerical score (0-100) */
  score: number;
  /** Whether password is reused across multiple services */
  isReused: boolean;
  /** Security recommendation */
  recommendation: string;
  /** Debug: Reason for strength override (not shown to users) */
  strengthOverrideReason: 'email_fragment_match' | 'name_fragment_match' | 'password_reuse' | 'low_entropy' | null;
}

/**
 * Common weak passwords list (top 100 most common)
 * Based on common password lists and security research
 */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'Password1', 'Password123',
  '123456', '12345678', '123456789', '1234567890', '1234567',
  'qwerty', 'qwerty123', 'qwertyuiop', 'abc123', 'abcd1234',
  'admin', 'admin123', 'administrator', 'root', 'toor',
  'letmein', 'welcome', 'welcome123', 'monkey', 'dragon',
  'passw0rd', 'pass123', 'pass1234', 'master', 'sunshine',
  'princess', 'shadow', 'michael', 'football', 'baseball',
  'superman', 'batman', 'tigger', 'trustno1', 'thomas',
  'hockey', 'jordan', 'hunter', 'harley', 'robert',
  'charlie', 'william', 'james', 'matthew', 'jennifer',
  'michelle', 'jessica', 'joshua', 'ashley', 'daniel',
  'chris', 'jason', 'justin', 'sarah', 'tyler',
  'austin', 'nicholas', 'ryan', 'brian', 'kevin',
  'brandon', 'jacob', 'samuel', 'steven', 'thomas',
  'iloveyou', 'loveme', 'love123', '123qwe', 'qwertyui',
  'qazwsx', '1qaz2wsx', 'zaq1xsw2', 'qwer1234', 'asdf1234',
  'zxcv1234', 'qwerty1', 'password2', 'welcome1', 'hello123',
  'summer', 'winter', 'spring', 'autumn', 'february',
  'january', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
  'saturday', 'sunday', 'monday1', 'tuesday1',
]);

/**
 * Extract parts from email address for password validation
 * Splits email into meaningful components: username, domain, individual words
 */
function extractEmailParts(email: string): string[] {
  if (!email || !email.includes('@')) {
    return [];
  }

  const parts: string[] = [];
  const emailLower = email.toLowerCase();
  
  // Split email into local and domain parts
  const [localPart, domain] = emailLower.split('@');
  
  // Add full email
  parts.push(emailLower);
  
  // Add local part (username before @)
  if (localPart) {
    parts.push(localPart);
    
    // Split local part by common separators (. _ - +)
    const localParts = localPart.split(/[._\-\+]/).filter(p => p.length >= 2);
    parts.push(...localParts);
    
    // Extract individual words from local part (handle numbers too)
    // Split by dots, underscores, hyphens, plus signs, and numbers
    const words = localPart.split(/[._\-\+\d]+/).filter(w => w.length >= 2);
    parts.push(...words);
    
    // Also extract combinations without separators (e.g., "johnsmith" from "john.smith")
    if (words.length > 1) {
      parts.push(words.join('')); // "johnsmith"
    }
  }
  
  // Add domain part
  if (domain) {
    parts.push(domain);
    
    // Add domain without TLD (e.g., "gmail" from "gmail.com")
    const domainParts = domain.split('.');
    if (domainParts.length > 0) {
      parts.push(domainParts[0]); // "gmail"
      
      // Extract words from domain (if compound like "googlemail")
      const domainWords = domainParts[0].split(/(?=[A-Z])|(?<=[a-z])(?=[A-Z])/).filter(w => w.length >= 2);
      parts.push(...domainWords);
    }
  }
  
  return [...new Set(parts)]; // Remove duplicates
}

/**
 * Check if password contains any part of email
 * Returns match details for strength downgrade logic
 */
function containsEmailParts(password: string, emailParts: string[]): { hasMatch: boolean; matchCount: number; hasLongMatch: boolean } {
  if (!password || emailParts.length === 0) {
    return { hasMatch: false, matchCount: 0, hasLongMatch: false };
  }
  
  const passwordLower = password.toLowerCase();
  let matchCount = 0;
  let hasLongMatch = false; // Match of 4+ characters
  
  // Check if any email part is in the password (minimum 2 characters to avoid false positives)
  for (const part of emailParts) {
    if (part.length >= 2 && passwordLower.includes(part)) {
      matchCount++;
      if (part.length >= 4) {
        hasLongMatch = true;
      }
    }
  }
  
  return {
    hasMatch: matchCount > 0,
    matchCount,
    hasLongMatch,
  };
}

/**
 * Extract phrases and their parts from common password phrases string
 * Phrases can be separated by newlines or commas
 * Returns array of phrase fragments to check against password
 * Includes all substrings of length >= 4 characters from phrases
 */
function extractNameParts(commonPasswordPhrases?: string): string[] {
  const parts: string[] = [];
  
  if (!commonPasswordPhrases || commonPasswordPhrases.trim().length === 0) {
    return parts;
  }
  
  /**
   * Extract all substrings of length >= 4 from a phrase
   */
  const extractSubstrings = (phrase: string, minLength: number = 4): string[] => {
    const substrings: string[] = [];
    const phraseLower = phrase.toLowerCase().trim();
    
    // Extract all substrings of length >= minLength
    for (let i = 0; i <= phraseLower.length - minLength; i++) {
      for (let len = minLength; len <= phraseLower.length - i; len++) {
        const substring = phraseLower.substring(i, i + len);
        if (substring.length >= minLength) {
          substrings.push(substring);
        }
      }
    }
    
    return substrings;
  };
  
  // Split by newlines or commas to get individual phrases
  const phrases = commonPasswordPhrases
    .split(/[\n,]+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
  
  for (const phrase of phrases) {
    const phraseLower = phrase.toLowerCase().trim();
    
    // Add full phrase
    parts.push(phraseLower);
    
    // Extract all substrings of length >= 4
    const phraseSubstrings = extractSubstrings(phraseLower, 4);
    parts.push(...phraseSubstrings);
    
    // Also split by common separators and extract substrings from each part
    const phraseParts = phraseLower.split(/[\s._\-]+/).filter(p => p.length >= 2);
    for (const part of phraseParts) {
      if (part.length >= 4) {
        const partSubstrings = extractSubstrings(part, 4);
        parts.push(...partSubstrings);
      }
      parts.push(part); // Also include the full part if >= 2 chars
    }
  }
  
  return [...new Set(parts)]; // Remove duplicates
}

/**
 * Check if password contains any part of name
 * Returns match details for strength downgrade logic
 * Only matches substrings of length >= 4 characters
 */
function containsNameParts(password: string, nameParts: string[]): { hasMatch: boolean; matchCount: number; hasLongMatch: boolean } {
  if (!password || nameParts.length === 0) {
    return { hasMatch: false, matchCount: 0, hasLongMatch: false };
  }
  
  const passwordLower = password.toLowerCase();
  let matchCount = 0;
  let hasLongMatch = false; // Match of 4+ characters
  
  // Check if any name part (minimum 4 characters) is in the password
  // Only count matches of length >= 4 to avoid false positives
  for (const part of nameParts) {
    if (part.length >= 4 && passwordLower.includes(part)) {
      matchCount++;
      hasLongMatch = true; // All matches are 4+ characters, so always long match
    }
  }
  
  return {
    hasMatch: matchCount > 0,
    matchCount,
    hasLongMatch,
  };
}

/**
 * Calculate password strength score (0-100)
 * Penalizes passwords that contain email address parts
 */
function calculatePasswordScore(password: string, accountEmail?: string): number {
  if (!password || password.length === 0) {
    return 0;
  }

  let score = 0;

  // Length scoring (0-30 points)
  if (password.length >= 12) {
    score += 30;
  } else if (password.length >= 8) {
    score += 20;
  } else if (password.length >= 6) {
    score += 10;
  } else {
    score += 5;
  }

  // Character variety scoring (0-40 points)
  let hasLower = false;
  let hasUpper = false;
  let hasNumber = false;
  let hasSpecial = false;

  for (const char of password) {
    if (char >= 'a' && char <= 'z') hasLower = true;
    else if (char >= 'A' && char <= 'Z') hasUpper = true;
    else if (char >= '0' && char <= '9') hasNumber = true;
    else if ('!@#$%^&*()_+-=[]{}|;:,.<>?'.includes(char)) hasSpecial = true;
  }

  let varietyCount = 0;
  if (hasLower) varietyCount++;
  if (hasUpper) varietyCount++;
  if (hasNumber) varietyCount++;
  if (hasSpecial) varietyCount++;

  score += varietyCount * 10; // 10 points per character type

  // Pattern penalty (-20 points)
  const commonPatterns = [
    /(.)\1{2,}/, // Repeated characters (aaa, 111)
    /012|123|234|345|456|567|678|789/, // Sequential numbers
    /abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz/i, // Sequential letters
    /qwerty|asdf|zxcv/i, // Keyboard patterns
  ];

  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      score -= 5;
      break;
    }
  }

  // Common password penalty
  const passwordLower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(passwordLower)) {
    score -= 30; // Severe penalty for common passwords
  }

  // Entropy bonus (based on character variety and length)
  const uniqueChars = new Set(password).size;
  const entropyRatio = uniqueChars / password.length;
  if (entropyRatio > 0.7) {
    score += 10; // High variety bonus
  }

  // Email part checking will be done AFTER scoring to determine final strength
  // The check result is stored for post-processing

  return Math.max(0, Math.min(100, score)); // Clamp between 0 and 100
}

/**
 * Determine strength category from score
 * Can be downgraded if password contains email parts
 */
function scoreToStrength(score: number, hasEmailParts: boolean, hasLongEmailMatch: boolean, emailMatchCount: number): 'weak' | 'moderate' | 'strong' {
  let strength: 'weak' | 'moderate' | 'strong';
  
  // Initial strength based on score
  if (score >= 70) {
    strength = 'strong';
  } else if (score >= 40) {
    strength = 'moderate';
  } else {
    strength = 'weak';
  }
  
  // Apply email part downgrade rule
  // If password contains email parts, automatically downgrade:
  // Strong → Moderate
  // Moderate → Weak
  // Weak → Weak (unchanged)
  if (hasEmailParts) {
    if (strength === 'strong') {
      strength = 'moderate';
    } else if (strength === 'moderate') {
      strength = 'weak';
    }
    // If multiple matches or long fragment, always WEAK
    if (emailMatchCount > 1 || hasLongEmailMatch) {
      strength = 'weak';
    }
  }
  
  return strength;
}

/**
 * Generate security recommendation based on analysis
 */
function generateRecommendation(analysis: PasswordAnalysis, password: string): string {
  if (analysis.isReused) {
    return 'Password is reused - use unique passwords for each service';
  }

  if (analysis.strength === 'weak') {
    if (password.length < 8) {
      return 'Use at least 8 characters with mixed case, numbers, and symbols';
    }
    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
      return 'Avoid common passwords - use a unique, complex password';
    }
    return 'Password is too weak - add uppercase, numbers, and special characters';
  }

  if (analysis.strength === 'moderate') {
    return 'Consider making password stronger with more variety and length';
  }

  return 'Password strength is good - consider using a password manager';
}

/**
 * Analyze a single password
 * FOLLOWS STRICT ORDER: Base Score → Email Match Check → Name Match Check (HARD OVERRIDE)
 * 
 * @param password The password to analyze
 * @param providerEmail Provider email address to check if password contains email parts
 * @param commonPasswordPhrases Phrases commonly used in passwords (names, words, etc.) separated by newlines or commas
 */
export function analyzePassword(password: string, providerEmail?: string, commonPasswordPhrases?: string): PasswordAnalysis | null {
  // If no password, return null (don't mark as weak)
  if (!password || password.length === 0) {
    return null;
  }

  // STEP 1: Calculate BASE SCORE (length, complexity, entropy)
  // Email checking is NOT part of scoring - it's a hard override
  const score = calculatePasswordScore(password);
  
  // Determine initial strength from base score
  let initialStrength: 'weak' | 'moderate' | 'strong';
  if (score >= 70) {
    initialStrength = 'strong';
  } else if (score >= 40) {
    initialStrength = 'moderate';
  } else {
    initialStrength = 'weak';
  }

  // STEP 2: EMAIL MATCH CHECK (HARD OVERRIDE RULE)
  // This MUST run after base scoring and override the result
  // CRITICAL: Passwords with email parts can NEVER be "strong" - ABSOLUTE HARD RULE
  let strength = initialStrength;
  let strengthOverrideReason: 'email_fragment_match' | 'name_fragment_match' | 'password_reuse' | 'low_entropy' | null = null;
  
  // MUST check email fragments - this is a HARD RULE that cannot be bypassed
  if (providerEmail && providerEmail.trim().length > 0 && providerEmail.includes('@')) {
    // Split providerEmail into fragments (full email, username, username parts, domain, etc.)
    const emailParts = extractEmailParts(providerEmail);
    
    if (emailParts.length > 0) {
      // Check password against ALL fragments (case-insensitive)
      const emailCheck = containsEmailParts(password, emailParts);
      
      // HARD OVERRIDE RULE: If ANY part of email is found in password, downgrade immediately
      // This is an ABSOLUTE HARD RULE - if email parts present, CANNOT be "strong" - PERIOD
      if (emailCheck.hasMatch) {
        // Set override reason
        strengthOverrideReason = 'email_fragment_match';
        
        // ABSOLUTE HARD OVERRIDE: If ANY email part found in password → NEVER "strong"
        // Override table (applied unconditionally):
        // - Strong → Weak (ALWAYS, no exceptions, no matter the score)
        // - Moderate → Weak (ALWAYS, no exceptions)
        // - Weak → Weak (unchanged)
        
        // FORCE downgrade: Any email match = NEVER "strong"
        // This overrides the base score completely
        if (initialStrength === 'strong') {
          strength = 'weak'; // Strong with ANY email part → Weak (HARD RULE)
        } else if (initialStrength === 'moderate') {
          strength = 'weak'; // Moderate with ANY email part → Weak (HARD RULE)
        }
        // Weak remains Weak (unchanged)
        
        // Additional check: multiple matches or long fragments ensure Weak
        // (Redundant but explicit - strength is already weak from above)
        if (emailCheck.matchCount > 1 || emailCheck.hasLongMatch) {
          strength = 'weak'; // Multiple matches or long fragments → always Weak
        }
      }
    }
  }

  // STEP 3: NAME MATCH CHECK (HARD OVERRIDE RULE)
  // This MUST run after email check and override the result
  // CRITICAL: Passwords with name parts can NEVER be "strong" - ABSOLUTE HARD RULE
  if (commonPasswordPhrases && commonPasswordPhrases.trim().length > 0) {
    // Extract phrase parts from common password phrases
    const nameParts = extractNameParts(commonPasswordPhrases);
    
    if (nameParts.length > 0) {
      // Check password against ALL name fragments (case-insensitive)
      const nameCheck = containsNameParts(password, nameParts);
      
      // HARD OVERRIDE RULE: If ANY part of name is found in password, downgrade immediately
      // This is an ABSOLUTE HARD RULE - if name parts present, CANNOT be "strong" - PERIOD
      if (nameCheck.hasMatch) {
        // Set override reason (name takes precedence if email wasn't already found)
        if (!strengthOverrideReason) {
          strengthOverrideReason = 'name_fragment_match';
        }
        
        // ABSOLUTE HARD OVERRIDE: If ANY name part found in password → NEVER "strong"
        // Override table (applied unconditionally):
        // - Strong → Weak (ALWAYS, no exceptions, no matter the score)
        // - Moderate → Weak (ALWAYS, no exceptions)
        // - Weak → Weak (unchanged)
        
        // FORCE downgrade: Any name match = NEVER "strong"
        // This overrides the base score completely (even if already downgraded by email)
        if (strength === 'strong') {
          strength = 'weak'; // Strong with ANY name part → Weak (HARD RULE)
        } else if (strength === 'moderate') {
          strength = 'weak'; // Moderate with ANY name part → Weak (HARD RULE)
        }
        // Weak remains Weak (unchanged)
        
        // Additional check: multiple matches or long fragments ensure Weak
        if (nameCheck.matchCount > 1 || nameCheck.hasLongMatch) {
          strength = 'weak'; // Multiple matches or long fragments → always Weak
        }
      }
    }
  }

  // Check for low entropy (weak base score)
  if (score < 40 && !strengthOverrideReason) {
    strengthOverrideReason = 'low_entropy';
  }

  // FINAL SAFEGUARD: If email or name parts were found, ensure strength is NEVER "strong"
  // This is an absolute hard rule - double-check to prevent any edge cases
  if ((strengthOverrideReason === 'email_fragment_match' || strengthOverrideReason === 'name_fragment_match') && strength === 'strong') {
    strength = 'weak'; // Force downgrade - cannot be "strong" with email or name parts
  }

  const analysis: PasswordAnalysis = {
    strength,
    score,
    isReused: false, // Will be set by analyzeAccountPasswords
    recommendation: '',
    strengthOverrideReason,
  };

  // Generate recommendation - prioritize email/name part warnings
  if (strengthOverrideReason === 'email_fragment_match') {
    if (containsEmailParts(password, providerEmail ? extractEmailParts(providerEmail) : []).matchCount > 1 || 
        containsEmailParts(password, providerEmail ? extractEmailParts(providerEmail) : []).hasLongMatch) {
      analysis.recommendation = 'Password contains email address components - this makes it WEAK and easy to guess';
    } else {
      analysis.recommendation = 'Password contains parts of your email address - avoid using personal information';
    }
  } else if (strengthOverrideReason === 'name_fragment_match') {
    const nameParts = extractNameParts(commonPasswordPhrases);
    if (containsNameParts(password, nameParts).matchCount > 1 || 
        containsNameParts(password, nameParts).hasLongMatch) {
      analysis.recommendation = 'Password contains your common password phrases - this makes it WEAK and easy to guess';
    } else {
      analysis.recommendation = 'Password contains parts of your name - avoid using personal information';
    }
  } else {
    analysis.recommendation = generateRecommendation(analysis, password);
  }

  return analysis;
}

/**
 * Analyze passwords for multiple accounts
 * Detects reused passwords across services
 * 
 * @param accounts Array of { id, password, providerEmail }
 * @param commonPasswordPhrases Phrases commonly used in passwords (names, words, etc.) separated by newlines or commas
 */
export function analyzeAccountPasswords(
  accounts: Array<{ id: string; password: string; providerEmail?: string }>,
  commonPasswordPhrases?: string
): Map<string, PasswordAnalysis> {
  const analyses = new Map<string, PasswordAnalysis>();
  const passwordToAccounts = new Map<string, string[]>(); // password -> account IDs

  // First pass: analyze each password and track which accounts use it
  for (const account of accounts) {
    const password = account.password || '';
    if (password) {
      if (!passwordToAccounts.has(password)) {
        passwordToAccounts.set(password, []);
      }
      passwordToAccounts.get(password)!.push(account.id);

      // Use providerEmail (normalized) instead of accountEmail
      // Pass commonPasswordPhrases for phrase checking
      const analysis = analyzePassword(password, account.providerEmail, commonPasswordPhrases);
      if (analysis) {
        analyses.set(account.id, analysis);
      }
      // If password is empty, analysis will be null - don't add to map
    }
  }

  // Second pass: mark reused passwords
  for (const [password, accountIds] of passwordToAccounts.entries()) {
    if (accountIds.length > 1) {
      // Password is reused across multiple accounts
      for (const accountId of accountIds) {
        const analysis = analyses.get(accountId);
        if (analysis) {
          analysis.isReused = true;
          // Override reason for reuse takes precedence over email match
          analysis.strengthOverrideReason = 'password_reuse';
          analysis.recommendation = `Password reused across ${accountIds.length} services - use unique passwords`;
        }
      }
    }
  }

  return analyses;
}
