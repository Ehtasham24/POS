import React, { useEffect, useRef, useState } from "react";
import { HiOutlineBuildingOffice2, HiOutlinePhoto, HiOutlineTrash, HiOutlineBanknotes } from "react-icons/hi2";
import AppShell from "components/AppShell";
import { Skeleton } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { apiGet, apiPut } from "utils/api";
import { PAKISTAN_BANKS, ALL_PAKISTAN_BANK_NAMES } from "constants/pakistanBanks";

const inputClass =
  "h-10 w-full rounded-lg border border-surface-border bg-white-A700 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";
const labelClass = "mb-1 block text-sm font-semibold text-gray-800 dark:text-gray-100";

// Logos are stored as a base64 data URI in the generic settings table (same key/value
// store Settings uses) — no file storage/upload endpoint needed. Kept small on purpose:
// the server's JSON body limit is 2mb and this is what actually prints on the receipt.
const MAX_LOGO_BYTES = 800 * 1024;

const updateSetting = (key, value) => apiPut("/api/settings", { key, value });

const emptyForm = {
  company_name: "",
  company_ntn: "",
  company_phone: "",
  company_address: "",
  bank_name: "",
  bank_account_title: "",
  bank_account_number: "",
  bank_iban: "",
};

export default function CompanyPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const [form, setForm] = useState(null);
  const [logo, setLogo] = useState("");
  const [saving, setSaving] = useState(false);
  // Separate from form.bank_name's own value — tracks whether the "Other" text input
  // should be showing, independent of whether that input is currently empty or has
  // something typed in it. Keying this off form.bank_name === "" instead (i.e. treating
  // "empty" and "explicitly chose Other" as the same state) would make picking "Other"
  // immediately snap back to the placeholder the moment its text field is cleared.
  const [customBankMode, setCustomBankMode] = useState(false);
  const fileInputRef = useRef(null);

  const fetchSettings = async () => {
    try {
      const data = await apiGet("/api/settings");
      const bankName = data.bank_name || "";
      setForm({
        company_name: data.company_name || "",
        company_ntn: data.company_ntn || "",
        company_phone: data.company_phone || "",
        company_address: data.company_address || "",
        bank_name: bankName,
        bank_account_title: data.bank_account_title || "",
        bank_account_number: data.bank_account_number || "",
        bank_iban: data.bank_iban || "",
      });
      // A previously-saved bank name that isn't in the current PAKISTAN_BANKS list (typed
      // in before this dropdown existed, or just not one of the ones listed) should still
      // show correctly as "Other" with its real value, not silently fall back to blank.
      setCustomBankMode(bankName !== "" && !ALL_PAKISTAN_BANK_NAMES.includes(bankName));
      setLogo(data.company_logo || "");
    } catch (error) {
      console.error("Error fetching company settings:", error);
      toast.error("Couldn't load company details — check your connection and try again.");
      setForm(emptyForm);
    }
  };

  const handleBankSelect = (e) => {
    const value = e.target.value;
    if (value === "__other__") {
      setCustomBankMode(true);
      setForm((prev) => ({ ...prev, bank_name: "" }));
    } else {
      setCustomBankMode(false);
      setForm((prev) => ({ ...prev, bank_name: value }));
    }
  };

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogoPick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(`Logo is too large — keep it under ${Math.round(MAX_LOGO_BYTES / 1024)}KB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        ...Object.entries(form).map(([key, value]) => updateSetting(key, value)),
        updateSetting("company_logo", logo),
      ]);
      toast.success("Company details saved");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (!form) {
    return (
      <AppShell title={t("company.title")}>
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <div className="rounded-2xl border border-surface-border bg-white-A700 p-6 shadow-card dark:border-gray-800 dark:bg-gray-800">
            <div className="flex items-start gap-4">
              <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-2/3" />
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t("company.title")}>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="rounded-2xl border border-surface-border bg-white-A700 p-6 shadow-card dark:border-gray-800 dark:bg-gray-800">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-gray-700">
              <HiOutlineBuildingOffice2 className="text-xl text-primary-600 dark:text-primary-400" />
            </div>
            <div className="flex-1">
              <h2 className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
                {t("company.detailsTitle")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("company.detailsDesc")}</p>

              <div className="mt-4 flex flex-col gap-4">
                <div>
                  <label htmlFor="company_name" className={labelClass}>
                    {t("company.companyName")}
                  </label>
                  <input
                    type="text"
                    id="company_name"
                    name="company_name"
                    value={form.company_name}
                    onChange={handleChange}
                    placeholder="e.g. Pak Home and Kitchen Appliances"
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-1">
                  <div>
                    <label htmlFor="company_ntn" className={labelClass}>
                      {t("company.ntnNumber")}
                    </label>
                    <input
                      type="text"
                      id="company_ntn"
                      name="company_ntn"
                      value={form.company_ntn}
                      onChange={handleChange}
                      placeholder={t("company.optional")}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="company_phone" className={labelClass}>
                      {t("company.phone")}
                    </label>
                    <input
                      type="text"
                      id="company_phone"
                      name="company_phone"
                      value={form.company_phone}
                      onChange={handleChange}
                      placeholder={t("company.optional")}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="company_address" className={labelClass}>
                    {t("company.address")}
                  </label>
                  <input
                    type="text"
                    id="company_address"
                    name="company_address"
                    value={form.company_address}
                    onChange={handleChange}
                    placeholder={t("company.optional")}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>{t("company.logo")}</label>
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-surface-border bg-surface-subtle dark:border-gray-700 dark:bg-gray-900">
                      {logo ? (
                        <img src={logo} alt="Company logo" className="h-full w-full object-contain" />
                      ) : (
                        <HiOutlinePhoto className="text-2xl text-gray-400" />
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoPick}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg border border-surface-border px-3.5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-surface-subtle dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      {logo ? t("company.change") : t("company.upload")}
                    </button>
                    {logo && (
                      <button
                        type="button"
                        onClick={() => setLogo("")}
                        aria-label="Remove logo"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-danger-600 transition-colors hover:bg-danger-50 dark:hover:bg-danger-500/10"
                      >
                        <HiOutlineTrash />
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* Bank details — a separate card from the receipt/branding fields above since
            this one feeds the QR-checkout flow (CartPanel.jsx's Bank Transfer option),
            not the receipt header. Same generic-settings save mechanism either way —
            these are plain, non-secret values (see bankPaymentService.js's comment on
            why they're fine in the ordinary settings table, unlike a future Gmail token). */}
        <div className="rounded-2xl border border-surface-border bg-white-A700 p-6 shadow-card dark:border-gray-800 dark:bg-gray-800">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-gray-700">
              <HiOutlineBanknotes className="text-xl text-primary-600 dark:text-primary-400" />
            </div>
            <div className="flex-1">
              <h2 className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
                {t("company.bankDetailsTitle")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("company.bankDetailsDesc")}</p>

              <div className="mt-4 flex flex-col gap-4">
                <div>
                  <label htmlFor="bank_name" className={labelClass}>
                    {t("company.bankName")}
                  </label>
                  <select
                    id="bank_name"
                    value={customBankMode ? "__other__" : form.bank_name}
                    onChange={handleBankSelect}
                    className={inputClass}
                  >
                    <option value="">{t("company.selectBank")}</option>
                    {PAKISTAN_BANKS.map((group) => (
                      <optgroup key={group.group} label={group.group}>
                        {group.banks.map((bank) => (
                          <option key={bank} value={bank}>
                            {bank}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <option value="__other__">{t("company.otherBank")}</option>
                  </select>
                  {customBankMode && (
                    <input
                      type="text"
                      name="bank_name"
                      value={form.bank_name}
                      onChange={handleChange}
                      placeholder={t("company.otherBankPlaceholder")}
                      autoFocus
                      className={`${inputClass} mt-2`}
                    />
                  )}
                </div>
                <div>
                  <label htmlFor="bank_account_title" className={labelClass}>
                    {t("company.bankAccountTitle")}
                  </label>
                  <input
                    type="text"
                    id="bank_account_title"
                    name="bank_account_title"
                    value={form.bank_account_title}
                    onChange={handleChange}
                    className={inputClass}
                  />
                </div>
                <div>
                  {/* Required, not optional — the QR payload (utils/bankQr.js) is a real,
                      CRC-verified Raast payload with a slot only for the IBAN (tag 04);
                      createIntent rejects checkout with "Bank Transfer" selected until this
                      is filled in. */}
                  <label htmlFor="bank_iban" className={labelClass}>
                    {t("company.bankIban")}
                  </label>
                  <input
                    type="text"
                    id="bank_iban"
                    name="bank_iban"
                    value={form.bank_iban}
                    onChange={handleChange}
                    placeholder="PKxx XXXX XXXXXXXXXXXXXXXX"
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t("company.bankIbanHint")}
                  </p>
                </div>
                <div>
                  <label htmlFor="bank_account_number" className={labelClass}>
                    {t("company.bankAccountNumber")}
                  </label>
                  <input
                    type="text"
                    id="bank_account_number"
                    name="bank_account_number"
                    value={form.bank_account_number}
                    onChange={handleChange}
                    placeholder={t("company.optional")}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700 disabled:opacity-50 sm:w-auto sm:self-start sm:px-6"
        >
          {saving ? t("common.saving") : t("company.saveChanges")}
        </button>
      </div>
    </AppShell>
  );
}
