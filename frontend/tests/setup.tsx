import "@testing-library/jest-dom";
import { vi } from "vitest";
import type { ReactNode } from "react";

import { navigationState } from "./helpers/navigation";

/**
 * The Next.js runtime is not available in jsdom, so the few components that
 * depend on it are replaced by simple stand-ins.
 */

vi.mock("next/image", () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    quality: _quality,
    sizes: _sizes,
    ...rest
  }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...rest} alt={String(rest.alt ?? "")} />
  ),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navigationState.push,
    replace: navigationState.replace,
    back: navigationState.back,
  }),
  usePathname: () => navigationState.pathname,
  useParams: () => navigationState.params,
  useSearchParams: () => navigationState.searchParams,
}));
