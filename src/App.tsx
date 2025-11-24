import { ThemeProvider } from './contexts/ThemeContext';
import { authService } from './lib/authService';
import Auth from './components/Auth';
import MailLayout from './components/MailLayout';

function App() {
  const isAuthenticated = authService.isAuthenticated();

  return (
    <ThemeProvider>
      {isAuthenticated ? <MailLayout /> : <Auth />}
    </ThemeProvider>
  );
}

export default App;
