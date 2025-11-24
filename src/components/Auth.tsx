import { useState } from 'react';
import { Mail, Lock, User, Sparkles } from 'lucide-react';
import { authService } from '../lib/authService';
import ThemeToggle from './ThemeToggle';
import { animations } from '../utils/animations';

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        const result = await authService.register(email, password, fullName);
        if (!result.success) {
          setError(result.error || 'Registration failed');
          return;
        }
        // Registration successful, user is now logged in
        window.location.reload(); // Refresh to show the main app
      } else {
        const result = await authService.login(email, password);
        if (!result.success) {
          setError(result.error || 'Login failed');
          return;
        }
        // Login successful, user is now logged in
        window.location.reload(); // Refresh to show the main app
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iIzFmMjkzNyIgc3Ryb2tlLXdpZHRoPSIyIiBvcGFjaXR5PSIuMSIvPjwvZz48L3N2Zz4=')] opacity-20"></div>
      
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md relative">
        <div className={`bg-white/90 dark:bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-200/50 dark:border-white/20 p-8 ${animations.fadeInUp}`}>
          <div className={`flex items-center justify-center mb-8 ${animations.bounceIn}`}>
            <div className="bg-gradient-to-br from-blue-400 to-cyan-400 p-4 rounded-2xl shadow-lg hover:shadow-xl hover:shadow-blue-400/50 transition-all duration-300">
              <Sparkles className="w-8 h-8 text-white animate-spin-slow" />
            </div>
          </div>

          <h1 className={`text-3xl font-bold text-gray-900 dark:text-white text-center mb-2 ${animations.fadeInDown}`}>
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p className={`text-gray-600 dark:text-slate-300 text-center mb-8 ${animations.fadeIn}`}>
            {isSignUp ? 'Start your journey with us' : 'Sign in to continue to access'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-400" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={`w-full pl-11 pr-4 py-3 bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition hover:border-blue-400 dark:hover:border-blue-400/50 ${animations.fadeInLeft}`}
                    placeholder="John Doe"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full pl-11 pr-4 py-3 bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition hover:border-blue-400 dark:hover:border-blue-400/50 ${animations.fadeInLeft} delay-100`}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-11 pr-4 py-3 bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition hover:border-blue-400 dark:hover:border-blue-400/50 ${animations.fadeInLeft} delay-200`}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <div className={`bg-red-100 dark:bg-red-500/20 border border-red-300 dark:border-red-500/50 text-red-800 dark:text-red-200 px-4 py-3 rounded-xl text-sm ${animations.slideInUp}`}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white py-3 rounded-xl font-semibold hover:from-blue-600 hover:to-cyan-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-900 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:scale-105 ${animations.fadeInUp} delay-300`}
            >
              {loading ? 'Please wait...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </button>
          </form>

          <div className={`mt-6 text-center ${animations.fadeIn}`}>
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
              className="text-gray-600 dark:text-slate-300 hover:text-gray-800 dark:hover:text-white transition hover:scale-105 transform duration-300"
            >
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <span className="text-blue-400 font-semibold hover:text-blue-500 transition">
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
