/**
 * Account table component.
 * Displays discovered accounts in a sortable, filterable table.
 */

import React, { useState, useMemo } from 'react';
import { DeduplicatedAccount } from '../../shared/deduplication';
import { DataSource } from '../../shared/types';
import { useMasterList } from '../contexts/MasterListContext';
import { LinkDiscovery } from './LinkDiscovery';
import { ExternalLink } from './ExternalLink';
import './AccountTable.css';

interface AccountTableProps {
  accounts: DeduplicatedAccount[];
}

type SortField = 'service' | 'accountEmail' | 'username' | 'password' | 'passwordStrength';
type SortDirection = 'asc' | 'desc';

export const AccountTable: React.FC<AccountTableProps> = ({ accounts, forceSourceFilter }) => {
  const { removeAccounts, updateAccountLinks } = useMasterList();
  const [sortField, setSortField] = useState<SortField>('service');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filterService, setFilterService] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterSource, setFilterSource] = useState<DataSource | ''>(forceSourceFilter || '');
  const [filterPasswordStrength, setFilterPasswordStrength] = useState<'weak' | 'moderate' | 'strong' | ''>('');
  const [filterPasswordReused, setFilterPasswordReused] = useState<'yes' | 'no' | ''>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);

  // Get unique values for filters
  const uniqueServices = useMemo(() => {
    return Array.from(new Set(accounts.map(a => a.service))).sort();
  }, [accounts]);

  const uniqueAccounts = useMemo(() => {
    return Array.from(new Set(accounts.map(a => a.accountEmail))).sort();
  }, [accounts]);

  const uniqueSources = useMemo(() => {
    return Array.from(new Set(accounts.flatMap(a => a.allSources))).sort();
  }, [accounts]);

  /**
   * Identify duplicate groups based on service or link (email removed to reduce false duplicates)
   * Returns a Map of account ID to group ID
   */
  const duplicateGroups = useMemo(() => {
    const groupMap = new Map<string, string>(); // account ID -> group ID
    const serviceMap = new Map<string, string[]>(); // service -> account IDs
    const linkMap = new Map<string, string[]>(); // link -> account IDs
    const unionFind = new Map<string, string>(); // account ID -> root group ID

    // Helper function to find root of a group (union-find)
    const findRoot = (id: string): string => {
      if (!unionFind.has(id)) {
        unionFind.set(id, id);
        return id;
      }
      const parent = unionFind.get(id)!;
      if (parent === id) {
        return id;
      }
      const root = findRoot(parent);
      unionFind.set(id, root); // Path compression
      return root;
    };

    // Helper function to union two accounts into the same group
    const union = (id1: string, id2: string) => {
      const root1 = findRoot(id1);
      const root2 = findRoot(id2);
      if (root1 !== root2) {
        unionFind.set(root2, root1);
      }
    };

    // Index accounts by service and link (email removed to reduce false duplicates)
    accounts.forEach(account => {
      const accountId = account.id;

      // Group by service
      const service = account.service.toLowerCase().trim();
      if (service) {
        if (!serviceMap.has(service)) {
          serviceMap.set(service, []);
        }
        serviceMap.get(service)!.push(accountId);
      }

      // Group by link (handle comma-separated strings and arrays)
      const linkValue = account.metadata?.link;
      let link: string = '';
      if (linkValue) {
        if (Array.isArray(linkValue)) {
          const firstLink = linkValue[0];
          if (firstLink && typeof firstLink === 'string') {
            link = firstLink.toLowerCase().trim();
          }
        } else if (typeof linkValue === 'string') {
          // Extract first link from comma-separated string
          const firstLink = linkValue.split(',')[0].trim();
          link = firstLink.toLowerCase().trim();
        }
      }
      if (link) {
        if (!linkMap.has(link)) {
          linkMap.set(link, []);
        }
        linkMap.get(link)!.push(accountId);
      }
    });

    // Union all accounts that share the same service or link (email removed)
    for (const ids of serviceMap.values()) {
      if (ids.length > 1) {
        for (let i = 1; i < ids.length; i++) {
          union(ids[0], ids[i]);
        }
      }
    }

    for (const ids of linkMap.values()) {
      if (ids.length > 1) {
        for (let i = 1; i < ids.length; i++) {
          union(ids[0], ids[i]);
        }
      }
    }

    // Assign group IDs to each account
    const groupCounts = new Map<string, number>(); // root ID -> count
    accounts.forEach(account => {
      const root = findRoot(account.id);
      groupMap.set(account.id, root);
      groupCounts.set(root, (groupCounts.get(root) || 0) + 1);
    });

    // Assign human-readable group numbers (only for groups with 2+ accounts)
    let groupNum = 1;
    const groupNumbers = new Map<string, number>(); // root ID -> group number
    const accountIdToGroupNum = new Map<string, number | null>(); // account ID -> group number or null

    accounts.forEach(account => {
      const root = findRoot(account.id);
      const count = groupCounts.get(root) || 0;

      if (count > 1) {
        if (!groupNumbers.has(root)) {
          groupNumbers.set(root, groupNum++);
        }
        accountIdToGroupNum.set(account.id, groupNumbers.get(root)!);
      } else {
        accountIdToGroupNum.set(account.id, null); // No group for single accounts
      }
    });

    return accountIdToGroupNum;
  }, [accounts]);

  // Filter and sort accounts
  const filteredAndSortedAccounts = useMemo(() => {
    let filtered = accounts.filter(account => {
      const matchesService = !filterService || 
        account.service.toLowerCase().includes(filterService.toLowerCase());
      const matchesAccount = !filterAccount || 
        account.accountEmail.toLowerCase().includes(filterAccount.toLowerCase());
      
      // If forceSourceFilter is set, always filter by it; otherwise use filterSource
      const sourceToMatch = forceSourceFilter || filterSource;
      const matchesSource = !sourceToMatch || 
        account.allSources.includes(sourceToMatch as DataSource) ||
        account.source === sourceToMatch ||
        (account.metadata?.source && account.metadata.source.toLowerCase().includes(sourceToMatch.toString().toLowerCase()));
      
      const matchesPasswordStrength = !filterPasswordStrength || 
        (account.metadata?.passwordStrength || '').toLowerCase() === filterPasswordStrength.toLowerCase();
      const matchesPasswordReused = !filterPasswordReused || 
        (account.metadata?.passwordReused || '').toLowerCase() === filterPasswordReused.toLowerCase();

      return matchesService && matchesAccount && matchesSource && matchesPasswordStrength && matchesPasswordReused;
    });

    // Sort accounts by sort field
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'service':
          aValue = a.service.toLowerCase();
          bValue = b.service.toLowerCase();
          break;
        case 'accountEmail':
          aValue = a.accountEmail.toLowerCase();
          bValue = b.accountEmail.toLowerCase();
          break;
        case 'username':
          aValue = (a.metadata?.username || '').toLowerCase();
          bValue = (b.metadata?.username || '').toLowerCase();
          break;
        case 'password':
          aValue = (a.metadata?.password || '').toLowerCase();
          bValue = (b.metadata?.password || '').toLowerCase();
          break;
        case 'passwordStrength':
          const strengthOrder = { weak: 1, moderate: 2, strong: 3 };
          aValue = strengthOrder[(a.metadata?.passwordStrength as any) || 'weak'] || 1;
          bValue = strengthOrder[(b.metadata?.passwordStrength as any) || 'weak'] || 1;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) {
        return sortDirection === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return filtered;
  }, [accounts, filterService, filterAccount, filterSource, filterPasswordStrength, filterPasswordReused, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return '⇅';
    }
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredAndSortedAccounts.map(a => a.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (accountId: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(accountId);
    } else {
      newSelected.delete(accountId);
    }
    setSelectedIds(newSelected);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedIds.size} account(s)?`)) {
      removeAccounts(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  const handleDeleteOne = (accountId: string) => {
    if (confirm('Are you sure you want to delete this account?')) {
      removeAccounts([accountId]);
      selectedIds.delete(accountId);
      setSelectedIds(new Set(selectedIds));
    }
  };

  const allSelected = filteredAndSortedAccounts.length > 0 && 
    filteredAndSortedAccounts.every(a => selectedIds.has(a.id));
  const someSelected = filteredAndSortedAccounts.some(a => selectedIds.has(a.id));

  if (accounts.length === 0) {
    return (
      <div className="account-table-empty">
        <p>No accounts discovered yet. Select a data source above to get started.</p>
      </div>
    );
  }

  return (
    <div className="account-table-container">
      <div className="account-table-filters">
        <div className="filter-group">
          <label htmlFor="filter-service">Filter by Service:</label>
          <input
            id="filter-service"
            type="text"
            value={filterService}
            onChange={(e) => setFilterService(e.target.value)}
            placeholder="Search services..."
            className="filter-input"
          />
        </div>
        <div className="filter-group">
          <label htmlFor="filter-account">Filter by Account:</label>
          <input
            id="filter-account"
            type="text"
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
            placeholder="Search accounts..."
            className="filter-input"
          />
        </div>
        <div className="filter-group">
          <label htmlFor="filter-source">Filter by Source:</label>
          <select
            id="filter-source"
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value as DataSource | '')}
            className="filter-select"
          >
            <option value="">All Sources</option>
            {uniqueSources.map(source => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="filter-password-strength">Filter by Password Strength:</label>
          <select
            id="filter-password-strength"
            value={filterPasswordStrength}
            onChange={(e) => setFilterPasswordStrength(e.target.value as 'weak' | 'moderate' | 'strong' | '')}
            className="filter-select"
          >
            <option value="">All Strengths</option>
            <option value="weak">Weak</option>
            <option value="moderate">Moderate</option>
            <option value="strong">Strong</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="filter-password-reused">Filter by Reused:</label>
          <select
            id="filter-password-reused"
            value={filterPasswordReused}
            onChange={(e) => setFilterPasswordReused(e.target.value as 'yes' | 'no' | '')}
            className="filter-select"
          >
            <option value="">All</option>
            <option value="yes">Reused</option>
            <option value="no">Not Reused</option>
          </select>
        </div>
        {selectedIds.size > 0 && (
          <div className="filter-group filter-actions">
            <button
              onClick={handleDeleteSelected}
              className="btn btn-danger btn-sm"
              style={{ marginTop: '1.5rem' }}
            >
              🗑️ Delete Selected ({selectedIds.size})
            </button>
          </div>
        )}
      </div>

      <div className="account-table-wrapper account-table-scroll">
        <table className="account-table">
          <thead>
            <tr>
              <th className="checkbox-column">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              </th>
              <th onClick={() => handleSort('service')} className="sortable">
                Service {getSortIcon('service')}
              </th>
              <th>Link</th>
              <th onClick={() => handleSort('username')} className="sortable">
                Username {getSortIcon('username')}
              </th>
              <th onClick={() => handleSort('password')} className="sortable">
                Password {getSortIcon('password')}
              </th>
              <th onClick={() => handleSort('passwordStrength')} className="sortable">
                Password Strength {getSortIcon('passwordStrength')}
              </th>
              <th>Reused?</th>
              <th>Source</th>
              <th className="actions-column">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedAccounts.map(account => {
              const truncateEmail = (email: string, maxLength: number = 30) => {
                if (email.length <= maxLength) return email;
                return email.substring(0, maxLength) + '...';
              };
              
              return (
                <React.Fragment key={account.id}>
                  <tr className={selectedIds.has(account.id) ? 'row-selected' : ''}>
                    <td className="checkbox-column">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(account.id)}
                        onChange={(e) => handleSelectOne(account.id, e.target.checked)}
                      />
                    </td>
                    <td>{account.service}</td>
                    <td className="link-cell">
                      {(() => {
                        const linkValue = account.metadata?.link;
                        if (!linkValue) {
                          return <span className="text-muted" title="Link not available">-</span>;
                        }
                        
                        // Handle array of links (backward compatibility)
                        if (Array.isArray(linkValue)) {
                          if (linkValue.length === 0) {
                            return <span className="text-muted" title="Link not available">-</span>;
                          }
                          if (linkValue.length === 1) {
                            return (
                              <ExternalLink href={linkValue[0]} className="service-link">
                                {truncateEmail(linkValue[0], 35)}
                              </ExternalLink>
                            );
                          }
                          // Multiple links - show first link + indicator
                          return (
                            <div className="multi-link-container">
                              <ExternalLink href={linkValue[0]} className="service-link">
                                {truncateEmail(linkValue[0], 30)} ({linkValue.length})
                              </ExternalLink>
                              <span className="multi-link-tooltip" title={linkValue.join('\n')}>
                                📋 {linkValue.length} links
                              </span>
                            </div>
                          );
                        }
                        
                        // Handle comma-separated string links
                        if (typeof linkValue === 'string') {
                          const links = linkValue.split(',').map(l => l.trim()).filter(l => l);
                          if (links.length === 0) {
                            return <span className="text-muted" title="Link not available">-</span>;
                          }
                          if (links.length === 1) {
                            return (
                              <ExternalLink href={links[0]} className="service-link">
                                {truncateEmail(links[0], 35)}
                              </ExternalLink>
                            );
                          }
                          // Multiple comma-separated links - show first link + indicator
                          return (
                            <div className="multi-link-container">
                              <ExternalLink href={links[0]} className="service-link">
                                {truncateEmail(links[0], 30)} ({links.length})
                              </ExternalLink>
                              <span className="multi-link-tooltip" title={links.join('\n')}>
                                📋 {links.length} links
                              </span>
                            </div>
                          );
                        }
                        
                        return <span className="text-muted" title="Link not available">-</span>;
                      })()}
                    </td>
                    <td>{account.metadata?.username || '-'}</td>
                    <td className="password-cell">{account.metadata?.password || '-'}</td>
                    <td>{getPasswordStrengthBadge(account.metadata?.passwordStrength)}</td>
                    <td>{getReusedBadge(account.metadata?.passwordReused)}</td>
                    <td>
                      {(() => {
                        // Show source from metadata if available, otherwise use account.source
                        const sourceFromMetadata = account.metadata?.source;
                        if (sourceFromMetadata) {
                          // If it says "Imported" or similar, show "Imported"
                          if (sourceFromMetadata.toLowerCase().includes('import')) {
                            return 'Imported';
                          }
                          return sourceFromMetadata;
                        }
                        // Fallback to account.source or allSources
                        if (account.allSources && account.allSources.length > 0) {
                          const sources = account.allSources.map(s => {
                            const sourceStr = s.toString();
                            if (sourceStr.toLowerCase().includes('import')) {
                              return 'Imported';
                            }
                            return sourceStr;
                          });
                          return sources.join(', ');
                        }
                        const sourceStr = account.source?.toString() || '';
                        if (sourceStr.toLowerCase().includes('import')) {
                          return 'Imported';
                        }
                        return sourceStr || 'Unknown';
                      })()}
                    </td>
                    <td className="actions-column">
                      <button
                        onClick={() => setExpandedAccountId(
                          expandedAccountId === account.id ? null : account.id
                        )}
                        className="btn-link-discovery"
                        title="Find account management links"
                      >
                        🔗
                      </button>
                      <button
                        onClick={() => handleDeleteOne(account.id)}
                        className="btn-delete"
                        title="Delete account"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                  {expandedAccountId === account.id && (
                    <tr>
                      <td colSpan={9} className="link-discovery-cell">
                        <LinkDiscovery
                          accountId={account.id}
                          serviceName={account.service}
                          serviceDomain={extractDomainFromAccount(account)}
                          existingLinks={{
                            'change-password': (() => {
                              const val = account.metadata?.['change-password'] || account.metadata?.['changePassword'];
                              return Array.isArray(val) ? val[0] || '' : val || '';
                            })(),
                            'delete-account': (() => {
                              const val = account.metadata?.['delete-account'] || account.metadata?.['deleteAccount'];
                              return Array.isArray(val) ? val[0] || '' : val || '';
                            })(),
                            'security-settings': (() => {
                              const val = account.metadata?.['security-settings'] || account.metadata?.['securitySettings'];
                              return Array.isArray(val) ? val[0] || '' : val || '';
                            })(),
                          }}
                          onConfirmLinks={(accountId, links) => updateAccountLinks(accountId, links)}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="account-table-footer">
        <p>
          Showing <strong>{filteredAndSortedAccounts.length}</strong> of <strong>{accounts.length}</strong> accounts
        </p>
      </div>
    </div>
  );
};

// Helper function to render password strength badge
function getPasswordStrengthBadge(strength: string | undefined): React.ReactNode {
  // If no strength (empty password), show "-" instead of "Weak"
  if (!strength || strength === '') {
    return <span className="badge badge-default">-</span>;
  }
  
  switch (strength) {
    case 'strong':
      return <span className="badge badge-strong">Strong</span>;
    case 'moderate':
      return <span className="badge badge-moderate">Moderate</span>;
    case 'weak':
      return <span className="badge badge-weak">Weak</span>;
    default:
      return <span className="badge badge-default">-</span>;
  }
}

// Helper function to render reused password badge
function getReusedBadge(reused: string | undefined): React.ReactNode {
  if (reused === 'yes') {
    return <span className="badge badge-warning">Yes</span>;
  }
  return <span className="badge badge-no">No</span>;
}

// Helper function to extract domain from account
function extractDomainFromAccount(account: DeduplicatedAccount): string | undefined {
  // Try to extract domain from account email
  const email = account.accountEmail;
  if (email && email.includes('@')) {
    const domain = email.split('@')[1];
    return domain;
  }
  
  // Try to infer from service name
  const service = account.service.toLowerCase();
  if (service.includes('.')) {
    return service;
  }
  
  return undefined;
}
