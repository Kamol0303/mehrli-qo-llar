import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, ShieldCheck, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { getCurrentPosition, isGeolocationAvailable } from '../../lib/geolocation';
import { ProfileCard } from './ProfileCard';

/**
 * Opt-in location sharing for workers. Consent-first: nothing is sent until the
 * worker explicitly enables it, and it can be turned off any time. Employers only
 * ever see an approximate distance — never the exact coordinates saved here.
 */
export function LocationSharingCard({
  userId,
  enabled,
  updatedAt,
  role = 'worker',
}: {
  userId: string;
  enabled?: boolean;
  updatedAt?: string | Date;
  role?: 'worker' | 'employer';
}) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'en' ? 'en-US' : 'uz-UZ';
  const isEmployer = role === 'employer';
  const copy = isEmployer
    ? {
        description: t('profile.location_sharing_desc_employer'),
        privacy: t('profile.location_privacy_employer'),
        enabledMsg: t('profile.location_enabled_msg'),
      }
    : {
        description: t('profile.location_sharing_desc_worker'),
        privacy: t('profile.location_privacy_worker'),
        enabledMsg: t('profile.location_enabled_msg'),
      };
  const [sharing, setSharing] = useState(Boolean(enabled));
  const [lastUpdated, setLastUpdated] = useState<string | Date | undefined>(updatedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const enable = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      if (!isGeolocationAvailable()) {
        throw new Error(t('profile.geo_not_supported'));
      }
      const pos = await getCurrentPosition();
      const res = await api.users.updateLocation(userId, {
        latitude: pos.latitude,
        longitude: pos.longitude,
        enabled: true,
      });
      setSharing(res.locationSharingEnabled);
      setLastUpdated(res.locationUpdatedAt ?? new Date().toISOString());
      setSuccess(copy.enabledMsg);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('profile.loc_enable_err'));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const pos = await getCurrentPosition();
      const res = await api.users.updateLocation(userId, {
        latitude: pos.latitude,
        longitude: pos.longitude,
        enabled: true,
      });
      setSharing(res.locationSharingEnabled);
      setLastUpdated(res.locationUpdatedAt ?? new Date().toISOString());
      setSuccess(t('profile.location_updated_msg'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('profile.loc_update_err'));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api.users.clearLocation(userId);
      setSharing(false);
      setLastUpdated(undefined);
      setSuccess(t('profile.location_disabled_msg'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('profile.loc_disable_err'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProfileCard
      title={t('profile.location_sharing_title')}
      description={copy.description}
    >
      <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{copy.privacy}</p>
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm">
        <MapPin className={`h-4 w-4 ${sharing ? 'text-emerald-600' : 'text-slate-400'}`} />
        <span className="font-semibold">
          {sharing ? t('profile.location_is_enabled') : t('profile.location_is_disabled')}
        </span>
      </div>
      {sharing && lastUpdated && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t('profile.last_updated_at')}: {new Date(lastUpdated).toLocaleString(dateLocale)}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {!sharing ? (
          <button
            type="button"
            onClick={() => void enable()}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            {t('profile.enable_location')}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium text-foreground disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              {t('profile.update_location')}
            </button>
            <button
              type="button"
              onClick={() => void disable()}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 disabled:opacity-60"
            >
              {t('profile.disable_location')}
            </button>
          </>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      {success && <p className="mt-3 text-sm text-emerald-600">{success}</p>}
    </ProfileCard>
  );
}
