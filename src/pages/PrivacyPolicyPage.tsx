import React from 'react';
import { ShieldCheck, Lock, MapPin, Mail, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { goBack } from '../lib/goBack';

export default function PrivacyPolicyPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const collectItems = t('privacy.collect_items', { returnObjects: true }) as string[];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <button
            type="button"
            onClick={() => goBack(navigate)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground hover:bg-secondary cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{t('common.back')}</span>
          </button>

          <div className="flex items-center gap-1 rounded-xl border border-border bg-secondary/40 p-1">
            {(['uz', 'ru', 'en'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => void i18n.changeLanguage(lang)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-black uppercase transition-colors cursor-pointer ${
                  i18n.language === lang
                    ? 'bg-[#1a7c78] text-white'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 pb-16">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1a7c78]/15 text-[#1a7c78]">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-foreground">{t('privacy.title')}</h1>
              <p className="text-xs font-medium text-muted-foreground">{t('privacy.subtitle')}</p>
            </div>
          </div>
          <p className="text-xs font-bold text-[#1a7c78]">{t('privacy.updated')}</p>
          <p className="text-sm leading-relaxed text-foreground/90">{t('privacy.intro')}</p>
        </div>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-sm font-extrabold text-foreground">
            <MapPin className="h-4 w-4 text-[#1a7c78]" />
            <h2>{t('privacy.collect_title')}</h2>
          </div>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            {Array.isArray(collectItems) &&
              collectItems.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm space-y-2">
          <h2 className="text-sm font-extrabold text-foreground">{t('privacy.use_title')}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{t('privacy.use_desc')}</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-sm font-extrabold text-foreground">
            <Lock className="h-4 w-4 text-[#1a7c78]" />
            <h2>{t('privacy.security_title')}</h2>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{t('privacy.security_desc')}</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-sm font-extrabold text-foreground">
            <Mail className="h-4 w-4 text-[#1a7c78]" />
            <h2>{t('privacy.contact_title')}</h2>
          </div>
          <p className="text-sm font-medium text-muted-foreground">{t('privacy.contact_desc')}</p>
        </section>
      </main>
    </div>
  );
}
