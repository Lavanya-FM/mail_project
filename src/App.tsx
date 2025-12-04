import { ThemeProvider } from './contexts/ThemeContext';
import { authService } from './lib/authService';
import { isSuperadminAuthenticated } from './lib/superadminService';
import Auth from './components/Auth';
import MainApp from './components/MainApp';
import SuperAdminDashboard from './components/SuperAdminDashboard';

function App() {
  const isSuperadmin = isSuperadminAuthenticated();
  const isRegularUser = authService.isAuthenticated();

  return (
    <ThemeProvider>
      {isSuperadmin ? (
        <SuperAdminDashboard />
      ) : isRegularUser ? (
        <MainApp />
      ) : (
        <Auth />
      )}
    </ThemeProvider>
  );
}

export default App;

