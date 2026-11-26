import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function DrawerPageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-border bg-background text-foreground hover:bg-secondary transition-colors"
            aria-label={t('common.back')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold tracking-tight text-foreground">{title}</h1>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <img
            src="/assets/aistudio/QwHMpg7yEQCosZA2vOSghaO2lyc1KFYxFoS7RbHW_cb9caa0f.png"
            alt={t('common.branding_short')}
            className="h-9 w-9 shrink-0 rounded-lg border border-border/60 bg-white object-contain p-0.5"
          />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5 space-y-4">{children}</main>
    </div>
  );
}
