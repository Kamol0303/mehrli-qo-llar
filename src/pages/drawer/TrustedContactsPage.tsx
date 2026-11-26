import React, { useEffect, useState } from 'react';
import { Loader2, Phone, Plus, Trash2, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DrawerPageShell from './DrawerPageShell';
import { api } from '../../lib/api';
import type { TrustedContact } from '../../types';

export default function TrustedContactsPage() {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+998');
  const [telegramUsername, setTelegramUsername] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.safety.listTrustedContacts();
      setContacts(res.contacts || []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.unexpected'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || phone.trim().length < 7) return;
    setSaving(true);
    setError('');
    try {
      const created = await api.safety.addTrustedContact({
        name: name.trim(),
        phone: phone.trim(),
        telegramUsername: telegramUsername.trim() || undefined,
      });
      setContacts((prev) => [created, ...prev]);
      setName('');
      setPhone('+998');
      setTelegramUsername('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.unexpected'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await api.safety.removeTrustedContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.unexpected'));
    }
  };

  return (
    <DrawerPageShell title={t('drawer.trusted_contacts')}>
      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      <form onSubmit={handleAdd} className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-sm">
        <h2 className="text-sm font-extrabold text-foreground">{t('drawer.add_contact')}</h2>
        <div className="space-y-2.5">
          <div>
            <label htmlFor="tc-name" className="mb-1 block text-xs font-bold text-muted-foreground">
              {t('drawer.contact_name')}
            </label>
            <input
              id="tc-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label htmlFor="tc-phone" className="mb-1 block text-xs font-bold text-muted-foreground">
              {t('drawer.contact_phone')}
            </label>
            <input
              id="tc-phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="tc-tg" className="mb-1 block text-xs font-bold text-muted-foreground">
              {t('drawer.contact_tg')}
            </label>
            <input
              id="tc-tg"
              type="text"
              value={telegramUsername}
              onChange={(e) => setTelegramUsername(e.target.value)}
              placeholder="@username"
              className="w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#1a7c78] text-sm font-extrabold text-white hover:opacity-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t('drawer.add_contact')}
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-[#1a7c78]" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-2">
          <Users className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground">{t('drawer.trusted_contacts')}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border border-l-4 border-l-[#1a7c78] bg-card p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-foreground">{contact.name}</p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums mt-0.5">
                  <Phone className="h-3.5 w-3.5 text-[#1a7c78]" />
                  {contact.phone}
                  {contact.telegramUsername && <span>· {contact.telegramUsername}</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRemove(contact.id)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-rose-500/30 text-rose-600 hover:bg-rose-500/10"
                aria-label={`${contact.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </DrawerPageShell>
  );
}
