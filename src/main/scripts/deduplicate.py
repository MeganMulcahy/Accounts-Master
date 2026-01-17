#!/usr/bin/env python3
"""
Python script for cleaning duplicates in discovered accounts.
This script provides advanced deduplication logic that can be customized.

Usage: python3 deduplicate.py
Input: JSON array of accounts via stdin
Output: JSON array of cleaned accounts via stdout
"""

import json
import sys
from datetime import datetime
from typing import Dict, List, Any
from collections import defaultdict


def create_deduplication_hash(service: str, account_email: str) -> str:
    """Create a hash for deduplication based on service and email."""
    # Normalize service name (lowercase, strip whitespace)
    service_normalized = service.lower().strip()
    # Normalize email (lowercase, strip whitespace)
    email_normalized = account_email.lower().strip()
    # Create hash
    return f"{service_normalized}::{email_normalized}"


def deduplicate_accounts(accounts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Deduplicate accounts based on service name and account email.
    Combines information from multiple sources into a single entry.
    """
    account_map: Dict[str, Dict[str, Any]] = {}
    
    for account in accounts:
        # Create hash for deduplication
        base_hash = create_deduplication_hash(
            account.get('service', ''),
            account.get('accountEmail', '')
        )
        
        if base_hash not in account_map:
            # First time seeing this account
            account_map[base_hash] = {
                **account,
                'allSources': [account.get('source', '')],
                'firstDiscoveredAt': account.get('discoveredAt', ''),
                'lastDiscoveredAt': account.get('discoveredAt', ''),
            }
        else:
            # Account already exists - merge information
            existing = account_map[base_hash]
            
            # Add source if not already present
            source = account.get('source', '')
            if source and source not in existing.get('allSources', []):
                existing['allSources'].append(source)
            
            # Update discovery dates
            account_date = account.get('discoveredAt', '')
            if account_date:
                try:
                    account_dt = datetime.fromisoformat(account_date.replace('Z', '+00:00'))
                    first_dt = datetime.fromisoformat(existing['firstDiscoveredAt'].replace('Z', '+00:00'))
                    last_dt = datetime.fromisoformat(existing['lastDiscoveredAt'].replace('Z', '+00:00'))
                    
                    if account_dt < first_dt:
                        existing['firstDiscoveredAt'] = account_date
                    if account_dt > last_dt:
                        existing['lastDiscoveredAt'] = account_date
                except:
                    # If date parsing fails, keep existing dates
                    pass
            
            # Update id to reflect latest source
            existing['id'] = account.get('id', existing.get('id'))
            
            # Merge metadata
            if 'metadata' in account and account['metadata']:
                if 'metadata' not in existing:
                    existing['metadata'] = {}
                existing['metadata'].update(account['metadata'])
    
    return list(account_map.values())


def main():
    """Main function to read accounts from stdin and output cleaned accounts to stdout."""
    try:
        # Read accounts JSON from stdin
        input_data = sys.stdin.read()
        accounts = json.loads(input_data)
        
        if not isinstance(accounts, list):
            raise ValueError("Input must be a JSON array of accounts")
        
        # Deduplicate accounts
        cleaned_accounts = deduplicate_accounts(accounts)
        
        # Output cleaned accounts as JSON to stdout
        result = {
            'accounts': cleaned_accounts,
            'original_count': len(accounts),
            'cleaned_count': len(cleaned_accounts),
        }
        
        print(json.dumps(result))
        
    except json.JSONDecodeError as e:
        print(json.dumps({
            'error': f'Invalid JSON input: {str(e)}',
            'accounts': [],
        }), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            'error': f'Error processing accounts: {str(e)}',
            'accounts': [],
        }), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
