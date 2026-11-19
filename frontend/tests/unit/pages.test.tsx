import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  useAnimeSearch: vi.fn(),
  useContinueWatching: vi.fn(),
  useLibrary: vi.fn(),
  useLibraryEntry: vi.fn(),
  useCurrentUser: vi.fn(),
  updateLibraryEntry: vi.fn(),
  removeFromLibrary: vi.fn(),
  useProviders: vi.fn(),
}));

vi.mock("@/features/search/hooks", () => ({
  useAnimeSearch: mocks.useAnimeSearch,
  useProviders: mocks.useProviders,
}));

vi.mock("@/features/library/hooks", () => ({
  useContinueWatching: mocks.useContinueWatching,
  useLibrary: mocks.useLibrary,
  useLibraryEntry: mocks.useLibraryEntry,
  useAddToLibrary: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateLibraryEntry: () => ({
    mutateAsync: mocks.updateLibraryEntry,
    isPending: false,
  }),
  useRemoveFromLibrary: () => ({
    mutateAsync: mocks.removeFromLibrary,
    isPending: false,
  }),
}));

vi.mock("@/features/auth/hooks", () => ({
  GUEST_TELEGRAM_ID: 0,
  useCurrentUser: mocks.useCurrentUser,
}));

import HomePage from "@/app/page";
import LibraryPage from "@/app/library/page";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const summary = {
  provider: "aniliberty",
  external_id: "8443",
  title: "Ковбой Бибоп",
  original_title: "Cowboy Bebop",
  poster_url: "https://example.org/poster.jpg",
  year: 1998,
  genres: [{ name: "Комедия" }],
  total_episodes: 26,
  release_status: "completed",
  external_url: null,
  description: null,
  dubbing_teams: [],
  alternative_titles: [],
  alternative_title: null,
  anime_id: "uuid-1",
};

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAnimeSearch.mockReturnValue({
      data: { items: [], page: 1, pageSize: 20, total: 0, hasMore: false },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.useContinueWatching.mockReturnValue({
      data: [],
      isPending: false,
    });
    mocks.useProviders.mockReturnValue({
      data: [],
      isPending: false,
    });
  });

  it("shows the search field and the continue watching section", () => {
    render(<HomePage />, { wrapper: createWrapper() });

    expect(
      screen.getByRole("heading", { name: "Продолжить просмотр" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Название аниме")).toBeInTheDocument();
  });

  it("shows the results of the search", async () => {
    const user = userEvent.setup();
    mocks.useAnimeSearch.mockReturnValue({
      data: { items: [summary], page: 1, pageSize: 20, total: 1, hasMore: false },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<HomePage />, { wrapper: createWrapper() });

    await user.type(screen.getByLabelText("Название аниме"), "bebop");

    await waitFor(
      () =>
        expect(
          screen.getByRole("heading", { name: /Результаты поиска/ }),
        ).toBeInTheDocument(),
      { timeout: 2000 },
    );
    expect(screen.getByText("Ковбой Бибоп")).toBeInTheDocument();
  });

  it("reports an error of the search", async () => {
    const user = userEvent.setup();
    mocks.useAnimeSearch.mockReturnValue({
      data: { items: [], page: 1, pageSize: 20, total: 0, hasMore: false },
      isPending: false,
      isError: true,
      error: new Error("boom"),
      refetch: vi.fn(),
    });

    render(<HomePage />, { wrapper: createWrapper() });

    await user.type(screen.getByLabelText("Название аниме"), "bebop");

    await waitFor(
      () => expect(screen.getByText("Ошибка поиска")).toBeInTheDocument(),
      { timeout: 2000 },
    );
  });
});

describe("LibraryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useCurrentUser.mockReturnValue({ data: { id: "user-1" } });
    mocks.useContinueWatching.mockReturnValue({
      data: [],
      isPending: false,
    });
    mocks.useLibrary.mockReturnValue({
      data: { items: [], page: 1, pageSize: 20, total: 0, hasMore: false },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("shows the filters and the empty state", () => {
    render(<LibraryPage />, { wrapper: createWrapper() });

    expect(screen.getByRole("tab", { name: "Все" })).toBeInTheDocument();
    expect(screen.getByText("Библиотека пуста")).toBeInTheDocument();
  });

  it("lists the entries of the library", () => {
    mocks.useLibrary.mockReturnValue({
      data: {
        items: [
          {
            id: "lib-1",
            user_id: "user-1",
            anime_id: "uuid-1",
            status: "watching",
            progress_episode: 3,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            anime: summary,
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
        hasMore: false,
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<LibraryPage />, { wrapper: createWrapper() });

    expect(screen.getByTestId("library-list")).toBeInTheDocument();
    expect(screen.getByText("Ковбой Бибоп")).toBeInTheDocument();
  });

  it("reports an error of the request", () => {
    mocks.useLibrary.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error("boom"),
      refetch: vi.fn(),
    });

    render(<LibraryPage />, { wrapper: createWrapper() });

    expect(screen.getByText("Ошибка загрузки")).toBeInTheDocument();
  });

  it("filters the library by status", async () => {
    const user = userEvent.setup();
    render(<LibraryPage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("tab", { name: "Смотрю" }));

    expect(mocks.useLibrary).toHaveBeenCalledWith(
      "watching",
      expect.objectContaining({ page: 1 }),
    );
  });

  it("updates the status of an entry", async () => {
    const user = userEvent.setup();
    mocks.useLibrary.mockReturnValue({
      data: {
        items: [
          {
            id: "lib-1",
            user_id: "user-1",
            anime_id: "uuid-1",
            status: "watching",
            progress_episode: 3,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            anime: summary,
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
        hasMore: false,
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<LibraryPage />, { wrapper: createWrapper() });

    await user.selectOptions(
      screen.getByLabelText("Статус просмотра"),
      "completed",
    );

    expect(mocks.updateLibraryEntry).toHaveBeenCalledWith(
      expect.objectContaining({ animeId: "uuid-1", status: "completed" }),
    );
  });

  it("removes an entry from the library", async () => {
    const user = userEvent.setup();
    mocks.useLibrary.mockReturnValue({
      data: {
        items: [
          {
            id: "lib-1",
            user_id: "user-1",
            anime_id: "uuid-1",
            status: "watching",
            progress_episode: 3,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            anime: summary,
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
        hasMore: false,
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<LibraryPage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: "Удалить" }));

    expect(mocks.removeFromLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ animeId: "uuid-1" }),
    );
  });

  it("loads the next page", async () => {
    const user = userEvent.setup();
    mocks.useLibrary.mockReturnValue({
      data: {
        items: [
          {
            id: "lib-1",
            user_id: "user-1",
            anime_id: "uuid-1",
            status: "watching",
            progress_episode: 3,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            anime: summary,
          },
        ],
        page: 1,
        pageSize: 20,
        total: 40,
        hasMore: true,
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<LibraryPage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: "Загрузить ещё" }));

    expect(mocks.useLibrary).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ page: 2 }),
    );
  });
});
