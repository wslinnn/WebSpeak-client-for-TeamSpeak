import type { ReactNode } from "react";

import { I18nContext, useLanguageState } from "@/hooks/use-i18n";

export function I18nProvider({ children }: { children: ReactNode }) {
  const value = useLanguageState();
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
