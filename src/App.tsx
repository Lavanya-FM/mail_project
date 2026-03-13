// App Version: 1.0.1-v11-fixed
import { useEffect } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { authService } from './lib/authService';
import { isSuperadminAuthenticated } from './lib/superadminService';
import Auth from './components/Auth';
import MainApp from './components/MainApp';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import toast, { Toaster } from 'react-hot-toast';
import SupportPage from './components/SupportPage';

function App() {
  const isSuperadmin = isSuperadminAuthenticated();
  const isRegularUser = authService.isAuthenticated();

  useEffect(() => {
    console.log("JeeMail Build v1.0.1-v11-fixed Loaded");
  }, []);

  // Global toast event listener (for events from non-React code)
  useEffect(() => {
    const handleToast = (e: any) => {
      const { type, message } = e.detail || {};
      if (type === 'error') toast.error(message);
      else if (type === 'success') toast.success(message);
      else toast(message);
    };
    window.addEventListener('show-toast', handleToast);
    return () => window.removeEventListener('show-toast', handleToast);
  }, []);

  if (window.location.pathname === '/support') {
    return (
      <ThemeProvider>
        <Toaster position="top-right" />
        <SupportPage />
      </ThemeProvider>
    );
  }

  return (
    <>
      {/* Toast notifications */}
      <Toaster position="top-right" />

      {/* App Theme Wrapper */}
      <ThemeProvider>
        {isSuperadmin ? (
          <SuperAdminDashboard />
        ) : isRegularUser ? (
          <MainApp />
        ) : (
          <Auth />
        )}
      </ThemeProvider>
    </>
  );
}

export default App;
