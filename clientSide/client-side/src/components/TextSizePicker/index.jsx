import { useEffect, useState } from "react";
import { useLanguage } from "i18n/LanguageContext";
import { TEXT_SIZES, TEXT_SIZE_EVENT, getTextSize, setTextSize } from "utils/textSize";

// The five text sizes as one row of buttons (utils/textSize.js). Used in Settings and in the
// account menu — Settings is for owners only, and cashiers need to change it too. Stays in step
// with the other copy on screen through TEXT_SIZE_EVENT.
export default function TextSizePicker({ compact = false }) {
  const { t } = useLanguage();
  const [current, setCurrent] = useState(getTextSize);

  useEffect(() => {
    const onChange = (e) => setCurrent(e.detail);
    window.addEventListener(TEXT_SIZE_EVENT, onChange);
    return () => window.removeEventListener(TEXT_SIZE_EVENT, onChange);
  }, []);

  return (
    <div role="group" aria-label={t("settings.textSizeTitle")} className="flex w-full gap-1 rounded-xl bg-surface-muted p-1 dark:bg-gray-900">
      {TEXT_SIZES.map((size, index) => {
        const active = size.key === current;
        return (
          <button
            key={size.key}
            type="button"
            aria-pressed={active}
            aria-label={t(`settings.textSize_${size.key}`)}
            title={t(`settings.textSize_${size.key}`)}
            onClick={() => setTextSize(size.key)}
            className={`flex flex-1 items-center justify-center rounded-lg font-semibold transition-colors ${
              compact ? "h-8" : "h-11"
            } ${
              active
                ? "bg-primary-600 text-white-A700 shadow-sm"
                : "text-gray-600 hover:bg-white-A700 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            {/* Each label drawn a little bigger than the last, so the row reads as a scale. */}
            <span style={{ fontSize: `${11 + index * 2}px` }}>{size.label}</span>
          </button>
        );
      })}
    </div>
  );
}
