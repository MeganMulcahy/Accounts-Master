/**
 * Account table component.
 * Displays discovered accounts in a sortable, filterable table.
 */

import React, { useState, useMemo } from 'react';
import { DeduplicatedAccount } from '../../shared/deduplication';
import { DataSource } from '../../shared/types';
import { useMasterList } from '../contexts/MasterListContext';
import './AccountTable.css';

interface AccountTableProps {
  accounts: DeduplicatedAccount[];
}

type SortField = 'service' | 'accountEmail' | 'username';
type SortDirection = 'asc' | 'desc';

export const AccountTable: React.FC<AccountTableProps> = ({ accounts }) => {
  const { removeAccounts } = useMasterList();
  const [sortField, setSortField] = useState<SortField>('service');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filterService, setFilterService] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterSource, setFilterSource] = useState<DataSource | ''>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  // Filter and sort accounts
  const filteredAndSortedAccounts = useMemo(() => {
    let filtered = accounts.filter(account => {
      const matchesService = !filterService || 
        account.service.toLowerCase().includes(filterService.toLowerCase());
      const matchesAccount = !filterAccount || 
        account.accountEmail.toLowerCase().includes(filterAccount.toLowerCase());
      const matchesSource = !filterSource || 
        account.allSources.includes(filterSource as DataSource);

      return matchesService && matchesAccount && matchesSource;
    });

    // Sort accounts
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
  }, [accounts, filterService, filterAccount, filterSource, sortField, sortDirection]);

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
              <th onClick={() => handleSort('accountEmail')} className="sortable">
                Email {getSortIcon('accountEmail')}
              </th>
              <th onClick={() => handleSort('username')} className="sortable">
                Username {getSortIcon('username')}
              </th>
              <th>Password</th>
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
                <tr key={account.id} className={selectedIds.has(account.id) ? 'row-selected' : ''}>
                  <td className="checkbox-column">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(account.id)}
                      onChange={(e) => handleSelectOne(account.id, e.target.checked)}
                    />
                  </td>
                  <td>{account.service}</td>
                  <td className="truncated-email" title={account.accountEmail}>
                    {truncateEmail(account.accountEmail)}
                  </td>
                  <td>{account.metadata?.username || '-'}</td>
                  <td className="password-cell">{account.metadata?.password || '-'}</td>
                  <td className="actions-column">
                    <button
                      onClick={() => handleDeleteOne(account.id)}
                      className="btn-delete"
                      title="Delete account"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
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
