/**
 * Main React application component with multi-page routing.
 * Privacy-first account discovery application.
 */

import React, { useState, useEffect } from 'react';
import { MasterListProvider } from './contexts/MasterListContext';
import { PrivacyBanner } from './components/PrivacyBanner';
import { HomePage } from './pages/HomePage';
import { EmailPage } from './pages/EmailPage';
import { GmailSubscriptionsPage } from './pages/GmailSubscriptionsPage';
import { PasswordManagerPage } from './pages/PasswordManagerPage';
import { ConnectedAppsPage } from './pages/ConnectedAppsPage';
import './App.css';

type Page = 'home' | 'email' | 'gmail' | 'outlook' | 'passwords' | 'keychain' | 'oauth';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');

  useEffect(() => {
    // Initialize app
    const initializeApp = async () => {
      try {
        if (window.electronAPI) {
          const appInfo = await window.electronAPI.getAppInfo();
          console.log('App initialized:', appInfo);
        }
      } catch (err) {
        console.error('Failed to initialize app:', err);
      }
    };

    initializeApp();
  }, []);

  /**
   * Handle navigation between pages
   */
  const handleNavigate = (page: string) => {
    // Map string navigation to Page type
    const pageMap: Record<string, Page> = {
      home: 'home',
      email: 'email',
      gmail: 'gmail',
      outlook: 'outlook',
      passwords: 'passwords',
      chrome: 'passwords', // Alias for passwords
      keychain: 'keychain',
      oauth: 'oauth',
    };

    const mappedPage = pageMap[page] || 'home';
    setCurrentPage(mappedPage);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage onNavigate={handleNavigate} />;
      case 'email':
        return <EmailPage onNavigate={handleNavigate} />;
      case 'gmail':
        return <GmailSubscriptionsPage onNavigate={handleNavigate} />;
      case 'outlook':
        return <GmailSubscriptionsPage onNavigate={handleNavigate} provider="outlook" />;
      case 'passwords':
        return <PasswordManagerPage onNavigate={handleNavigate} />;
      case 'keychain':
        return <PasswordManagerPage onNavigate={handleNavigate} />;
      case 'oauth':
        return <ConnectedAppsPage onNavigate={handleNavigate} />;
      default:
        return <HomePage onNavigate={handleNavigate} />;
    }
  };

  return (
    <MasterListProvider>
      <div className="app">
        <PrivacyBanner />
        
        <div className="app-header">
          <h1>Privacy-First Account Discovery</h1>
        </div>

        <div className="app-content">
          {renderPage()}
        </div>
      </div>
    </MasterListProvider>
  );
}

export default App;
