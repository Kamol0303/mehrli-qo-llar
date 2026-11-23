import React, { useState, useEffect } from 'react';
import { api, EmployerWorker } from '../../lib/api';
import { Job } from '../../types';
import { X, Send, Briefcase, DollarSign, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import SafeSelect from '../SafeSelect';

interface InviteWorkerModalProps {
  worker: EmployerWorker | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function InviteWorkerModal({
  worker,
  isOpen,
  onClose,
  onSuccess,
}: InviteWorkerModalProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('custom');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('200000');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingJobs, setFetchingJobs] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !worker) return;
    setSuccess(false);
    setError('');
    setTitle(`${worker.profession || worker.skills?.[0] || 'Xizmat'} bo‘yicha taklif`);
    setMessage(`Assalomu alaykum ${worker.fullName}. Sizga qulay ish taklif qilmoqchimiz.`);

    // Fetch employer's active jobs
    setFetchingJobs(true);
    api.jobs
      .list({ status: 'open' })
      .then((data) => {
        setJobs(data || []);
        if (data && data.length > 0) {
          setSelectedJobId(data[0].id);
        } else {
          setSelectedJobId('custom');
        }
      })
      .catch(() => setJobs([]))
      .finally(() => setFetchingJobs(false));
  }, [isOpen, worker]);

  if (!isOpen || !worker) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (selectedJobId !== 'custom') {
        const chosen = jobs.find((j) => j.id === selectedJobId);
        await api.employer.inviteWorker({
          workerId: worker.uid,
          jobId: selectedJobId,
          title: chosen?.title,
          price: chosen?.price || chosen?.salary || Number(price),
          message,
        });
      } else {
        if (!title.trim()) {
          setError('Iltimos, ish nomini kiriting');
          setLoading(false);
          return;
        }
        await api.employer.inviteWorker({
          workerId: worker.uid,
          title,
          price: Number(price) || 200000,
          message,
        });
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Taklif yuborishda xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-2xl transition-all">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        {success ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-black text-foreground">Taklif muvaffaqiyatli yuborildi!</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Ishchiga bildirishnoma va ichki chatda xabar yuborildi.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Ishchini taklif qilish</span>
              <h3 className="text-xl font-black text-foreground">{worker.fullName}</h3>
              <p className="text-xs text-muted-foreground">
                {worker.profession || worker.skills?.[0] || 'Mutaxassis'} · {worker.district || worker.region}
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-700 dark:bg-rose-950/30">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-bold text-foreground">
                Mavjud e‘loningizdan tanlang yoki yangi taklif yozing:
              </label>
              {fetchingJobs ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> E‘lonlar tekshirilmoqda…
                </div>
              ) : (
                <SafeSelect
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                >
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} ({(j.price || 0).toLocaleString()} so‘m)
                    </option>
                  ))}
                  <option value="custom">+ Yangi to‘g‘ridan-to‘g‘ri taklif kiritish</option>
                </SafeSelect>
              )}
            </div>

            {selectedJobId === 'custom' && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">Ish nomi</label>
                  <div className="relative">
                    <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Masalan: Uy tozalash, ta'mirlash"
                      className="w-full min-h-[44px] rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">Taklif qilinayotgan haq (so‘m)</label>
                  <div className="relative">
                    <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="number"
                      required
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="Masalan: 250000"
                      className="w-full min-h-[44px] rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="mb-1 block text-xs font-bold text-foreground">Xabar yoki qo‘shimcha ma‘lumot</label>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Qachon va qayerda ishlash kerakligini yozing…"
                className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 rounded-xl bg-secondary text-sm font-semibold text-foreground hover:bg-secondary/80"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-lg hover:opacity-95 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Taklif yuborish
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
