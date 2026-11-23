import React, { useCallback, useEffect, useState } from 'react';
import { Delete, KeyRound, Loader2 } from 'lucide-react';
import { BRAND_LOGO_URL } from '../../lib/pinStorage';

export interface PinPadScreenProps {
  mode: 'unlock' | 'setup';
  accountLabel?: string;
  subLabel?: string;
  onVerify?: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  onSetupComplete?: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  onForgotPin?: () => void;
  onSwitchToFullAuth?: () => void;
  onSkipSetup?: () => void;
  switchAuthLabel?: string;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export default function PinPadScreen({
  mode,
  accountLabel,
  subLabel,
  onVerify,
  onSetupComplete,
  onForgotPin,
  onSwitchToFullAuth,
  onSkipSetup,
  switchAuthLabel = 'Parol / Telegram',
}: PinPadScreenProps) {
  const [digits, setDigits] = useState('');
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);

  const triggerError = useCallback((msg: string) => {
    setError(msg);
    setShake(true);
    setDigits('');
    window.setTimeout(() => setShake(false), 450);
  }, []);

  const submitPin = useCallback(
    async (pinValue: string) => {
      if (mode === 'setup') {
        if (!firstPin) {
          setFirstPin(pinValue);
          setDigits('');
          setError('');
          return;
        }
        if (pinValue !== firstPin) {
          setFirstPin(null);
          triggerError('PIN-kodlar mos kelmadi. Qaytadan kiriting.');
          return;
        }
        if (!onSetupComplete) return;
        setBusy(true);
        const res = await onSetupComplete(pinValue);
        setBusy(false);
        if (!res.ok) {
          setFirstPin(null);
          triggerError(res.error || 'PIN-kodni saqlab bo‘lmadi');
        }
        return;
      }

      if (!onVerify) return;
      setBusy(true);
      const res = await onVerify(pinValue);
      setBusy(false);
      if (!res.ok) {
        triggerError(res.error || 'PIN-kod noto‘g‘ri');
      }
    },
    [mode, firstPin, onSetupComplete, onVerify, triggerError],
  );

  const pushDigit = useCallback(
    (d: string) => {
      if (busy) return;
      if (error) setError('');
      setDigits((prev) => {
        if (prev.length >= 4) return prev;
        const next = prev + d;
        if (next.length === 4) {
          window.setTimeout(() => {
            void submitPin(next);
          }, 90);
        }
        return next;
      });
    },
    [busy, error, submitPin],
  );

  const popDigit = useCallback(() => {
    if (busy) return;
    setError('');
    setDigits((prev) => prev.slice(0, -1));
  }, [busy]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        pushDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        popDigit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pushDigit, popDigit]);

  const titleText =
    mode === 'setup'
      ? firstPin
        ? 'PIN-kodni tasdiqlang'
        : '4 xonali PIN-kod o‘rnating'
      : 'Ilovaga kirish PIN-kodini kiriting';

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col justify-between px-4 py-6 select-none">
      {/* Subtle bottom organic wave inspired by clean mobile bank login screens */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 -bottom-24 h-72 rounded-t-[100%] bg-gradient-to-t from-emerald-500/15 via-teal-500/10 to-transparent dark:from-emerald-500/10"
      />

      {/* Top utility bar */}
      <div className="relative z-10 mx-auto w-full max-w-md flex items-center justify-between min-h-[36px]">
        {onSwitchToFullAuth ? (
          <button
            type="button"
            onClick={onSwitchToFullAuth}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 py-1.5 px-2.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition"
          >
            <KeyRound size={14} /> {switchAuthLabel}
          </button>
        ) : mode === 'setup' && firstPin ? (
          <button
            type="button"
            onClick={() => {
              setFirstPin(null);
              setDigits('');
              setError('');
            }}
            disabled={busy}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 py-1.5 px-2.5 rounded-xl"
          >
            ← Qaytadan
          </button>
        ) : (
          <span />
        )}

        {mode === 'unlock' && onForgotPin && (
          <button
            type="button"
            onClick={onForgotPin}
            disabled={busy}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white py-1.5 px-2.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition"
          >
            PIN-kodni unutdingizmi?
          </button>
        )}

        {mode === 'setup' && onSkipSetup && (
          <button
            type="button"
            onClick={onSkipSetup}
            disabled={busy}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white py-1.5 px-2.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition"
          >
            Keyinroq →
          </button>
        )}
      </div>

      {/* Main centered PIN pad card */}
      <div className="relative z-10 mx-auto w-full max-w-sm flex flex-col items-center my-auto py-4">
        {/* Brand Logo + Wordmark */}
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-20 h-20 rounded-3xl bg-white dark:bg-slate-900 shadow-lg shadow-slate-900/5 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center p-2">
            <img
              src={BRAND_LOGO_URL}
              alt="Mehrli qo‘llar logotipi"
              className="w-full h-full object-contain"
            />
          </div>
          <span className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
            Mehrli qo‘llar
          </span>
          {accountLabel && (
            <div className="inline-flex flex-col items-center">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {accountLabel}
              </span>
              {subLabel && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{subLabel}</span>
              )}
            </div>
          )}
        </div>

        {/* Instruction prompt */}
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 text-center mb-5">
          {titleText}
        </p>

        {/* 4 PIN dots */}
        <div
          className={`flex items-center justify-center gap-4 mb-3 transition-transform ${
            shake ? 'animate-[shake_0.35s_ease-in-out]' : ''
          }`}
          aria-label={`PIN kiritilgan: ${digits.length} / 4`}
        >
          {[0, 1, 2, 3].map((idx) => {
            const filled = idx < digits.length;
            return (
              <span
                key={idx}
                className={`w-4 h-4 rounded-full transition-all duration-150 ${
                  error
                    ? 'bg-rose-500 scale-105'
                    : filled
                      ? 'bg-[#1a7c78] scale-110 shadow-sm shadow-[#1a7c78]/40'
                      : 'bg-slate-300/80 dark:bg-slate-700'
                }`}
              />
            );
          })}
        </div>

        {/* Status / Error */}
        <div className="min-h-[28px] flex items-center justify-center mb-5 px-2">
          {busy ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1a7c78]">
              <Loader2 size={14} className="animate-spin" /> Tekshirilmoqda…
            </span>
          ) : error ? (
            <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 text-center" role="alert">
              {error}
            </p>
          ) : (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
              {mode === 'setup'
                ? 'Tezkor va xavfsiz kirish uchun 4 ta raqam tanlang'
                : 'Klaviatura yoki tugmalar orqali kiriting'}
            </p>
          )}
        </div>

        {/* 3x4 Numeric Keypad */}
        <div className="grid grid-cols-3 gap-x-6 gap-y-4 w-full max-w-[280px]">
          {KEYS.map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => pushDigit(digit)}
              disabled={busy}
              className="h-16 w-16 mx-auto rounded-full text-2xl font-semibold text-slate-900 dark:text-white bg-white/80 dark:bg-slate-900/80 hover:bg-slate-200/70 dark:hover:bg-slate-800 active:scale-95 transition-all shadow-sm border border-slate-200/60 dark:border-slate-800 flex items-center justify-center disabled:opacity-50"
            >
              {digit}
            </button>
          ))}

          {/* Bottom-left: Switch auth or blank spacer */}
          <div className="flex items-center justify-center">
            {onSwitchToFullAuth ? (
              <button
                type="button"
                onClick={onSwitchToFullAuth}
                disabled={busy}
                title={switchAuthLabel}
                aria-label={switchAuthLabel}
                className="h-16 w-16 rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center"
              >
                <KeyRound size={20} />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => pushDigit('0')}
            disabled={busy}
            className="h-16 w-16 mx-auto rounded-full text-2xl font-semibold text-slate-900 dark:text-white bg-white/80 dark:bg-slate-900/80 hover:bg-slate-200/70 dark:hover:bg-slate-800 active:scale-95 transition-all shadow-sm border border-slate-200/60 dark:border-slate-800 flex items-center justify-center disabled:opacity-50"
          >
            0
          </button>

          <button
            type="button"
            onClick={popDigit}
            disabled={busy || digits.length === 0}
            aria-label="O‘chirish"
            className="h-16 w-16 mx-auto rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center disabled:opacity-30"
          >
            <Delete size={22} />
          </button>
        </div>
      </div>

      <div className="relative z-10 text-center text-[11px] text-slate-400 dark:text-slate-600">
        Himoyalangan bank darajasidagi 4 xonali tezkor kirish
      </div>
    </div>
  );
}
