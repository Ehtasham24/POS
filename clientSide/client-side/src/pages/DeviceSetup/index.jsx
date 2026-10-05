import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlineCheckCircle } from "react-icons/hi2";
import Logo from "components/Logo";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { apiPost } from "utils/api";
import { refreshDeviceStatus } from "hooks/useDeviceStatus";

const inputClass =
  "block w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";
const labelClass = "mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400";
const STEPS = ["signing_in", "registering", "downloading", "saving"];
const POLL_MS = 700;

// First run on a shop's own device (the Windows/Android app): the owner signs in with their
// usual account, and the device registers with the cloud and downloads the shop
// (device/setup.js). Only reachable on a device — Login sends a device that isn't set up here.
export default function DeviceSetup() {
  const { t } = useLanguage();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "", deviceName: "Counter PC", cloudUrl: "" });
  const [showServer, setShowServer] = useState(false);
  const [setup, setSetup] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef(null);

  // Progress comes from the device itself, not this page's state, so it survives the page
  // being reloaded or remounted while setup runs.
  const applyStatus = (status) => {
    if (!status?.device) return navigate("/login", { replace: true });
    setForm((prev) => ({ ...prev, cloudUrl: prev.cloudUrl || status.cloudUrl || "" }));
    setSetup(status.setup);
    if (status.setUp) {
      clearInterval(pollRef.current);
      toast.success(t("deviceSetup.done", { shop: status.shopName }));
      navigate("/login", { replace: true });
    } else if (status.setup?.status === "running") {
      if (!pollRef.current) pollRef.current = setInterval(() => refreshDeviceStatus().then(applyStatus), POLL_MS);
    } else {
      clearInterval(pollRef.current);
      pollRef.current = null;
      setSubmitting(false);
      if (status.setup?.status === "error") setError(status.setup.message);
    }
    return null;
  };

  useEffect(() => {
    refreshDeviceStatus().then(applyStatus);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      applyStatus({ device: true, setUp: false, setup: await apiPost("/api/device/setup", form) });
    } catch (err) {
      setSubmitting(false);
      setError(err.message);
    }
  };

  const running = submitting || setup?.status === "running";
  const stepIndex = STEPS.indexOf(setup?.step);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-subtle px-4 safe-pt safe-pb dark:bg-gray-900">
      <div className="w-full max-w-md rounded-2xl border border-surface-border bg-white-A700 p-8 shadow-card dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Logo className="h-12 w-12" />
          <h1 className="font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">{t("deviceSetup.title")}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("deviceSetup.intro")}</p>
        </div>

        {running ? (
          <ol className="space-y-3" aria-live="polite">
            {STEPS.map((step, i) => {
              const done = stepIndex > i;
              const current = stepIndex === i;
              return (
                <li key={step} className="flex items-center gap-3 text-sm">
                  {done ? (
                    <HiOutlineCheckCircle className="h-5 w-5 shrink-0 text-success-600" />
                  ) : (
                    <span
                      className={`h-5 w-5 shrink-0 rounded-full border-2 ${
                        current
                          ? "border-primary-100 border-t-primary-600 motion-safe:animate-spin dark:border-gray-700 dark:border-t-primary-500"
                          : "border-surface-border dark:border-gray-700"
                      }`}
                    />
                  )}
                  <span className={current ? "font-semibold text-gray-800 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}>
                    {t(`deviceSetup.step.${step}`)}
                    {step === "downloading" && current && setup.rows > 0 && ` (${setup.rows.toLocaleString()})`}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelClass}>{t("deviceSetup.ownerUsername")}</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                autoFocus
                autoComplete="username"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t("auth.password")}</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                autoComplete="current-password"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t("deviceSetup.deviceName")}</label>
              <input
                type="text"
                maxLength={60}
                value={form.deviceName}
                onChange={(e) => setForm((prev) => ({ ...prev, deviceName: e.target.value }))}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("deviceSetup.deviceNameHint")}</p>
            </div>

            {showServer ? (
              <div>
                <label className={labelClass}>{t("deviceSetup.server")}</label>
                <input
                  type="url"
                  value={form.cloudUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, cloudUrl: e.target.value }))}
                  className={inputClass}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowServer(true)}
                className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
              >
                {t("deviceSetup.changeServer")}
              </button>
            )}

            {error && (
              <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600 dark:bg-danger-500/10 dark:text-danger-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!form.username || !form.password || !form.deviceName.trim()}
              className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("deviceSetup.submit")}
            </button>
            <p className="text-center text-xs text-gray-500 dark:text-gray-400">{t("deviceSetup.needsInternet")}</p>
          </form>
        )}
      </div>
    </div>
  );
}
