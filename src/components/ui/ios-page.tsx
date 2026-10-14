import { useEffect, type ReactNode } from "react";
import { IosPageContext } from "@/components/ui/ios-page-context";

/**
 * Turns the iOS-style theme on for everything inside. Besides the context it sets `data-ios-page` on <body>, which
 * is what the few CSS rules in globals.css (tables, plain selects, page titles) hang off - and which is also an
 * ancestor of dialogs, because they portal to <body>.
 */
export function IosPage({ active, children }: { active: boolean; children: ReactNode }) {
  useEffect(() => {
    if (!active) return;
    document.body.setAttribute("data-ios-page", "");
    return () => document.body.removeAttribute("data-ios-page");
  }, [active]);

  return <IosPageContext.Provider value={active}>{children}</IosPageContext.Provider>;
}
