import React, { useEffect, useState } from "react";
import { HiOutlinePlus } from "react-icons/hi2";
import { Modal, SkeletonRows, EmptyState } from "components";
import { useToast } from "components/Toast/ToastContext";
import { apiGet, apiPost, apiPatch } from "utils/api";
import AdminPage from "./AdminPage";
import { cardClass, inputClass, labelClass, buttonClass, formatDateTime, TIERS, SEVERITY_CLASS } from "./shared";

const STATUS_CHIP = {
  live: "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-500",
  scheduled: "bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300",
  ended: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
};

const emptyForm = { title: "", body: "", level: "info", shopId: "", tier: "", startsAt: "", endsAt: "" };

// A datetime-local value (this browser's clock) as an instant the server can't misread.
const toInstant = (value) => (value ? new Date(value).toISOString() : null);

const audienceOf = (a) => {
  const who = a.shop_id ? a.shop_name : "Every shop";
  return a.tier ? `${who} · ${a.tier} plan only` : who;
};

// Notices to shops — shown as a banner at the top of the shop's app while live
// (Sevices/announcementService.js). Ending one keeps it in this list.
export default function AdminAnnouncements() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [shops, setShops] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [endingId, setEndingId] = useState(null);

  const load = async () => {
    try {
      setItems(await apiGet("/api/admin/announcements"));
    } catch (err) {
      toast.error(err.message);
    }
  };

  useEffect(() => {
    load();
    apiGet("/api/admin/shops")
      .then(setShops)
      .catch(() => setShops([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm((prev) => ({ ...prev, [key]: e.target.value })),
  });

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPost("/api/admin/announcements", {
        title: form.title,
        body: form.body,
        level: form.level,
        shopId: form.shopId ? Number(form.shopId) : null,
        tier: form.tier || null,
        startsAt: toInstant(form.startsAt),
        endsAt: toInstant(form.endsAt),
      });
      toast.success("Announcement sent.");
      setShowCreate(false);
      setForm(emptyForm);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEnd = async (a) => {
    if (!window.confirm(`Take down "${a.title}" now?`)) return;
    setEndingId(a.id);
    try {
      await apiPatch(`/api/admin/announcements/${a.id}/end`);
      toast.success("Announcement ended.");
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setEndingId(null);
    }
  };

  return (
    <AdminPage
      title="Announcements"
      heading="Announcements"
      subtitle="Notices shown as a banner in shops' apps — maintenance, new features, reminders."
      actions={
        <button type="button" onClick={() => setShowCreate(true)} className={`${buttonClass.primary} flex items-center gap-1.5`}>
          <HiOutlinePlus />
          New announcement
        </button>
      }
    >
      <div className={`${cardClass} overflow-hidden`}>
        {!items ? (
          <SkeletonRows count={4} />
        ) : items.length === 0 ? (
          <EmptyState title="No announcements yet." />
        ) : (
          <ul className="divide-y divide-surface-border dark:divide-gray-700">
            {items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_CHIP[a.status]}`}>
                      {a.status}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${SEVERITY_CLASS[a.level]}`}
                    >
                      {a.level}
                    </span>
                    <p className="font-semibold text-gray-800 dark:text-gray-100">{a.title}</p>
                  </div>
                  {a.body && <p className="mt-1 whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">{a.body}</p>}
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {audienceOf(a)} · {formatDateTime(a.starts_at)} → {a.ends_at ? formatDateTime(a.ends_at) : "until ended"}
                    {a.created_by_name && ` · by ${a.created_by_name}`}
                  </p>
                </div>
                {a.status !== "ended" && (
                  <button type="button" disabled={endingId === a.id} onClick={() => handleEnd(a)} className={buttonClass.danger}>
                    {a.status === "scheduled" ? "Cancel" : "End now"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New announcement" maxWidth="max-w-lg">
        <form className="space-y-4" onSubmit={handleCreate}>
          <div>
            <label className={labelClass}>Title</label>
            <input
              type="text"
              required
              maxLength={120}
              className={inputClass}
              placeholder="e.g. Scheduled maintenance tonight"
              {...field("title")}
            />
          </div>
          <div>
            <label className={labelClass}>Message</label>
            <textarea
              rows={3}
              maxLength={1000}
              className={inputClass}
              placeholder="Optional — shown under the title"
              {...field("body")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-1">
            <div>
              <label className={labelClass}>Importance</label>
              <select className={inputClass} {...field("level")}>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Plan</label>
              <select className={inputClass} {...field("tier")}>
                <option value="">Every plan</option>
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)} only
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Shops</label>
            <select className={inputClass} {...field("shopId")}>
              <option value="">Every shop</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  Only {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-1">
            <div>
              <label className={labelClass}>Show from</label>
              <input type="datetime-local" className={inputClass} {...field("startsAt")} />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Blank = right away</p>
            </div>
            <div>
              <label className={labelClass}>Until</label>
              <input type="datetime-local" className={inputClass} {...field("endsAt")} />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Blank = until you end it</p>
            </div>
          </div>
          <button type="submit" disabled={saving} className={`${buttonClass.primary} w-full py-2.5`}>
            {saving ? "Sending…" : "Send announcement"}
          </button>
        </form>
      </Modal>
    </AdminPage>
  );
}
