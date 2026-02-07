import { useState } from 'react';
import { X, User, ChevronDown } from 'lucide-react';
import { authService } from '../lib/authService';

interface AddAccountModalProps {
  onClose: () => void;
  onSuccess: (account: any) => void;
}

export default function AddAccountModal({ onClose, onSuccess }: AddAccountModalProps) {
  const [step, setStep] = useState<'email' | 'password' | 'verify' | 'create_account'>('email');
  const [regStep, setRegStep] = useState(1);

  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');

  // Register State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dob, setDob] = useState({ month: '', day: '', year: '' });
  const [gender, setGender] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // --- Handlers for Login Flow ---

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const resp = await fetch(`/api/users/email/${encodeURIComponent(email)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!resp.ok) {
        if (resp.status === 404) {
          setError("Couldn't find your Jeemail Account");
        } else {
          setError('Failed to verify email. Please try again.');
        }
        return;
      }

      const data = await resp.json();

      if (data.exists) {
        setStep('password');
        setError('');
      } else {
        setError("Couldn't find your Jeemail Account");
      }
    } catch (err) {
      console.error(err);
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await authService.login(email, password);

      if (!result.success) {
        setError(result.error || 'Wrong password. Try again.');
        return;
      }

      const user = result.user;
      if (!user) {
        setError('Unexpected server response.');
        return;
      }

      // authService.login returns user structured correctly, but we might need token if available from somewhere else?
      // authService saves token to localStorage implicitly.
      // onSuccess expects an account object.
      // We'll construct it from the returned user.
      const account = {
        id: user.id || 0,
        email: user.email,
        name: user.full_name || user.name || user.email?.split('@')[0],
        avatar: user.avatar || null,
        token: authService.getToken()
      };

      onSuccess(account);
      onClose?.();
    } catch (err) {
      console.error("Password check error:", err);
      setError('Failed to verify password.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const resp = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: verificationCode })
      });

      if (resp.ok) {
        const data = await resp.json();
        onSuccess({
          id: data.user?.id,
          email,
          name: data.user?.full_name || email.split('@')[0],
          avatar: data.user?.avatar || null,
          token: data.token
        });
        onClose?.();
      } else {
        setError('Wrong code. Try again.');
      }
    } catch (err) {
      setError('Failed to verify code.');
    } finally {
      setLoading(false);
    }
  };

  // --- Handlers for Register Flow ---

  const handleRegNext = () => {
    setError('');

    if (regStep === 1) {
      if (!firstName.trim() || !lastName.trim()) {
        setError('Please enter your name');
        return;
      }
      setRegStep(2);
    } else if (regStep === 2) {
      if (!dob.month || !dob.day || !dob.year || !gender) {
        setError('Please enter your birthday and gender');
        return;
      }
      setRegStep(3);
    }
  };

  const handleRegBack = () => {
    setError('');
    if (regStep > 1) {
      setRegStep(regStep - 1);
    } else {
      setStep('email'); // Back to login
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (regPassword !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (regPassword.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    try {
      const fullName = `${firstName} ${lastName}`.trim();
      // authService.register handles appending @jeemail.in if missing
      const result = await authService.register(fullName, regUsername, regPassword, dob, gender);

      if (!result.success) {
        setError(result.error || 'Registration failed');
        return;
      }

      const user = result.user;
      if (!user) {
        setError('Registration succeeded but no user returned.');
        return;
      }

      const account = {
        id: user.id || 0,
        email: user.email,
        name: user.full_name || user.name || user.email?.split('@')[0],
        avatar: user.avatar || null,
        token: authService.getToken()
      };

      onSuccess(account);
      onClose?.();

    } catch (err) {
      console.error(err);
      setError('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/30 backdrop-blur-sm px-4">
      <div className={`bg-white dark:bg-slate-900 w-full rounded-[28px] shadow-xl border border-gray-100 dark:border-slate-800 p-8 flex flex-col justify-between relative transition-all duration-300 ${step === 'create_account' ? 'max-w-[750px] min-h-[500px] flex-row gap-8' : 'max-w-[448px] min-h-[500px]'}`}>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Left Side (for large layout) or Main Content */}
        <div className={`flex-1 flex flex-col ${step === 'create_account' ? 'max-w-[50%]' : 'w-full'}`}>

          {/* Logo & Header */}
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-10 h-10 mb-4">
              <div className="w-10 h-10 bg-blue-600 rounded flex items-center justify-center font-bold text-white text-xl">J</div>
            </div>

            {step === 'email' && (
              <>
                <h1 className="text-2xl font-normal text-gray-900 dark:text-white mb-2">Sign in</h1>
                <p className="text-base text-gray-900 dark:text-gray-300">to continue to Jeemail</p>
              </>
            )}

            {step === 'password' && (
              <>
                <h1 className="text-2xl font-normal text-gray-900 dark:text-white mb-2">Welcome</h1>
                <div className="inline-flex items-center border border-gray-200 dark:border-gray-700 rounded-full py-1 px-3 mt-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => setStep('email')}>
                  <User className="w-3 h-3 mr-2 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200 mr-2">{email}</span>
                  <ChevronDown className="w-3 h-3 text-gray-500" />
                </div>
              </>
            )}

            {step === 'verify' && (
              <>
                <h1 className="text-2xl font-normal text-gray-900 dark:text-white mb-2">2-Step Verification</h1>
                <p className="text-base text-gray-600 dark:text-gray-300">
                  For your security, Jeemail wants to make sure it's really you.
                </p>
              </>
            )}

            {step === 'create_account' && (
              <>
                <h1 className="text-2xl font-normal text-gray-900 dark:text-white mb-2">Create a Jeemail Account</h1>
                <p className="text-base text-gray-900 dark:text-gray-300">
                  {regStep === 1 ? "Enter your name" :
                    regStep === 2 ? "Basic information" : "Choose how you'll sign in"}
                </p>
              </>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 text-red-600 text-sm flex items-start">
              <svg aria-hidden="true" className="stUf5b qpSchb w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" focusable="false" width="24px" height="24px" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path>
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Login: Email Step */}
          {step === 'email' && (
            <form onSubmit={handleEmailSubmit} className="flex-1 flex flex-col justify-between">
              <div>
                <div className="relative mb-2 group">
                  <input
                    type="email"
                    id="email-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block px-3 pb-2.5 pt-4 w-full text-base text-gray-900 bg-transparent rounded-lg border border-gray-300 appearance-none dark:text-white dark:border-gray-600 dark:focus:border-blue-500 focus:outline-none focus:ring-0 focus:border-blue-600 peer"
                    placeholder=" "
                    required
                  />
                  <label
                    htmlFor="email-input"
                    className="absolute text-base text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white dark:bg-slate-900 px-2 peer-focus:px-2 peer-focus:text-blue-600 peer-focus:dark:text-blue-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 left-1"
                  >
                    Email or phone
                  </label>
                </div>
                <div className="mb-8">
                  <a href="#" className="text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-1 py-0.5 rounded cursor-pointer">
                    Forgot email?
                  </a>
                </div>

                <div className="text-sm text-gray-600 dark:text-gray-400 mb-8">
                  Not your computer? Use Guest mode to sign in privately. <br />
                  <a href="#" className="text-blue-600 font-medium hover:underline">Learn more</a>
                </div>
              </div>

              <div className="flex items-center justify-between mt-auto">
                <button
                  type="button"
                  onClick={() => { setStep('create_account'); setRegStep(1); }}
                  className="text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2 py-1.5 rounded cursor-pointer"
                >
                  Create account
                </button>
                <button
                  type="submit"
                  disabled={loading || !email}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? 'Checking...' : 'Next'}
                </button>
              </div>
            </form>
          )}

          {/* Login: Password Step */}
          {step === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="flex-1 flex flex-col justify-between">
              <div>
                <div className="relative mb-2 mt-4">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block px-3 pb-2.5 pt-4 w-full text-base text-gray-900 bg-transparent rounded-lg border border-gray-300 appearance-none dark:text-white dark:border-gray-600 dark:focus:border-blue-500 focus:outline-none focus:ring-0 focus:border-blue-600 peer"
                    placeholder=" "
                    autoFocus
                    required
                  />
                  <label
                    htmlFor="password-input"
                    className="absolute text-base text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white dark:bg-slate-900 px-2 peer-focus:px-2 peer-focus:text-blue-600 peer-focus:dark:text-blue-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 left-1"
                  >
                    Enter your password
                  </label>
                </div>

                <div className="flex items-center mb-8">
                  <input
                    type="checkbox"
                    id="show-password"
                    checked={showPassword}
                    onChange={() => setShowPassword(!showPassword)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="show-password" className="ml-2 text-sm text-gray-900 dark:text-gray-300 cursor-pointer select-none">Show password</label>
                </div>

                <div className="mb-4">
                  <a href="#" className="text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-1 py-0.5 rounded cursor-pointer">
                    Forgot password?
                  </a>
                </div>
              </div>

              <div className="flex items-center justify-between mt-auto">
                <div></div>
                <div className="flex gap-4">
                  <button
                    type="submit"
                    disabled={loading || !password}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Checking...' : 'Next'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Login: Verify Step */}
          {step === 'verify' && (
            <form onSubmit={handleVerificationSubmit} className="flex-1 flex flex-col justify-between">
              <div>
                <div className="relative mb-2 mt-4">
                  <input
                    type="text"
                    id="code-input"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    className="block px-3 pb-2.5 pt-4 w-full text-base text-gray-900 bg-transparent rounded-lg border border-gray-300 appearance-none dark:text-white dark:border-gray-600 dark:focus:border-blue-500 focus:outline-none focus:ring-0 focus:border-blue-600 peer tracking-widest text-center"
                    placeholder=" "
                    maxLength={6}
                    required
                  />
                  <label
                    htmlFor="code-input"
                    className="absolute text-base text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white dark:bg-slate-900 px-2 peer-focus:px-2 peer-focus:text-blue-600 peer-focus:dark:text-blue-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 left-1 w-full text-center"
                  >
                    Enter 6-digit code
                  </label>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-4 text-center">
                  A verification code has been sent to {email}
                </p>
                <div className="mt-4 text-center">
                  <a href="#" className="text-sm font-medium text-blue-600 hover:text-blue-700">Resend code</a>
                </div>
              </div>

              <div className="flex items-center justify-end mt-auto">
                <button
                  type="submit"
                  disabled={loading || verificationCode.length !== 6}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? 'Verifying...' : 'Next'}
                </button>
              </div>
            </form>
          )}

          {/* Registration Steps */}
          {step === 'create_account' && (
            <div className="flex-1 flex flex-col justify-between h-full">
              {/* Step 1: Name */}
              {regStep === 1 && (
                <div className="space-y-4">
                  <div className="relative mb-2 group">
                    <input
                      type="text"
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="block px-3 pb-2.5 pt-4 w-full text-base text-gray-900 bg-transparent rounded-lg border border-gray-300 appearance-none dark:text-white dark:border-gray-600 dark:focus:border-blue-500 focus:outline-none focus:ring-0 focus:border-blue-600 peer"
                      placeholder=" "
                      required
                    />
                    <label htmlFor="firstName" className="absolute text-base text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white dark:bg-slate-900 px-2 peer-focus:px-2 peer-focus:text-blue-600 peer-focus:dark:text-blue-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 left-1">
                      First name
                    </label>
                  </div>
                  <div className="relative mb-2 group">
                    <input
                      type="text"
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="block px-3 pb-2.5 pt-4 w-full text-base text-gray-900 bg-transparent rounded-lg border border-gray-300 appearance-none dark:text-white dark:border-gray-600 dark:focus:border-blue-500 focus:outline-none focus:ring-0 focus:border-blue-600 peer"
                      placeholder=" "
                      required
                    />
                    <label htmlFor="lastName" className="absolute text-base text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white dark:bg-slate-900 px-2 peer-focus:px-2 peer-focus:text-blue-600 peer-focus:dark:text-blue-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 left-1">
                      Last name (optional)
                    </label>
                  </div>
                </div>
              )}

              {/* Step 2: Basic Info */}
              {regStep === 2 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Enter your birthday and gender</h3>
                  <div className="flex gap-2">
                    <select
                      className="flex-1 px-3 py-3 bg-transparent border border-gray-300 rounded-lg dark:text-white dark:border-gray-600"
                      value={dob.month}
                      onChange={(e) => setDob({ ...dob, month: e.target.value })}
                    >
                      <option value="">Month</option>
                      {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map(m => (
                        <option key={m} value={m}>{new Date(2000, parseInt(m) - 1, 1).toLocaleString('default', { month: 'long' })}</option>
                      ))}
                    </select>
                    <input
                      type="text" placeholder="Day"
                      className="w-20 px-3 py-3 bg-transparent border border-gray-300 rounded-lg dark:text-white dark:border-gray-600 text-center"
                      value={dob.day}
                      onChange={(e) => setDob({ ...dob, day: e.target.value })}
                      maxLength={2}
                    />
                    <input
                      type="text" placeholder="Year"
                      className="w-24 px-3 py-3 bg-transparent border border-gray-300 rounded-lg dark:text-white dark:border-gray-600 text-center"
                      value={dob.year}
                      onChange={(e) => setDob({ ...dob, year: e.target.value })}
                      maxLength={4}
                    />
                  </div>

                  <div className="relative">
                    <select
                      className="w-full px-3 py-3 bg-transparent border border-gray-300 rounded-lg dark:text-white dark:border-gray-600"
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                    >
                      <option value="">Gender</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Rather not say</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Step 3: Username & Password */}
              {regStep === 3 && (
                <form onSubmit={handleRegisterSubmit} className="space-y-4">
                  <div className="relative mb-4 group">
                    <input
                      type="text"
                      id="regUsername"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      className="block px-3 pb-2.5 pt-4 w-full text-base text-gray-900 bg-transparent rounded-lg border border-gray-300 appearance-none dark:text-white dark:border-gray-600 dark:focus:border-blue-500 focus:outline-none focus:ring-0 focus:border-blue-600 peer"
                      placeholder=" "
                      required
                    />
                    <label htmlFor="regUsername" className="absolute text-base text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white dark:bg-slate-900 px-2 peer-focus:px-2 peer-focus:text-blue-600 peer-focus:dark:text-blue-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 left-1">
                      Username
                    </label>
                    <div className="absolute right-3 top-4 text-gray-500 text-sm pointer-events-none">@jeemail.in</div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative mb-2 mt-2">
                      <input
                        type={showRegPassword ? "text" : "password"}
                        id="regPassword"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="block px-3 pb-2.5 pt-4 w-full text-base text-gray-900 bg-transparent rounded-lg border border-gray-300 appearance-none dark:text-white dark:border-gray-600 dark:focus:border-blue-500 focus:outline-none focus:ring-0 focus:border-blue-600 peer"
                        placeholder=" "
                        required
                      />
                      <label htmlFor="regPassword" className="absolute text-base text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white dark:bg-slate-900 px-2 peer-focus:px-2 peer-focus:text-blue-600 peer-focus:dark:text-blue-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 left-1">
                        Password
                      </label>
                    </div>
                    <div className="relative mb-2 mt-2">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        id="confirmPassword"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="block px-3 pb-2.5 pt-4 w-full text-base text-gray-900 bg-transparent rounded-lg border border-gray-300 appearance-none dark:text-white dark:border-gray-600 dark:focus:border-blue-500 focus:outline-none focus:ring-0 focus:border-blue-600 peer"
                        placeholder=" "
                        required
                      />
                      <label htmlFor="confirmPassword" className="absolute text-base text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white dark:bg-slate-900 px-2 peer-focus:px-2 peer-focus:text-blue-600 peer-focus:dark:text-blue-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 left-1">
                        Confirm
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center mb-8">
                    <input
                      type="checkbox"
                      id="show-reg-password"
                      checked={showRegPassword}
                      onChange={() => {
                        setShowRegPassword(!showRegPassword);
                        setShowConfirmPassword(!showRegPassword);
                      }}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="show-reg-password" className="ml-2 text-sm text-gray-900 dark:text-gray-300 cursor-pointer select-none">Show password</label>
                  </div>
                </form>
              )}

              <div className="flex items-center justify-between mt-auto pt-6">
                {regStep === 1 ? (
                  <button
                    type="button"
                    onClick={() => setStep('email')}
                    className="text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2 py-1.5 rounded cursor-pointer"
                  >
                    Sign in instead
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRegBack}
                    className="text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2 py-1.5 rounded cursor-pointer"
                  >
                    Back
                  </button>
                )}

                <button
                  type="button"
                  onClick={regStep === 3 ? handleRegisterSubmit : handleRegNext}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded-full transition-colors"
                >
                  {regStep === 3 ? (loading ? 'Creating...' : 'Next') : 'Next'}
                </button>
              </div>
            </div>
          )}

          {/* Right Side Info (only visible on large screen create account) */}
          {step === 'create_account' && (
            <div className="hidden md:flex flex-col items-center justify-center max-w-[50%] p-4 text-center">
              <div className="w-48 h-48 bg-blue-50 rounded-full flex items-center justify-center mb-6">
                <div className="w-24 h-24 bg-blue-100 rounded text-blue-500 flex items-center justify-center">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                </div>
              </div>
              <p className="text-gray-600 dark:text-gray-300">
                One account. All of Jeemail working for you.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
