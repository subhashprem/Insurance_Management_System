import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../components/Toast.jsx';
import api from '../lib/api.js';

export default function Notifications({ user }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.listNotifications());
    } catch {
      toast('Failed to load notifications', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = items.filter(item => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      item.holder_name?.toLowerCase().includes(s) ||
      item.name?.toLowerCase().includes(s) ||
      item.policy_no?.toLowerCase().includes(s) ||
      item.sr_code?.toLowerCase().includes(s) ||
      item.code?.toLowerCase().includes(s) ||
      item.role?.toLowerCase().includes(s)
    );
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const handleWhatsApp = async (item) => {
    if (item.type === 'birthday') {
      await api.openWhatsapp({
        phone: item.contact_1,
        name: item.name,
        type: 'birthday',
        adminName: user?.name || 'Administrator',
      });
    } else {
      await api.openWhatsapp({
        phone: item.contact_1,
        name: item.holder_name,
        policyNo: item.policy_no,
        dueDate: formatDate(item.due_date),
        premium: item.premium,
        type: 'payment',
      });
    }
    await api.markWhatsapp(item.id);
    toast('WhatsApp opened. Reminder marked as sent.', 'success');
    load();
  };

  return (
    <div className="space-y-6">
      {/* Sub-actions toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative w-80">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
            <input
              id="notif-search"
              className="w-full bg-surface-container border border-border-subtle rounded-lg pl-9 pr-4 py-1.5 text-body-md text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary focus:outline-none"
              placeholder="Search by holder, policy, SR code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            id="notif-filter"
            className="bg-surface-container border border-border-subtle rounded-lg text-body-md text-on-surface p-2 focus:ring-2 focus:ring-primary focus:outline-none w-48 cursor-pointer"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            <option value="all">All Reminders</option>
            <option value="birthday">Birthdays</option>
            <option value="payment">Policy Payment Renewals</option>
          </select>
        </div>
        <button
          className="flex items-center gap-1.5 bg-surface-variant hover:bg-surface-container-highest text-on-surface transition-colors px-4 py-1.5 rounded text-body-md border border-border-subtle"
          onClick={load}
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <span className="animate-spin h-8 w-8 border-3 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel text-center py-16 rounded-xl border border-border-subtle">
          <span className="material-symbols-outlined text-success text-[48px] mb-4">task_alt</span>
          <p className="text-body-lg font-bold text-on-surface">No upcoming reminders</p>
          <p className="text-body-md text-on-surface-variant mt-1">All clear! No payment or birthday reminders are pending within 30 days.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map(item => {
            const days = Math.round(item.days_left ?? 0);
            const isUrgent = days <= 7;
            const isWarning = days <= 15;

            // Border color class depending on days left / type
            let statusColorClass = 'border-l-primary';
            let statusBadge = null;

            if (item.type === 'birthday') {
              if (days === 0) {
                statusColorClass = 'border-l-success';
                statusBadge = (
                  <span className="px-2.5 py-0.5 rounded bg-success/10 text-success text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
                    🎂 Birthday Today!
                  </span>
                );
              } else {
                statusColorClass = 'border-l-primary';
                statusBadge = (
                  <span className="px-2.5 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
                    🎂 Birthday in {days} days
                  </span>
                );
              }
            } else {
              // Payment due dates logic
              statusBadge = (
                <span className="px-2.5 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-bold uppercase tracking-wider">
                  Due in {days} days
                </span>
              );

              if (days <= 0) {
                statusColorClass = 'border-l-error';
                statusBadge = (
                  <span className="px-2.5 py-0.5 rounded bg-error/10 text-error text-[11px] font-bold uppercase tracking-wider">
                    Overdue!
                  </span>
                );
              } else if (isUrgent) {
                statusColorClass = 'border-l-error';
                statusBadge = (
                  <span className="px-2.5 py-0.5 rounded bg-error/10 text-error text-[11px] font-bold uppercase tracking-wider">
                    Urgent: {days} days left
                  </span>
                );
              } else if (isWarning) {
                statusColorClass = 'border-l-warning';
                statusBadge = (
                  <span className="px-2.5 py-0.5 rounded bg-warning/10 text-warning text-[11px] font-bold uppercase tracking-wider">
                    Warning: {days} days left
                  </span>
                );
              }
            }

            return (
              <div
                key={item.id}
                className={`glass-panel p-5 rounded-xl border border-border-subtle border-l-4 ${statusColorClass} transition-all hover:border-primary/40 shadow-lg`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-body-lg font-bold text-on-surface">
                        {item.type === 'birthday' ? item.name : item.holder_name}
                      </span>
                      {statusBadge}
                      {!!item.whatsapp_sent && (
                        <span className="px-2 py-0.5 rounded bg-success/10 text-success text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">done</span>
                          Reminder Sent
                        </span>
                      )}
                    </div>

                    {item.type === 'birthday' ? (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-y-2 gap-x-6 text-body-md text-on-surface-variant">
                        <div>
                          <span className="text-outline block text-[11px] uppercase tracking-wider font-semibold">Type / Role</span>
                          <span className="text-on-surface font-semibold">{item.role}</span>
                        </div>
                        <div>
                          <span className="text-outline block text-[11px] uppercase tracking-wider font-semibold">
                            {item.role === 'Policy Holder' ? 'Policy No' : 'Code'}
                          </span>
                          <span className="font-mono-data text-mono-data text-primary-fixed-dim">
                            {item.role === 'Policy Holder' ? item.policy_no : (item.code || '—')}
                          </span>
                        </div>
                        <div>
                          <span className="text-outline block text-[11px] uppercase tracking-wider font-semibold">Contact</span>
                          <span className="font-mono-data text-mono-data">{item.contact_1 || '—'}</span>
                        </div>
                        <div>
                          <span className="text-outline block text-[11px] uppercase tracking-wider font-semibold">Date of Birth</span>
                          <span className="font-mono-data text-mono-data">{formatDate(item.dob)}</span>
                        </div>
                        <div>
                          <span className="text-outline block text-[11px] uppercase tracking-wider font-semibold">Next Birthday</span>
                          <span className="font-mono-data text-mono-data text-success">{formatDate(item.next_birthday)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-y-2 gap-x-6 text-body-md text-on-surface-variant">
                        <div>
                          <span className="text-outline block text-[11px] uppercase tracking-wider font-semibold">Policy No</span>
                          <span className="font-mono-data text-mono-data text-primary-fixed-dim">{item.policy_no}</span>
                        </div>
                        <div>
                          <span className="text-outline block text-[11px] uppercase tracking-wider font-semibold">Contact</span>
                          <span className="font-mono-data text-mono-data">{item.contact_1 || '—'}</span>
                        </div>
                        <div>
                          <span className="text-outline block text-[11px] uppercase tracking-wider font-semibold">Premium</span>
                          <span className="font-mono-data text-mono-data text-primary">Rs. {Number(item.premium || 0).toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-outline block text-[11px] uppercase tracking-wider font-semibold">Due Date</span>
                          <span className="font-mono-data text-mono-data">{formatDate(item.due_date)}</span>
                        </div>
                        <div>
                          <span className="text-outline block text-[11px] uppercase tracking-wider font-semibold">SR Code</span>
                          <span className="font-mono-data text-mono-data">{item.sr_code || '—'}</span>
                        </div>
                        <div>
                          <span className="text-outline block text-[11px] uppercase tracking-wider font-semibold">SR Name</span>
                          <span className="truncate block" title={item.sr_name}>{item.sr_name || '—'}</span>
                        </div>
                      </div>
                    )}

                    {!!item.whatsapp_sent && item.whatsapp_sent_at && (
                      <div className="text-[11px] text-outline italic">
                        Last notification sent: {new Date(item.whatsapp_sent_at).toLocaleString()}
                      </div>
                    )}
                  </div>

                  <div className="flex-shrink-0 self-end sm:self-center">
                    <button
                      id={`btn-wa-${item.id}`}
                      className="flex items-center gap-2 bg-success text-on-surface-deep px-5 py-2 rounded-lg font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => handleWhatsApp(item)}
                      disabled={!item.contact_1}
                      title={!item.contact_1 ? 'No contact number on file' : 'Send WhatsApp reminder'}
                    >
                      <span className="material-symbols-outlined text-[20px]">chat</span>
                      WhatsApp
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
