import { useTranslation } from 'react-i18next';
import { BadgeCheck, Clock, AlertTriangle, RefreshCw, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Profile } from '../../types';

const STATUS_UI: Record<
  string,
  { labelKey: string; className: string; icon: typeof BadgeCheck; descKey: string }
> = {
  verified: {
    labelKey: 'verification.status_verified_label',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: BadgeCheck,
    descKey: 'verification.status_verified_desc',
  },
  pending: {
    labelKey: 'verification.status_pending_label',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: Clock,
    descKey: 'verification.status_pending_desc',
  },
  under_review: {
    labelKey: 'verification.status_under_review_label',
    className: 'border-blue-200 bg-blue-50 text-blue-800',
    icon: Shield,
    descKey: 'verification.status_under_review_desc',
  },
  rejected: {
    labelKey: 'verification.status_rejected_label',
    className: 'border-red-200 bg-red-50 text-red-800',
    icon: AlertTriangle,
    descKey: 'verification.status_rejected_desc',
  },
  need_reupload: {
    labelKey: 'verification.status_need_reupload_label',
    className: 'border-orange-200 bg-orange-50 text-orange-800',
    icon: RefreshCw,
    descKey: 'verification.status_need_reupload_desc',
  },
  none: {
    labelKey: 'verification.status_none_label',
    className: 'border-border bg-muted/40 text-foreground',
    icon: Shield,
    descKey: 'verification.status_none_desc',
  },
};

export function VerificationStatusCard({
  profile,
  showAction = true,
}: {
  profile: Profile;
  showAction?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'en' ? 'en-US' : 'uz-UZ';
  const key = profile.isVerified
    ? 'verified'
    : profile.verificationStatus || 'none';
  const ui = STATUS_UI[key] || STATUS_UI.none;
  const Icon = ui.icon;

  return (
    <div className={`rounded-2xl border p-4 ${ui.className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-white/70 p-2">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold">{t(ui.labelKey)}</p>
            <p className="mt-0.5 text-sm opacity-80">{t(ui.descKey)}</p>
            {key === 'verified' && (
              <p className="mt-1 text-xs opacity-70">
                {t('verification.verified_by_platform')}
                {profile.updatedAt
                  ? ` · ${new Date(profile.updatedAt).toLocaleDateString(dateLocale)}`
                  : ''}
              </p>
            )}
          </div>
        </div>
        {showAction && key !== 'verified' && key !== 'pending' && key !== 'under_review' && (
          <Link
            to="/verification"
            className="shrink-0 rounded-xl bg-white/80 px-3 py-1.5 text-xs font-bold hover:bg-white"
          >
            {t('verification.verify_action_btn')}
          </Link>
        )}
        {showAction && (key === 'pending' || key === 'under_review') && (
          <Link
            to="/verification"
            className="shrink-0 rounded-xl bg-white/80 px-3 py-1.5 text-xs font-bold hover:bg-white"
          >
            {t('verification.status_action_btn')}
          </Link>
        )}
      </div>
    </div>
  );
}
