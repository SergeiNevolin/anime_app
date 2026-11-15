import { vi } from "vitest";

/**
 * The state of the mocked Next.js router.
 *
 * It lives in its own module so that the setup file and the tests share the
 * very same instance.
 */
export const navigationState = {
  pathname: "/",
  params: {} as Record<string, string>,
  searchParams: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
};

/** Set the state of the router. */
export function setNavigationState(next: Partial<typeof navigationState>) {
  Object.assign(navigationState, next);
}

/** Reset the state of the router between the tests. */
export function resetNavigationState() {
  navigationState.pathname = "/";
  navigationState.params = {};
  navigationState.searchParams = new URLSearchParams();
  navigationState.push.mockReset();
  navigationState.replace.mockReset();
  navigationState.back.mockReset();
}
