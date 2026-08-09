import React, { useEffect, useRef, useState } from "react";
import { HiOutlineBuildingOffice2, HiOutlinePhoto, HiOutlineTrash } from "react-icons/hi2";
import AppShell from "components/AppShell";
import { Skeleton } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { apiGet, apiPut } from "utils/api";

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
};

export default function CompanyPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const [form, setForm] = useState(null);
  const [logo, setLogo] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const fetchSettings = async () => {
    try {
      const data = await apiGet("/api/settings");
      setForm({
        company_name: data.company_name || "",
        company_ntn: data.company_ntn || "",
        company_phone: data.company_phone || "",
        company_address: data.company_address || "",
      });
      setLogo(data.company_logo || "");
    } catch (error) {
      console.error("Error fetching company settings:", error);
      toast.error("Couldn't load company details — check your connection and try again.");
      setForm(emptyForm);
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

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="mt-2 w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700 disabled:opacity-50 sm:w-auto sm:self-start sm:px-6"
                >
                  {saving ? t("common.saving") : t("company.saveChanges")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
