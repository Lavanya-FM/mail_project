// src/components/Auth.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Sparkles, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from './ThemeToggle';

export default function Auth() {
  const navigate = useNavigate();
  // get both canonical names and aliases (AuthContext provides aliases)
  const { register, login, signUp, signIn } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Accept `user@jeemail.in` and subdomains like `user@mail.jeemail.in`
  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@(?:[^\s@]+\.)?jeemail\.in$/i;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedPassword = password.trim();
      const trimmedName = fullName.trim();

      if (isSignUp) {
        // Registration validation
        if (!validateEmail(trimmedEmail)) {
          setError('Email must be from jeemail.in domain');
          setLoading(false);
          return;
        }

        if (trimmedPassword.length < 6) {
          setError('Password must be at least 6 characters');
          setLoading(false);
          return;
        }

        if (trimmedName.length < 2) {
          setError('Full name must be at least 2 characters');
          setLoading(false);
          return;
        }

        console.log('📝 Registering with:', {
          fullName: trimmedName,
          email: trimmedEmail,
          password: '***'
        });

        // pick whichever function is available
        const regFn = typeof register === 'function' ? register : (typeof signUp === 'function' ? signUp : undefined);

        if (!regFn) {
          setError('Registration function not available');
          setLoading(false);
          return;
        }

        const result = await regFn(trimmedName, trimmedEmail, trimmedPassword);

        if (result && result.success) {
          console.log('✅ Registration successful!');
          setSuccess('Account created successfully! Redirecting...');
          setLoading(false);
          // navigate to home or inbox — change route as needed
          setTimeout(() => navigate('/', { replace: true }), 700);
        } else {
          setError(result?.error || 'Registration failed');
          setLoading(false);
        }

      } else {
        // Login validation
        if (!trimmedEmail || !trimmedPassword) {
          setError('Please enter both email and password');
          setLoading(false);
          return;
        }

        console.log('🔐 Logging in with:', trimmedEmail);

        const loginFn = typeof login === 'function' ? login : (typeof signIn === 'function' ? signIn : undefined);

        if (!loginFn) {
          setError('Login function not available');
          setLoading(false);
          return;
        }

        const result = await loginFn(trimmedEmail, trimmedPassword);

        if (result && result.success) {
          console.log('✅ Login successful!');
          setSuccess('Login successful! Redirecting...');
          setLoading(false);
          setTimeout(() => navigate('/', { replace: true }), 300);
        } else {
          setError(result?.error || 'Login failed');
          setLoading(false);
        }
      }
    } catch (err: unknown) {
      console.error('❌ Error:', err);
      let errorMessage = 'An unexpected error occurred';

      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null && 'message' in err) {
        errorMessage = String((err as { message: unknown }).message);
      }

      if (errorMessage.includes('already registered')) {
        errorMessage = 'This email is already registered. Please sign in instead.';
      } else if (errorMessage.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password. Please try again.';
      } else if (errorMessage.includes('Email not confirmed')) {
        errorMessage = 'Please check your email and confirm your account.';
      }

      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md relative">
        <div className="bg-white/90 dark:bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-200/50 dark:border-white/20 p-8">
          <div className="flex items-center justify-center mb-8">
            <div className="bg-gradient-to-br from-blue-400 to-cyan-400 p-4 rounded-2xl shadow-lg">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-2">
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p className="text-gray-600 dark:text-slate-300 text-center mb-8">
            {isSignUp ? 'Join Jeemail today' : 'Sign in to your account'}
          </p>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="John Doe"
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="username@jeemail.in"
                  required
                  disabled={loading}
                />
              </div>
              {isSignUp && (
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  Must end with @jeemail.in (subdomains like mail.jeemail.in allowed)
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
              </div>
              {isSignUp && (
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  Minimum 6 characters
                </p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-200 px-4 py-3 rounded-xl text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 text-green-800 dark:text-green-200 px-4 py-3 rounded-xl text-sm flex items-start gap-3">
                <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white py-3 rounded-xl font-semibold hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Please wait...
                </span>
              ) : (
                isSignUp ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setSuccess('');
                setFullName('');
                setEmail('');
                setPassword('');
              }}
              disabled={loading}
              className="text-gray-600 dark:text-slate-300 hover:text-gray-800 dark:hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <span className="text-blue-400 font-semibold">
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
