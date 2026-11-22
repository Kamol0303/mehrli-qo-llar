import { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Camera,
  Clock,
  FileText,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import type { VerificationRequest } from '../types';
import { SecureImage } from '../components/verification/SecureMedia';
import { VerificationStatusCard } from '../components/verification/VerificationStatusCard';

type FormState = {
  idPhotoUrl: string;
  selfieUrl: string;
  idChecks?: unknown;
  selfieChecks?: unknown;
};

export default function VerificationPage() {
  const { t } = useTranslation();
  const { profile, refreshProfile } = useAuth();
  const location = useLocation();
  const gateMessage =
    (location.state as { message?: string; prompt?: string } | null)?.message ||
    (location.state as { prompt?: string } | null)?.prompt ||
    '';

  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [forceForm, setForceForm] = useState(false);
  const [formData, setFormData] = useState<FormState>({
    idPhotoUrl: '',
    selfieUrl: '',
  });

  const canResubmit =
    !request ||
    request.status === 'rejected' ||
    request.status === 'need_reupload';

  useEffect(() => {
    void (async () => {
      if (!profile?.uid) return;
      try {
        const mine = await api.verificationRequests.mine();
        setRequest(mine);
      } catch {
        setRequest(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [profile?.uid]);

  const uploadField = async (
    file: File | undefined,
    field: 'idPhotoUrl' | 'selfieUrl',
    kind: string,
  ) => {
    if (!file) return;
    setUploading(field);
    setError('');
    try {
      const res = await api.uploads.upload(file, kind as 'verification');
      setFormData((prev) => ({
        ...prev,
        [field]: res.url,
        ...(field === 'idPhotoUrl'
          ? { idChecks: (res as { documentChecks?: unknown }).documentChecks }
          : {}),
        ...(field === 'selfieUrl'
          ? { selfieChecks: (res as { documentChecks?: unknown }).documentChecks }
          : {}),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('verification.upload_error'));
    } finally {
      setUploading(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile?.uid) return;
    if (!formData.idPhotoUrl || !formData.selfieUrl) {
      setError(t('verification.documents_required'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        idPhotoUrl: formData.idPhotoUrl,
        documentUrl: formData.idPhotoUrl,
        selfieUrl: formData.selfieUrl,
        documentType: 'passport',
        documentChecks: {
          id: formData.idChecks,
          selfie: formData.selfieChecks,
        },
      };

      let next: VerificationRequest;
      if (request && (request.status === 'rejected' || request.status === 'need_reupload')) {
        next = await api.verificationRequests.update(request.id, payload);
      } else {
        next = await api.verificationRequests.create(payload);
      }
      setRequest(next);
      setForceForm(false);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('verification.submit_error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const showForm = !request || forceForm;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="flex items-center gap-4">
          <div className="rounded-3xl bg-primary/10 p-4 text-primary">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{t('verification.title')}</h2>
            <p className="mt-1 text-muted-foreground">
              {profile?.role === 'employer'
                ? t('verification.employer_subtitle')
                : t('verification.subtitle')}
            </p>
          </div>
        </div>

        {gateMessage && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            <p className="font-bold">{t('verification.passport_prompt')}</p>
            <p className="mt-1">{t('verification.required_notice')}</p>
          </div>
        )}

        {profile && <VerificationStatusCard profile={profile} showAction={false} />}

        {request && !showForm && (
          <div className="uz-panel space-y-6 rounded-[2.5rem] bg-card p-8 text-center shadow-sm">
            {(request.status === 'pending' || request.status === 'under_review') && (
              <>
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                  <Clock className="h-10 w-10" />
                </div>
                <h3 className="text-2xl font-bold">{t('verification.pending_title')}</h3>
                <p className="mx-auto max-w-md text-muted-foreground">{t('verification.pending_desc')}</p>
              </>
            )}
            {request.status === 'verified' && (
              <>
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <ShieldCheck className="h-10 w-10" />
                </div>
                <h3 className="text-2xl font-bold">{t('verification.approved_title')}</h3>
                <p className="text-muted-foreground">{t('verification.approved_desc')}</p>
              </>
            )}
            {(request.status === 'rejected' || request.status === 'need_reupload') && (
              <>
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <AlertTriangle className="h-10 w-10" />
                </div>
                <h3 className="text-2xl font-bold">
                  {request.status === 'need_reupload' ? t('verification.reupload_title') : t('verification.rejected_title')}
                </h3>
                <p className="text-muted-foreground">
                  {request.rejectionReason || request.reviewNote || t('verification.rejected_desc')}
                </p>
                {canResubmit && (
                  <button
                    type="button"
                    onClick={() => {
                      setForceForm(true);
                      setFormData((prev) => ({
                        ...prev,
                        idPhotoUrl: '',
                        selfieUrl: '',
                      }));
                    }}
                    className="mt-4 rounded-2xl bg-primary px-8 py-3 font-bold text-primary-foreground"
                  >
                    {t('verification.try_again')}
                  </button>
                )}
              </>
            )}
            <DocumentGallery request={request} />
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="uz-panel space-y-8 rounded-[2.5rem] bg-card p-8 shadow-sm">
              <UploadSlot
                title={t('verification.id_document')}
                desc={t('verification.id_desc')}
                icon={<FileText className="h-8 w-8" />}
                url={formData.idPhotoUrl}
                loading={uploading === 'idPhotoUrl'}
                onFile={(f) => void uploadField(f, 'idPhotoUrl', 'verification_id')}
                onClear={() => setFormData((p) => ({ ...p, idPhotoUrl: '', idChecks: undefined }))}
              />
              <UploadSlot
                title={t('verification.selfie_verification')}
                desc={t('verification.selfie_desc')}
                icon={<Camera className="h-8 w-8" />}
                url={formData.selfieUrl}
                loading={uploading === 'selfieUrl'}
                square
                onFile={(f) => void uploadField(f, 'selfieUrl', 'verification_selfie')}
                onClear={() => setFormData((p) => ({ ...p, selfieUrl: '', selfieChecks: undefined }))}
              />
            </div>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex flex-col items-end gap-2">
              {(!formData.idPhotoUrl || !formData.selfieUrl) && (
                <p className="text-xs text-muted-foreground">
                  {!formData.idPhotoUrl
                    ? '1-bosqich: Shaxsni tasdiqlovchi hujjat rasmini yuklang'
                    : '2-bosqich: Selfi rasmini yuklang'}
                </p>
              )}
              <button
                type="submit"
                disabled={
                  submitting ||
                  !formData.idPhotoUrl ||
                  !formData.selfieUrl ||
                  Boolean(uploading)
                }
                className="rounded-2xl bg-primary px-12 py-4 font-bold text-primary-foreground shadow-xl disabled:opacity-50"
              >
                {submitting ? t('verification.submitting') : t('verification.submit_btn')}
              </button>
            </div>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
}

function DocumentGallery({ request }: { request: VerificationRequest }) {
  const { t } = useTranslation();
  const passport = request.passportData;
  const hasPassportInfo = Boolean(
    passport && (passport.series || passport.number || passport.pinfl || passport.fullName),
  );
  return (
    <div className="space-y-4 pt-2 text-left">
      {hasPassportInfo && passport && (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Info label={t('verification.series')} value={passport.series} />
          <Info label={t('verification.number')} value={passport.number} />
          <Info label={t('verification.pinfl')} value={passport.pinfl} />
          <Info label={t('verification.full_name')} value={passport.fullName} />
        </dl>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PreviewTile title={t('verification.id_document')} url={request.idPhotoUrl || request.documentUrl} />
        <PreviewTile title={t('verification.selfie_verification')} url={request.selfieUrl} square />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-2xl bg-secondary/70 px-3 py-2">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold text-foreground">{value || '—'}</dd>
    </div>
  );
}

function PreviewTile({ title, url, square }: { title: string; url?: string | null; square?: boolean }) {
  return (
    <figure className="space-y-2">
      <figcaption className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</figcaption>
      <div className={`relative overflow-hidden rounded-2xl border border-border bg-secondary ${square ? 'aspect-square' : 'aspect-[4/3]'}`}>
        <SecureImage url={url} alt={title} className="absolute inset-0 h-full w-full object-cover" />
      </div>
    </figure>
  );
}

function UploadSlot({
  title,
  desc,
  icon,
  url,
  loading,
  square,
  onFile,
  onClear,
}: {
  title: string;
  desc: string;
  icon: ReactNode;
  url: string;
  loading?: boolean;
  square?: boolean;
  onFile: (file?: File) => void;
  onClear?: () => void;
}) {
  const { t } = useTranslation();
  const [localPreview, setLocalPreview] = useState<string>();

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xl font-bold">{title}</h3>
        {(url || localPreview) && onClear && (
          <button
            type="button"
            onClick={() => {
              setLocalPreview((current) => {
                if (current) URL.revokeObjectURL(current);
                return undefined;
              });
              onClear();
            }}
            className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50"
          >
            {t('common.delete')}
          </button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{desc}</p>
      <div className="relative">
        <div
          className={`${square ? 'aspect-square max-w-sm' : 'aspect-[4/3]'} relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border-2 border-dashed border-[#c6a15b]/50 bg-secondary/50`}
        >
          {localPreview ? (
            <img src={localPreview} alt={title} className="absolute inset-0 h-full w-full object-cover" />
          ) : url ? (
            <SecureImage url={url} alt={title} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <>
              <div className="rounded-2xl bg-primary/10 p-4 text-primary">{icon}</div>
              <p className="text-sm font-bold text-muted-foreground">{t('verification.choose_file')}</p>
            </>
          )}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/55">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,.pdf"
            className="absolute inset-0 z-10 cursor-pointer opacity-0"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file?.type.startsWith('image/')) {
                const next = URL.createObjectURL(file);
                setLocalPreview((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return next;
                });
              }
              onFile(file);
            }}
          />
        </div>
      </div>
    </section>
  );
}
