import { useEffect, useState } from "react";
import { HiOutlineDevicePhoneMobile, HiOutlineClipboardDocument } from "react-icons/hi2";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { useTimezone } from "timezone/TimezoneContext";
import { apiGet, apiPost } from "utils/api";

// This shop's phone-forwarder secret (PaymentNotificationForwarder/ Android app). The server
// only stores a hash, so the plaintext exists in exactly one place: the response to
// "generate", shown here once for the owner to copy into the phone. It's also what tells the
// server which shop an incoming bank SMS belongs to — see requireForwarderSecret.js.
export default function ForwarderCard() {
  const toast = useToast();
  const { t } = useLanguage();
  const { formatDateTime } = useTimezone();
  const [status, setStatus] = useState(null);
  const [secret, setSecret] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet("/api/bank-payments/webhook/secret")
      .then(setStatus)
      .catch((error) => {
        console.error("Error fetching forwarder status:", error);
        toast.error(error.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = async () => {
    // Replacing a working secret cuts the phone off until it's re-entered there.
    if (status?.configured && !window.confirm(t("settings.forwarderRegenerateConfirm"))) return;
    setBusy(true);
    try {
      const { secret: newSecret, ...newStatus } = await apiPost("/api/bank-payments/webhook/secret");
      setSecret(newSecret);
      setStatus(newStatus);
      toast.success(t("settings.forwarderGenerated"));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success(t("settings.copied"));
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div className="rounded-2xl border border-surface-border bg-white-A700 p-6 shadow-card dark:border-gray-800 dark:bg-gray-800">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-gray-700">
          <HiOutlineDevicePhoneMobile className="text-xl text-primary-600 dark:text-primary-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
            {t("settings.forwarderTitle")}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("settings.forwarderDesc")}</p>

          {status && (
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              {status.configured
                ? `${t("settings.forwarderConfiguredOn")}: ${formatDateTime(status.createdAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}`
                : t("settings.forwarderNotConfigured")}
            </p>
          )}

          {secret && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-400">
                {t("settings.forwarderSecretOnce")}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded bg-white-A700 px-2 py-1.5 font-mono text-sm text-gray-800 dark:bg-gray-900 dark:text-gray-100">
                  {secret}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-surface-border px-3 py-1.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-surface-subtle dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <HiOutlineClipboardDocument className="text-base" />
                  {t("settings.copy")}
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            // Not gated on `status` having loaded — if that fetch failed, generating a
            // secret is still the way forward (and returns the fresh status itself).
            disabled={busy}
            className="mt-3 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700 disabled:opacity-50"
          >
            {status?.configured ? t("settings.forwarderRegenerate") : t("settings.forwarderGenerate")}
          </button>
        </div>
      </div>
    </div>
  );
}
