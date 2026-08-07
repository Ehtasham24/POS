import React, { useEffect, useState } from "react";
import { HiOutlineCog6Tooth, HiOutlineExclamationTriangle, HiOutlineLanguage } from "react-icons/hi2";
import AppShell from "components/AppShell";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";

const updateSetting = async (key, value) => {
  const response = await fetch("http://localhost:4000/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value: String(value) }),
  });
  if (!response.ok) throw new Error("Failed to update setting");
  return response.json();
};

export default function SettingsPage() {
  const toast = useToast();
  const { language, setLanguage, t } = useLanguage();
  const [settings, setSettings] = useState(null);
  const [threshold, setThreshold] = useState("10");
  const [savingThreshold, setSavingThreshold] = useState(false);

  const fetchSettings = async () => {
    try {
      const response = await fetch("http://localhost:4000/api/settings");
      const data = await response.json();
      setSettings(data);
      setThreshold(data.low_stock_threshold || "10");
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveThreshold = async () => {
    setSavingThreshold(true);
    try {
      await updateSetting("low_stock_threshold", Number(threshold) || 10);
      setSettings((prev) => ({ ...prev, low_stock_threshold: String(threshold) }));
      toast.success("Low stock threshold updated");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingThreshold(false);
    }
  };

  if (!settings) {
    return (
      <AppShell title={t("settings.title")}>
        <p className="text-gray-500 dark:text-gray-400">{t("settings.loading")}</p>
      </AppShell>
    );
  }

  return (
    <AppShell title={t("settings.title")}>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="rounded-2xl border border-surface-border bg-white-A700 p-6 shadow-card dark:border-gray-800 dark:bg-gray-800">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-gray-700">
              <HiOutlineLanguage className="text-xl text-primary-600 dark:text-primary-400" />
            </div>
            <div className="flex-1">
              <h2 className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
                {t("settings.languageTitle")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("settings.languageDesc")}
              </p>
              <div className="mt-3 grid max-w-xs grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLanguage("en")}
                  className={`rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                    language === "en"
                      ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400"
                      : "border-surface-border text-gray-600 hover:bg-surface-subtle dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  {t("settings.english")}
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage("ur")}
                  className={`rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                    language === "ur"
                      ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400"
                      : "border-surface-border text-gray-600 hover:bg-surface-subtle dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  {t("settings.urdu")}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-surface-border bg-white-A700 p-6 shadow-card dark:border-gray-800 dark:bg-gray-800">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-gray-700">
              <HiOutlineExclamationTriangle className="text-xl text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h2 className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
                {t("settings.lowStockTitle")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("settings.lowStockDesc")}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="h-10 w-32 rounded-lg border border-surface-border bg-white-A700 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={handleSaveThreshold}
                  disabled={savingThreshold}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700 disabled:opacity-50"
                >
                  {savingThreshold ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-surface-border p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          <HiOutlineCog6Tooth className="shrink-0 text-lg" />
          {t("settings.batchNote")}
        </div>
      </div>
    </AppShell>
  );
}
