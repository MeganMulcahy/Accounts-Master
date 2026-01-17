# Privacy-First Account Discovery

A desktop application that helps users discover all their accounts and connected services across multiple platforms (Gmail, Chrome, Apple, Microsoft, Facebook, Twitter/X) while maintaining complete privacy.

## 🔒 Core Privacy Principles

- **NEVER stores passwords, credentials, or tokens**
- **All processing happens locally** on your machine
- **No data is sent to external servers**
- **OAuth tokens are stored in memory only** and cleared after use
- **All user data is cleared from memory** after processing

## Features

- **Multi-account support**: Track accounts from multiple Gmail/Apple/Microsoft accounts
- **Multiple data sources**:
  - Gmail subscriptions (via Google Takeout MBOX or OAuth)
  - Chrome saved passwords (CSV export)
  - Apple Keychain (exported passwords)
  - Microsoft connected apps (OAuth)
  - Facebook connected apps (OAuth)
  - Twitter/X connected apps (OAuth)
- **Unified table**: Sortable, filterable display of all discovered accounts
- **Deduplication**: Automatically deduplicates entries across sources
- **Export functionality**: Export to CSV or Excel format
- **Rate limiting**: Implements rate limiting and exponential backoff for API calls

## Architecture

- **Frontend**: React + TypeScript + Vite
- **Backend**: Electron (Node.js) for local file processing
- **Modular parsers**: Plugin-style architecture for each data source
- **Local-only processing**: All data processing happens on the user's machine

## Installation

1. Install dependencies:
```bash
npm install
```

2. Build the application:
```bash
npm run build
```

3. Run in development mode:
```bash
npm run dev
```

## Development

### Project Structure

```
src/
├── main/                 # Electron main process
│   ├── parsers/         # Data source parsers
│   ├── main.ts          # Main Electron process
│   └── preload.ts       # Preload script
├── renderer/            # React frontend
│   ├── components/      # React components
│   │   ├── oauth/       # OAuth handlers
│   │   └── ...
│   └── utils/           # Utility functions
└── shared/              # Shared types and utilities
    ├── types.ts         # TypeScript types
    ├── security.ts      # Security utilities
    ├── rateLimiter.ts   # Rate limiting
    └── deduplication.ts # Deduplication logic
```

## OAuth Setup

To use OAuth-based data sources (Gmail, Microsoft, Facebook, Twitter/X), you'll need to:

1. Register applications with each platform
2. Obtain OAuth client IDs and secrets
3. Add them to environment variables:
   - `REACT_APP_GMAIL_CLIENT_ID`
   - `REACT_APP_MICROSOFT_CLIENT_ID`
   - `REACT_APP_FACEBOOK_APP_ID`
   - `REACT_APP_TWITTER_CLIENT_ID`

**Note**: OAuth implementations are scaffolded but require platform-specific setup. Refer to each platform's developer documentation.

## Usage

1. **File-based sources**: 
   - Export your passwords/subscriptions from the respective platform
   - Enter your account email
   - Select the file type and upload

2. **OAuth-based sources**:
   - Click the OAuth button for the desired platform
   - Authenticate using your credentials
   - Discover connected accounts (tokens are stored in memory only)

3. **Export**:
   - Click "Export to CSV" or "Export to Excel"
   - Choose where to save the file

## Security Notes

- All file processing happens locally
- Passwords are never stored or displayed
- OAuth tokens are cleared from memory after use
- Rate limiting prevents API abuse
- Input validation prevents malicious file uploads
- File size limits prevent memory exhaustion

## License

MIT
