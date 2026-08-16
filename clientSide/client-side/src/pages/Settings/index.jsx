import React, { useEffect, useState } from "react";
import {
  HiOutlineCog6Tooth,
  HiOutlineExclamationTriangle,
  HiOutlineLanguage,
  HiOutlinePrinter,
  HiOutlineDocumentText,
  HiOutlineReceiptRefund,
} from "react-icons/hi2";
import AppShell from "components/AppShell";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { apiGet, apiPut } from "utils/api";
import { printTestReceipt } from "utils/printReceipt";
import useThermalPrinterStatus from "hooks/useThermalPrinterStatus";
import { DEFAULT_RECEIPT_TERMS } from "utils/receiptDefaults";
import UsersCard from "./UsersCard";

const updateSetting = (key, value) => apiPut("/api/settings", { key, value: String(value) });

function PrinterCard() {
  const toast = useToast();
  const { t } = useLanguage();
  const { type, name, bluetoothSupported, usbSupported, connectBluetooth, connectUsb, disconnect } =
    useThermalPrinterStatus();
  const [busy, setBusy] = useState(false);

  const withBusy = (fn) => async () => {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleTestPrint = withBusy(async () => {
    await printTestReceipt();
    toast.success("Test print sent");
  });

  return (
    <div className="rounded-2xl border border-surface-border bg-white-A700 p-6 shadow-card dark:border-gray-800 dark:bg-gray-800">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-gray-700">
          <HiOutlinePrinter className="text-xl text-primary-600 dark:text-primary-400" />
        </div>
        <div className="flex-1">
          <h2 className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
            {t("settings.receiptPrinterTitle")}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {type
              ? `Connected: ${name} (${type === "bluetooth" ? "Bluetooth" : "USB"}) — receipts print directly, no dialog.`
              : "Not connected — receipts will open the print dialog instead."}
          </p>

          {!bluetoothSupported && !usbSupported && (
            <p className="mt-3 rounded-lg bg-surface-subtle px-3 py-2.5 text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              Direct printing isn't supported in this browser (Bluetooth/USB printing only
              works in Chrome or Edge). Receipts will use the print dialog — set that
              printer as default there for the closest experience.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {bluetoothSupported && (
              <button
                type="button"
                disabled={busy}
                onClick={withBusy(connectBluetooth)}
                className="rounded-lg border border-surface-border px-3.5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-surface-subtle disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {t("settings.connectBluetooth")}
              </button>
            )}
            {usbSupported && (
              <button
                type="button"
                disabled={busy}
                onClick={withBusy(connectUsb)}
                className="rounded-lg border border-surface-border px-3.5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-surface-subtle disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {t("settings.connectUsb")}
              </button>
            )}
            {type && (
              <button
                type="button"
                disabled={busy}
                onClick={withBusy(disconnect)}
                className="rounded-lg px-3.5 py-2 text-sm font-semibold text-danger-600 transition-colors hover:bg-danger-50 disabled:opacity-50 dark:hover:bg-danger-500/10"
              >
                {t("settings.disconnect")}
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={handleTestPrint}
              className="rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              {t("settings.testPrint")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const toast = useToast();
  const { language, setLanguage, t } = useLanguage();
  const [settings, setSettings] = useState(null);
  const [threshold, setThreshold] = useState("10");
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [terms, setTerms] = useState("");
  const [savingTerms, setSavingTerms] = useState(false);
  const [refundWindow, setRefundWindow] = useState(""); // "" = unlimited (unset)
  const [savingRefundWindow, setSavingRefundWindow] = useState(false);

  const fetchSettings = async () => {
    try {
      const data = await apiGet("/api/settings");
      setSettings(data);
      setThreshold(data.low_stock_threshold || "10");
      setTerms(data.receipt_terms ?? DEFAULT_RECEIPT_TERMS);
      setRefundWindow(data.refund_window_days || "");
    } catch (error) {
      console.error("Error fetching settings:", error);
      toast.error("Couldn't load settings — check your connection and try again.");
    }
  };

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleSaveRefundWindow = async () => {
    setSavingRefundWindow(true);
    try {
      // "" (unlimited) is a valid value here, unlike threshold's fallback-to-10 — an empty
      // refund window is a deliberate policy choice (no age restriction), not a missing one.
      await updateSetting("refund_window_days", refundWindow === "" ? "" : Number(refundWindow) || "");
      setSettings((prev) => ({ ...prev, refund_window_days: refundWindow }));
      toast.success(t("settings.refundWindowUpdated"));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingRefundWindow(false);
    }
  };

  const handleSaveTerms = async () => {
    setSavingTerms(true);
    try {
      await updateSetting("receipt_terms", terms);
      setSettings((prev) => ({ ...prev, receipt_terms: terms }));
      toast.success("Receipt terms updated");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingTerms(false);
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

        <div className="rounded-2xl border border-surface-border bg-white-A700 p-6 shadow-card dark:border-gray-800 dark:bg-gray-800">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-gray-700">
              <HiOutlineReceiptRefund className="text-xl text-primary-600 dark:text-primary-400" />
            </div>
            <div className="flex-1">
              <h2 className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
                {t("settings.refundWindowTitle")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("settings.refundWindowDesc")}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  value={refundWindow}
                  onChange={(e) => setRefundWindow(e.target.value)}
                  placeholder={t("settings.refundWindowUnlimited")}
                  className="h-10 w-32 rounded-lg border border-surface-border bg-white-A700 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={handleSaveRefundWindow}
                  disabled={savingRefundWindow}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700 disabled:opacity-50"
                >
                  {savingRefundWindow ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>

        <PrinterCard />

        <UsersCard />

        <div className="rounded-2xl border border-surface-border bg-white-A700 p-6 shadow-card dark:border-gray-800 dark:bg-gray-800">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-gray-700">
              <HiOutlineDocumentText className="text-xl text-primary-600 dark:text-primary-400" />
            </div>
            <div className="flex-1">
              <h2 className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
                {t("settings.receiptTermsTitle")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("settings.receiptTermsDesc")}
              </p>
              <div className="mt-3 flex flex-col gap-3">
                <textarea
                  rows={4}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="e.g. No purchased item will be returned or exchanged."
                  className="w-full resize-y rounded-lg border border-surface-border bg-white-A700 p-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={handleSaveTerms}
                  disabled={savingTerms}
                  className="self-start rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700 disabled:opacity-50"
                >
                  {savingTerms ? t("common.saving") : t("common.save")}
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
