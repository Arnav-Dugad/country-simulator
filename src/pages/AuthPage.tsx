import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CloudOff, Lock, Mail, User } from 'lucide-react';
import { describeAuthError, resetPassword } from '../firebase/auth';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { Badge, Button, Card } from '../components/ui/primitives';

type Mode = 'login' | 'register';

export function AuthPage() {
  const navigate = useNavigate();
  const { user, available, busy, error, login, register, loginWithGoogle, clearError } = useAuthStore();
  const notify = useUiStore((s) => s.notify);

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    clearError();
    setLocalError(null);
  }, [mode, clearError]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!email.trim()) return setLocalError('Enter your email address.');
    if (password.length < 6) return setLocalError('Passwords must be at least six characters.');
    if (mode === 'register' && !name.trim()) return setLocalError('Enter the name to show on the leaderboard.');

    const ok = mode === 'login' ? await login(email, password) : await register(email, password, name);
    if (ok) navigate('/', { replace: true });
  };

  const forgot = async () => {
    if (!email.trim()) return setLocalError('Enter your email address first.');
    try {
      await resetPassword(email);
      notify('success', 'Check your inbox', 'A password reset link is on its way.');
    } catch (err) {
      setLocalError(describeAuthError(err));
    }
  };

  const message = localError ?? error;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <Link to="/" className="mb-6 inline-flex w-fit items-center gap-1.5 text-xs text-slate-400 transition hover:text-white">
        <ArrowLeft size={14} /> Back
      </Link>

      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        <div className="mb-6 text-center">
          <span className="text-3xl">🏛️</span>
          <h1 className="mt-3 font-display text-2xl font-bold text-white">
            {mode === 'login' ? 'Welcome back' : 'Create an account'}
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            {mode === 'login'
              ? 'Sign in to reach your cloud saves and leaderboard entries.'
              : 'Cloud saves, cross-device play and the global leaderboard.'}
          </p>
        </div>

        {!available ? (
          <Card>
            <div className="text-center">
              <CloudOff size={26} className="mx-auto mb-3 text-slate-500" />
              <h2 className="text-sm font-semibold text-white">Accounts are not available here</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                This deployment has no Firebase configuration, so sign-in, cloud saves and the leaderboard are
                switched off. The game is fully playable offline — campaigns are saved in this browser.
              </p>
              <Link to="/new" className="mt-4 inline-block">
                <Button variant="primary">Play offline</Button>
              </Link>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="mb-5 flex rounded-xl bg-white/[0.05] p-1">
              {(['login', 'register'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setMode(option)}
                  className={`focus-ring flex-1 rounded-lg py-2 text-xs font-medium transition ${
                    mode === option ? 'bg-gold-500 text-ink-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {option === 'login' ? 'Sign in' : 'Register'}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-3">
              {mode === 'register' && (
                <InputField
                  icon={<User size={15} />}
                  type="text"
                  placeholder="Display name"
                  value={name}
                  onChange={setName}
                  autoComplete="nickname"
                  maxLength={32}
                />
              )}
              <InputField
                icon={<Mail size={15} />}
                type="email"
                placeholder="Email address"
                value={email}
                onChange={setEmail}
                autoComplete="email"
              />
              <InputField
                icon={<Lock size={15} />}
                type="password"
                placeholder="Password"
                value={password}
                onChange={setPassword}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />

              {message && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-aurora-red/30 bg-aurora-red/[0.08] px-3 py-2 text-xs text-aurora-red"
                  role="alert"
                >
                  {message}
                </motion.p>
              )}

              <Button type="submit" variant="primary" full loading={busy}>
                {mode === 'login' ? 'Sign in' : 'Create account'}
              </Button>
            </form>

            <div className="my-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] uppercase tracking-wider text-slate-600">or</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <Button variant="secondary" full loading={busy} onClick={() => loginWithGoogle().then((ok) => ok && navigate('/', { replace: true }))}>
              <GoogleMark /> Continue with Google
            </Button>

            {mode === 'login' && (
              <button onClick={forgot} className="focus-ring mt-4 w-full rounded text-center text-[11px] text-slate-500 transition hover:text-slate-300">
                Forgotten your password?
              </button>
            )}
          </Card>
        )}

        <p className="mt-5 text-center text-[11px] text-slate-600">
          <Badge tone="neutral">Optional</Badge>{' '}
          <Link to="/new" className="underline underline-offset-2 transition hover:text-slate-400">
            You can play without an account
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

function InputField({
  icon, type, placeholder, value, onChange, autoComplete, maxLength,
}: {
  icon: React.ReactNode;
  type: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  maxLength?: number;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        maxLength={maxLength}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring w-full rounded-xl border border-white/10 bg-ink-800/70 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-600"
      />
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4c-7.7 0-14.4 4.4-17.7 10.7z" />
      <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.4l-6.2-5.3C29.9 34.9 27.1 36 24 36c-5.3 0-9.7-3.1-11.3-7.9l-6.5 5C9.4 39.6 16.1 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.4l6.2 5.3C39.2 36.5 44 31 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}
