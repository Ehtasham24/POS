import { createContext, useContext, useEffect, useState, useCallback } from "react";
import translations from "./translations";
import { apiGet, apiPut } from "utils/api";

const LanguageContext = createContext({
  language: "en",
  setLanguage: () => {},
  t: (key) => key,
});

const getByPath = (obj, path) => path.split(".").reduce((acc, part) => acc?.[part], obj);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState("en");

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet("/api/settings");
        if (data.language === "ur" || data.language === "en") {
          setLanguageState(data.language);
        }
      } catch (error) {
        console.error("Error fetching language setting:", error);
      }
    })();
  }, []);

  const setLanguage = useCallback(async (lang) => {
    setLanguageState(lang);
    try {
      await apiPut("/api/settings", { key: "language", value: lang });
    } catch (error) {
      console.error("Error saving language setting:", error);
    }
  }, []);

  const t = useCallback(
    (key, vars) => {
      const template =
        getByPath(translations[language], key) ?? getByPath(translations.en, key) ?? key;
      if (!vars) return template;
      return Object.entries(vars).reduce(
        (str, [k, v]) => str.replace(`{${k}}`, v),
        template
      );
    },
    [language]
  );

  // Deliberately not flipping `dir` to rtl app-wide: Urdu script is bidi-detected and
  // renders correctly right-to-left within its own text runs regardless of container
  // direction, whereas forcing `dir="rtl"` on the whole tree would also mirror flexbox
  // row order, sidebar placement, icon positions etc. across a layout that was built
  // (and only ever tested) LTR — a much bigger, riskier change than "translate the text".
  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
