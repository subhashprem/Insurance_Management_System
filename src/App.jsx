import React, { useState, useEffect } from 'react';
import { ToastProvider } from './components/Toast.jsx';
import AppShell from './components/AppShell.jsx';
import LoginPage from './pages/LoginPage.jsx';
import LicenseRenewalPage from './pages/LicenseRenewalPage.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [activePage, setActivePage] = useState('dashboard');
  const [loading, setLoading] = useState(true);

  // On mount — get license state from main process
  useEffect(() => {
    window.electronAPI.getLicenseInfo().then(info => {
      setLicenseInfo(info);
      setLoading(false);
    }).catch(() => {
      setLicenseInfo({ status: 'valid', daysLeft: 365 });
      setLoading(false);
    });

    // Theme sync
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    setActivePage('dashboard');
    
    // Fetch fresh license info because first login initializes/starts the license timer
    window.electronAPI.licenseCheck().then(info => {
      setLicenseInfo(info);
      if (info && userData?.role !== 'developer') {
        if (info.daysLeft <= 15 && info.daysLeft > 0) {
          alert(`${info.daysLeft} days are remaining in the License Expiration`);
        } else if (info.daysLeft <= 30 && info.daysLeft > 15) {
          alert(`Your software license is expiring soon (${info.daysLeft} days left). Please renew your license.`);
        }
      }
    }).catch(() => {});
  };

  const handleLogout = () => {
    setUser(null);
    setActivePage('dashboard');
  };

  const handleNavigate = (page) => {
    setActivePage(page);
  };

  const handleProfileUpdate = (updated) => {
    setUser(prev => ({ ...prev, ...updated }));
  };

  const handleCheckLicense = () => {
    window.electronAPI.licenseCheck().then(info => {
      setLicenseInfo(info);
    }).catch(() => {});
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', background: 'var(--bg-base)' }}>
        <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3, borderTopColor: 'var(--accent)' }} />
      </div>
    );
  }

  // System date clock tampering block
  if (licenseInfo?.status === 'tampered') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        background: '#121212',
        color: '#ffffff',
        fontFamily: "'Outfit', sans-serif",
        textAlign: 'center',
        padding: '24px'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '40px',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(10px)'
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '64px', color: '#ff3b30', marginBottom: '20px' }}>history</span>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '12px' }}>System Date Manipulation Detected</h2>
          <p style={{ fontSize: '14px', color: '#a0a0a0', lineHeight: '1.6', marginBottom: '24px' }}>
            The system clock appears to have been modified or set backwards. Access to the software is suspended for security purposes.
          </p>
          <div style={{
            fontSize: '12px',
            background: 'rgba(255, 59, 48, 0.1)',
            border: '1px solid rgba(255, 59, 48, 0.2)',
            borderRadius: '8px',
            padding: '12px',
            color: '#ff453a',
            fontWeight: 'bold',
            marginBottom: '20px'
          }}>
            Please correct your system date and click the button below to re-verify.
          </div>
          <button 
            onClick={handleCheckLicense}
            style={{
              padding: '12px 24px',
              background: '#007aff',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer',
              textTransform: 'uppercase',
              fontSize: '12px',
              letterSpacing: '1px',
              transition: 'background 0.2s'
            }}
          >
            Re-check Clock Status
          </button>
        </div>
      </div>
    );
  }

  // License expired — show locked renewal screen regardless of login state
  if (licenseInfo?.status === 'expired') {
    return (
      <ToastProvider>
        <LicenseRenewalPage licenseInfo={licenseInfo} onRenewed={handleCheckLicense} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      {!user
        ? <LoginPage onLogin={handleLogin} />
        : <AppShell
          user={user}
          licenseInfo={licenseInfo}
          onLicenseUpdated={setLicenseInfo}
          activePage={activePage}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
          onProfileUpdate={handleProfileUpdate}
        />
      }
    </ToastProvider>
  );
}
