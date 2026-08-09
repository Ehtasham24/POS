import React from "react";
import { Link } from "react-router-dom";
import { HiOutlineExclamationCircle } from "react-icons/hi";
import AppShell from "components/AppShell";
import { useLanguage } from "i18n/LanguageContext";

const NotFound = () => {
  const { t } = useLanguage();
  return (
    <AppShell title={t("notFound.title")}>
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <HiOutlineExclamationCircle className="text-6xl text-primary-500" />
        <h2 className="font-poppins text-2xl font-bold text-gray-800 dark:text-gray-100">
          {t("notFound.title")}
        </h2>
        <p className="max-w-md text-gray-500 dark:text-gray-400">{t("notFound.desc")}</p>
        <Link
          to="/"
          className="mt-4 inline-flex items-center justify-center bg-primary-600 hover:bg-primary-700 text-white-A700 font-medium rounded-lg text-sm px-6 py-2.5 transition-colors"
        >
          {t("notFound.backHome")}
        </Link>
      </div>
    </AppShell>
  );
};

export default NotFound;
