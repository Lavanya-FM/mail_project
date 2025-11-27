import { useState, useEffect } from 'react';
import { Mail, Lock, User, Calendar, Users, Eye, EyeOff, Sparkles } from 'lucide-react';
import { authService } from '../lib/authService';
import ThemeToggle from './ThemeToggle';
import { animations } from '../utils/animations';

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [email, setEmail] = useState('');
  const [emailUsername, setEmailUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState({ month: '', day: '', year: '' });
  const [gender, setGender] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [passwordMatch, setPasswordMatch] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);
  // Update email when username changes
  useEffect(() => {
    if (isSignUp && emailUsername) {
      setEmail(`${emailUsername}@jeemail.in`);
    }
  }, [emailUsername, isSignUp]);

  // Check password strength
  const checkPasswordStrength = (password: string) => {
    let strength = 0;
    if (password.length >= 8) strength += 1;
    if (password.length >= 12) strength += 1;
    if (/[a-z]/.test(password)) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^a-zA-Z0-9]/.test(password)) strength += 1;
    return strength;
  };

  // Update password strength when password changes
  useEffect(() => {
    setPasswordStrength(checkPasswordStrength(password));
    if (confirmPassword) {
      setPasswordMatch(password === confirmPassword);
    }
  }, [password, confirmPassword]);

  // Check if username already exists
  const checkUsernameAvailability = async (username: string) => {
    if (!username || username.length < 3) {
      setUsernameError('');
      return;
    }

    setCheckingUsername(true);
    try {
      // For now, simulate username check (replace with actual API call)
      const existingUsernames = ['admin', 'user', 'test', 'demo', 'john', 'jane'];
      
      setTimeout(() => {
        if (existingUsernames.includes(username.toLowerCase())) {
          setUsernameError('Username already taken');
        } else {
          setUsernameError('');
        }
        setCheckingUsername(false);
      }, 500);
    } catch (err) {
      setUsernameError('');
      setCheckingUsername(false);
    }
  };

  // Handle step navigation
  const handleNext = () => {
    setError('');
    if (currentStep === 1) {
      if (!fullName.trim()) {
        setError('Please enter your full name');
        return;
      }
      if (!emailUsername.trim()) {
        setError('Please enter an email username');
        return;
      }
      if (usernameError) {
        setError('Please choose a different username');
        return;
      }
    } else if (currentStep === 2) {
      if (!dateOfBirth.month || !dateOfBirth.day || !dateOfBirth.year) {
        setError('Please enter your complete date of birth');
        return;
      }
      if (!gender) {
        setError('Please select your gender');
        return;
      }
    }
    setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    setError('');
    setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        if (!passwordMatch) {
          setError('Passwords do not match');
          return;
        }
        if (passwordStrength < 3) {
          setError('Password is too weak. Please include uppercase, lowercase, numbers, and special characters.');
          return;
        }
        const result = await authService.register(email, password, fullName, dateOfBirth, gender);
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
            {isSignUp ? `Create Account - Step ${currentStep}/3` : 'Welcome Back'}
          </h1>
          <p className={`text-gray-600 dark:text-slate-300 text-center mb-8 ${animations.fadeIn}`}>
            {isSignUp ? 
              (currentStep === 1 ? 'Let\'s start with your basic info' :
               currentStep === 2 ? 'Tell us more about yourself' :
               'Set up your secure password') :
              'Sign in to continue to access'
            }
          </p>

          {isSignUp && (
            <div className="mb-8">
              <div className="flex items-center justify-center space-x-2">
                {[1, 2, 3].map((step) => (
                  <div key={step} className="flex items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 ${
                        step <= currentStep
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {step}
                    </div>
                    {step < 3 && (
                      <div
                        className={`w-8 h-0.5 mx-2 transition-all duration-300 ${
                          step < currentStep ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp ? (
              <>
                {currentStep === 1 && (
                  <>
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

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                        Email Username
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-400" />
                        <div className="flex">
                          <input
                            type="text"
                            value={emailUsername}
                            onChange={(e) => {
                              const username = e.target.value.replace(/[^a-zA-Z0-9._-]/g, '');
                              setEmailUsername(username);
                              checkUsernameAvailability(username);
                            }}
                            className={`w-full pl-11 pr-4 py-3 bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-l-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition hover:border-blue-400 dark:hover:border-blue-400/50 ${animations.fadeInLeft} delay-100`}
                            placeholder="username"
                            required
                          />
                          <div className="flex items-center px-4 py-3 bg-gray-200 dark:bg-white/20 border border-l-0 border-gray-300 dark:border-white/20 rounded-r-xl text-gray-600 dark:text-slate-300">
                            @jeemail.in
                          </div>
                        </div>
                      </div>
                      {checkingUsername && (
                        <p className="mt-1 text-sm text-blue-500 dark:text-blue-400">Checking username availability...</p>
                      )}
                      {usernameError && (
                        <p className="mt-1 text-sm text-red-500 dark:text-red-400">{usernameError}</p>
                      )}
                    </div>
                  </>
                )}

                {currentStep === 2 && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                        Date of Birth
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-400" />
                          <select
                            value={dateOfBirth.month}
                            onChange={(e) => setDateOfBirth({ ...dateOfBirth, month: e.target.value })}
                            className={`w-full pl-10 pr-2 py-3 bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition hover:border-blue-400 dark:hover:border-blue-400/50 ${animations.fadeInLeft} delay-100`}
                            required
                          >
                            <option value="">Month</option>
                            {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, index) => (
                              <option key={month} value={String(index + 1).padStart(2, '0')}>{month}</option>
                            ))}
                          </select>
                        </div>
                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={dateOfBirth.day}
                            onChange={(e) => setDateOfBirth({ ...dateOfBirth, day: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                            className={`w-full px-4 py-3 bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition hover:border-blue-400 dark:hover:border-blue-400/50 ${animations.fadeInLeft} delay-100`}
                            placeholder="Day"
                            maxLength={2}
                            required
                          />
                        </div>
                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={dateOfBirth.year}
                            onChange={(e) => setDateOfBirth({ ...dateOfBirth, year: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                            className={`w-full px-4 py-3 bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition hover:border-blue-400 dark:hover:border-blue-400/50 ${animations.fadeInLeft} delay-100`}
                            placeholder="Year"
                            maxLength={4}
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                        Gender
                      </label>
                      <div className="relative">
                        <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-400" />
                        <select
                          value={gender}
                          onChange={(e) => setGender(e.target.value)}
                          className={`w-full pl-11 pr-4 py-3 bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition hover:border-blue-400 dark:hover:border-blue-400/50 ${animations.fadeInLeft} delay-150 appearance-none`}
                          required
                        >
                          <option value="">Select Gender</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other</option>
                          <option value="prefer_not_to_say">Prefer not to say</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {currentStep === 3 && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                        Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-400" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className={`w-full pl-11 pr-12 py-3 bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition hover:border-blue-400 dark:hover:border-blue-400/50 ${animations.fadeInLeft} delay-200`}
                          placeholder="••••••••"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-300 transition"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      <div className="mt-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-600 dark:text-slate-400">Password Strength</span>
                          <span className="text-xs font-medium text-gray-600 dark:text-slate-400">
                            {passwordStrength === 0 ? 'Very Weak' :
                             passwordStrength === 1 ? 'Weak' :
                             passwordStrength === 2 ? 'Fair' :
                             passwordStrength === 3 ? 'Good' :
                             passwordStrength === 4 ? 'Strong' :
                             passwordStrength === 5 ? 'Very Strong' : 'Excellent'}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-300 ${
                              passwordStrength <= 2 ? 'bg-red-500' :
                              passwordStrength <= 4 ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`}
                            style={{ width: `${(passwordStrength / 6) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-400" />
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            setPasswordMatch(password === e.target.value);
                          }}
                          className={`w-full pl-11 pr-12 py-3 bg-gray-100 dark:bg-white/10 border ${
                            confirmPassword && !passwordMatch
                              ? 'border-red-300 dark:border-red-500'
                              : 'border-gray-300 dark:border-white/20'
                          } rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition hover:border-blue-400 dark:hover:border-blue-400/50 ${animations.fadeInLeft} delay-250`}
                          placeholder="••••••••"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-300 transition"
                        >
                          {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      {confirmPassword && !passwordMatch && (
                        <p className="mt-1 text-sm text-red-500 dark:text-red-400">Passwords do not match</p>
                      )}
                    </div>
                  </>
                )}

                <div className="flex gap-3 pt-4">
                  {currentStep > 1 && (
                    <button
                      type="button"
                      onClick={handleBack}
                      className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-3 rounded-xl font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 focus:ring-offset-slate-900 transition shadow-lg hover:shadow-xl hover:scale-105"
                    >
                      Back
                    </button>
                  )}
                  <button
                    type={currentStep === 3 ? 'submit' : 'button'}
                    onClick={currentStep === 3 ? undefined : handleNext}
                    disabled={loading}
                    className={`flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 text-white py-3 rounded-xl font-semibold hover:from-blue-600 hover:to-cyan-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-900 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:scale-105 ${animations.fadeInUp} delay-300`}
                  >
                    {loading ? 'Please wait...' : currentStep === 3 ? 'Create Account' : 'Next'}
                  </button>
                </div>
              </>
            ) : (
              // Sign in form (unchanged)
              <>
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
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`w-full pl-11 pr-12 py-3 bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition hover:border-blue-400 dark:hover:border-blue-400/50 ${animations.fadeInLeft} delay-200`}
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-300 transition"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
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
                  {loading ? 'Please wait...' : 'Sign In'}
                </button>
              </>
            )}
          </form>

          <div className={`mt-6 text-center ${animations.fadeIn}`}>
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setCurrentStep(1);
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
