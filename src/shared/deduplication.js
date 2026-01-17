"use strict";
/**
 * Deduplication logic for discovered accounts.
 * Ensures that the same service/account combination is only stored once,
 * while preserving information about all sources where it was found.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deduplicateAccounts = deduplicateAccounts;
exports.groupAccountsByEmail = groupAccountsByEmail;
exports.groupAccountsBySource = groupAccountsBySource;
const security_1 = require("./security");
/**
 * Deduplicates accounts based on service name, account email, and source.
 * Combines information from multiple sources into a single entry.
 */
function deduplicateAccounts(accounts) {
    const accountMap = new Map();
    for (const account of accounts) {
        // Create a base hash for deduplication (without source)
        const baseHash = (0, security_1.createDeduplicationHash)(account.service, account.accountEmail, '');
        let dedupedAccount = accountMap.get(baseHash);
        if (!dedupedAccount) {
            // First time seeing this account
            dedupedAccount = {
                ...account,
                allSources: [account.source],
                firstDiscoveredAt: new Date(account.discoveredAt),
                lastDiscoveredAt: new Date(account.discoveredAt),
            };
            accountMap.set(baseHash, dedupedAccount);
        }
        else {
            // Account already exists - merge information
            // Add source if not already present
            if (!dedupedAccount.allSources.includes(account.source)) {
                dedupedAccount.allSources.push(account.source);
            }
            // Update discovery dates
            const accountDate = new Date(account.discoveredAt);
            if (accountDate < dedupedAccount.firstDiscoveredAt) {
                dedupedAccount.firstDiscoveredAt = accountDate;
            }
            if (accountDate > dedupedAccount.lastDiscoveredAt) {
                dedupedAccount.lastDiscoveredAt = accountDate;
            }
            // Update id to reflect latest source
            dedupedAccount.id = account.id;
            // Merge metadata
            if (account.metadata) {
                dedupedAccount.metadata = {
                    ...dedupedAccount.metadata,
                    ...account.metadata,
                };
            }
        }
    }
    return Array.from(accountMap.values());
}
/**
 * Groups accounts by originating account email
 */
function groupAccountsByEmail(accounts) {
    const grouped = new Map();
    for (const account of accounts) {
        const email = account.accountEmail;
        if (!grouped.has(email)) {
            grouped.set(email, []);
        }
        grouped.get(email).push(account);
    }
    return grouped;
}
/**
 * Groups accounts by data source
 */
function groupAccountsBySource(accounts) {
    const grouped = new Map();
    for (const account of accounts) {
        for (const source of account.allSources) {
            if (!grouped.has(source)) {
                grouped.set(source, []);
            }
            grouped.get(source).push(account);
        }
    }
    return grouped;
}
