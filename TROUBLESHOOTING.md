# Troubleshooting Guide

## Build Errors Fixed

### TypeScript Configuration
The main process TypeScript config has been updated to allow importing from the `shared` directory. The `rootDir` has been changed from `./src/main` to `./src` to accommodate shared modules.

### Type Errors
All type errors in `oauthParsers.ts` have been fixed by adding proper type assertions for API responses.

## Development Server Issues

### Running in Development Mode

When you run `npm run dev`, two processes start:
1. **Vite dev server** (http://localhost:5173) - Serves the React app
2. **Electron** - Launches the desktop app

**Important**: You should **NOT** manually open http://localhost:5173 in a browser. Electron will automatically open a window that loads the React app.

### If Electron Doesn't Launch

1. Check that both processes are running:
   - You should see Vite starting on port 5173
   - You should see Electron launching after Vite is ready

2. If Electron window doesn't appear:
   - Wait a few seconds for Vite to fully start
   - Check the terminal for any error messages
   - Try killing all node processes and restarting

3. If you see errors about the preload script:
   - Make sure `dist/preload.js` exists (run `npm run build:main` first)
   - Or Electron should rebuild it automatically

### Testing in Browser vs Electron

**Browser Testing** (Limited):
- The app will load in a browser at http://localhost:5173
- File-based features (Chrome CSV, Apple export, Gmail Takeout) **will NOT work** in browser
- OAuth features may work but are designed for Electron context
- Export features may work for Excel (browser-based)

**Electron Testing** (Full Features):
- All features work in Electron context
- File processing happens locally
- IPC communication enables full functionality

### Common Issues

#### "Electron API not available"
- This is normal if opening the app in a browser
- File upload features require Electron context
- Use Electron window instead of browser

#### "Cannot find module" errors
- Run `npm run build:main` to compile the main process
- Ensure all dependencies are installed: `npm install`

#### TypeScript compilation errors
- All shared module imports should work now
- If you see import errors, check that `tsconfig.main.json` includes `src/shared/**/*`

#### Vite dev server not starting
- Check if port 5173 is already in use
- Kill any processes on that port: `lsof -ti:5173 | xargs kill`
- Restart the dev server

## Building for Production

```bash
npm run build
```

This will:
1. Compile the main process TypeScript (`npm run build:main`)
2. Build the React frontend (`npm run build:renderer`)
3. Package the Electron app (`electron-builder`)

**Note**: Make sure to run `npm run build:main` at least once before running `npm run dev` to generate the preload script.

## Next Steps

1. **First build**: Run `npm run build:main` to compile the main process
2. **Development**: Run `npm run dev` and wait for Electron window to open
3. **Testing**: Use the Electron window (not browser) for full functionality

## Getting Help

If issues persist:
- Check terminal output for specific error messages
- Verify all dependencies are installed correctly
- Ensure Node.js version is compatible (v18+ recommended)
- Check that TypeScript is compiling without errors
