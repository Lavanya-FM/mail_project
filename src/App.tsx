// src/App.tsx
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Auth from './components/Auth';
import MailLayout from './components/MailLayout';

function AppInner() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <MailLayout /> : <Auth />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
