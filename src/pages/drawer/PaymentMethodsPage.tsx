import React from 'react';
import { Banknote, CheckCircle, CreditCard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DrawerPageShell from './DrawerPageShell';

export default function PaymentMethodsPage() {
  const { t } = useTranslation();

  return (
    <DrawerPageShell title={t('drawer.payment_methods')}>
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-2xl border-2 border-[#1a7c78] bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1a7c78]/10 text-[#1a7c78]">
              <Banknote className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-foreground">{t('yandex.payment_cash')}</p>
              <p className="text-xs text-muted-foreground">{t('yandex.recommended_rate')}</p>
            </div>
          </div>
          <CheckCircle className="h-5 w-5 text-[#1a7c78]" />
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-border bg-card/70 p-4 opacity-80">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{t('yandex.payment_card_soon')}</p>
              <p className="text-xs text-muted-foreground">{t('yandex.card_soon_note')}</p>
            </div>
          </div>
        </div>
      </div>
    </DrawerPageShell>
  );
}
