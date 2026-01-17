# Setup Guide

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Build the Application**
   ```bash
   npm run build
   ```

3. **Run in Development Mode**
   ```bash
   npm run dev
   ```

## Development Scripts

- `npm run dev` - Start development server (React + Electron)
- `npm run build` - Build the entire application
- `npm run build:main` - Build Electron main process only
- `npm run build:renderer` - Build React frontend only

## OAuth Configuration (Optional)

To use OAuth-based data sources, you need to:

1. **Create a `.env` file** in the project root (copy from `.env.example`)

2. **Register OAuth Applications**:
   - **Gmail**: [Google Cloud Console](https://console.cloud.google.com/)
     - Create OAuth 2.0 credentials
     - Add `http://localhost:5173/oauth/callback` as redirect URI
     - Set scopes: `https://www.googleapis.com/auth/gmail.readonly`
   
   - **Microsoft**: [Azure Portal](https://portal.azure.com/)
     - Register an app in Azure AD
     - Add redirect URI: `http://localhost:5173/oauth/callback`
     - Set scopes: `User.Read offline_access`
   
   - **Facebook**: [Facebook Developers](https://developers.facebook.com/)
     - Create a new app
     - Add OAuth redirect URI
     - Set permissions: `email`
   
   - **Twitter/X**: [Twitter Developer Portal](https://developer.twitter.com/)
     - Create a new app
     - Generate OAuth 2.0 credentials
     - Set redirect URI: `http://localhost:5173/oauth/callback`

3. **Add credentials to `.env`**:
   ```
   REACT_APP_GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
   REACT_APP_MICROSOFT_CLIENT_ID=your-client-id
   REACT_APP_FACEBOOK_APP_ID=your-app-id
   REACT_APP_TWITTER_CLIENT_ID=your-client-id
   ```

## File-Based Data Sources

No configuration needed for file-based sources:
- **Chrome Passwords**: Export from Chrome Settings → Passwords → Export
- **Apple Keychain**: Export from Keychain Access → File → Export
- **Gmail Takeout**: Download from [Google Takeout](https://takeout.google.com/)

## Building for Production

```bash
npm run build
```

This will:
1. Compile TypeScript files
2. Build the React frontend
3. Package the Electron application for your platform

Build outputs will be in the `dist` directory.

## Troubleshooting

### OAuth Not Working
- Ensure OAuth credentials are correctly set in `.env`
- Check that redirect URIs match in both the app and OAuth provider settings
- Verify that scopes are correctly requested

### File Parsing Errors
- Ensure files are in the correct format (CSV for Chrome, MBOX for Gmail)
- Check that file size is under 50MB
- Verify account email is correctly entered

### Build Errors
- Ensure all dependencies are installed: `npm install`
- Check TypeScript version compatibility
- Clear node_modules and reinstall if issues persist

## Security Notes

- All processing happens locally on your machine
- OAuth tokens are stored in memory only and cleared after use
- No passwords or credentials are ever stored
- File processing is limited to 50MB per file
- Rate limiting is applied to all API calls
