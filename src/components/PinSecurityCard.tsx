import React, { useState } from 'react';
import { Lock, KeyRound, Trash2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../lib/authService';
import { clearSavedPinAccount, savePinAccount } from '../lib/pinStorage';
import PinPadScreen from './auth/PinPadScreen';

export default function PinSecurityCard() {
  const { profile, setAuthProfile, lockWithPin } = useAuth();
  const [settingUp, setSettingUp] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  if (!profile) return null;

  const hasPin = Boolean(profile.hasPin);

  if (settingUp) {
    return (
      <div className="fixed inset-0 z-[200] bg-background">
        <PinPadScreen
          mode="setup"
          accountLabel={profile.fullName}
          subLabel={profile.phoneNumber || profile.email}
          onSkipSetup={() => setSettingUp(false)}
          onSetupComplete={async (pin) => {
            const res = await authService.setupPin(pin);
            if (!res.success || !res.profile) {
              return { ok: false, error: res.error || 'PIN-kod saqlanmadi' };
            }
            setAuthProfile(res.profile);
            savePinAccount(res.profile);
            setSettingUp(false);
            setStatusMsg('4 xonali PIN-kod muvaffaqiyatli o‘rnatildi!');
            return { ok: true };
          }}
        />
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h3 className="text-sm font-black text-foreground">Tezkor 4 xonali PIN-kod</h3>
            <p className="text-xs text-muted-foreground">
              {hasPin
                ? 'Faol — ilovaga bank ilovalaridek 4 ta raqam bilan tez kirish mumkin.'
                : 'Telegram yoki parol o‘rniga tezkor 4 raqamli kirish kodini o‘rnating.'}
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold ${
            hasPin
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          {hasPin ? 'Yoqilgan' : 'O‘rnatilmagan'}
        </span>
      </div>

      {statusMsg && (
        <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{statusMsg}</p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            setStatusMsg('');
            setSettingUp(true);
          }}
          className="inline-flex items-center gap-2 min-h-[42px] px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition"
        >
          <KeyRound size={15} />
          {hasPin ? 'PIN-kodni o‘zgartirish' : '4 xonali PIN-kod o‘rnatish'}
        </button>

        {hasPin && (
          <>
            <button
              type="button"
              onClick={() => lockWithPin()}
              className="inline-flex items-center gap-2 min-h-[42px] px-4 rounded-xl bg-secondary text-foreground text-xs font-bold hover:bg-muted transition border border-border"
            >
              <Lock size={15} />
              Ilovani qulflash
            </button>

            <button
              type="button"
              disabled={removing}
              onClick={async () => {
                setRemoving(true);
                const res = await authService.removePin();
                setRemoving(false);
                if (res.success && res.profile) {
                  setAuthProfile(res.profile);
                  clearSavedPinAccount();
                  setStatusMsg('PIN-kod o‘chirildi.');
                }
              }}
              className="inline-flex items-center gap-1.5 min-h-[42px] px-4 rounded-xl border border-rose-500/30 text-rose-600 text-xs font-bold hover:bg-rose-500/10 transition disabled:opacity-50"
            >
              <Trash2 size={14} />
              O‘chirish
            </button>
          </>
        )}
      </div>
    </div>
  );
}
