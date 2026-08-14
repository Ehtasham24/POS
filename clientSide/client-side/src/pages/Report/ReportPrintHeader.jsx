import { useEffect, useState } from "react";
import { apiGet } from "utils/api";
import * as offlineCache from "offline/cache";
import { useLanguage } from "i18n/LanguageContext";

// Only rendered on paper (hidden on screen) — a proper letterhead so a printed report
// looks like it came from a real business, not a browser tab. Reuses the exact company
// settings (logo/name/NTN/address/phone) already used for thermal receipts
// (utils/printReceipt.js), so the two never disagree.
export default function ReportPrintHeader({ startDate, endDate, filterType }) {
  const { t } = useLanguage();
  const [company, setCompany] = useState({});

  useEffect(() => {
    offlineCache
      .withFallback(() => apiGet("/api/settings"), offlineCache.getSettings)
      .then(setCompany)
      .catch((error) => console.error("Error fetching company settings for report print:", error));
  }, []);

  const filterLabel =
    filterType === "profit"
      ? t("report.profitableProducts")
      : filterType === "loss"
      ? t("report.lossProducts")
      : t("report.allProducts");

  const formatDisplay = (value) => (value ? new Date(value).toLocaleString() : "—");

  return (
    <div className="hidden print:block mb-6 border-b-2 border-gray-800 pb-4">
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-3">
          {company.company_logo && (
            <img src={company.company_logo} alt="" className="h-16 w-16 shrink-0 object-contain" />
          )}
          <div>
            <p className="text-xl font-bold text-black">{company.company_name || "Company Name"}</p>
            <div className="mt-0.5 space-y-0.5 text-xs text-gray-700">
              {company.company_ntn && <p>NTN: {company.company_ntn}</p>}
              {company.company_address && <p>{company.company_address}</p>}
              {company.company_phone && <p>{company.company_phone}</p>}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold text-black">{t("report.title")}</p>
          <p className="mt-1 text-xs text-gray-700">
            {t("report.period")}: {formatDisplay(startDate)} &ndash; {formatDisplay(endDate)}
          </p>
          <p className="text-xs text-gray-700">
            {t("report.filterLabel")}: {filterLabel}
          </p>
          <p className="mt-1 text-[11px] text-gray-500">
            {t("report.generatedOn")} {new Date().toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
