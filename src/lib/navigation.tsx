import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { useEffect, useState } from "react";

const NAVIGATION_EVENT = "lighthouse:navigation";

export function normalizePathname(pathname: string): string {
  const normalized = `/${pathname}`.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized.toLowerCase();
}

export function navigateTo(path: string, options: { replace?: boolean } = {}) {
  const destination = normalizePathname(path);
  const current = normalizePathname(window.location.pathname);

  if (destination !== current) {
    window.history[options.replace ? "replaceState" : "pushState"](null, "", destination);
  }

  window.dispatchEvent(new Event(NAVIGATION_EVENT));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function usePathname() {
  const [pathname, setPathname] = useState(() => normalizePathname(window.location.pathname));

  useEffect(() => {
    const updatePathname = () => setPathname(normalizePathname(window.location.pathname));
    window.addEventListener("popstate", updatePathname);
    window.addEventListener(NAVIGATION_EVENT, updatePathname);

    return () => {
      window.removeEventListener("popstate", updatePathname);
      window.removeEventListener(NAVIGATION_EVENT, updatePathname);
    };
  }, []);

  return pathname;
}

type AppLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  href: string;
};

export function AppLink({ children, href, onClick, ...props }: AppLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    navigateTo(href);
  };

  return <a href={href} onClick={handleClick} {...props}>{children}</a>;
}
