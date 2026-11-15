import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  useAnimeWorkspace: vi.fn(),
}));

vi.mock("@/features/anime/use-anime-workspace", () => ({
  useAnimeWorkspace: mocks.useAnimeWorkspace,
}));

import { AnimePageContent } from "@/app/anime/[id]/anime-page-content";
import RootLayout from "@/app/layout";
import { resetNavigationState, setNavigationState } from "../helpers/navigation";

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

const anime = {
  provider: "aniliberty",
  external_id: "8443",
  title: "Ковбой Бибоп",
  original_title: "Cowboy Bebop",
  poster_url: "https://example.org/poster.jpg",
  year: 1998,
  genres: [{ name: "Комедия" }],
  total_episodes: 2,
  release_status: "completed",
  external_url: null,
  description: "Описание",
  dubbing_teams: ["AniLibria"],
  alternative_titles: [],
  alternative_title: null,
  anime_id: "uuid-1",
  available_providers: ["aniliberty"],
};

function workspace(overrides: Record<string, unknown> = {}) {
  return {
    anime,
    isPending: false,
    error: null,
    episodes: [
      {
        id: "ep-1",
        number: 1,
        title: "Первый",
        is_available: true,
        provider: "aniliberty",
        anime_external_id: "8443",
        external_id: "ep-1",
      },
    ],
    libraryEntry: null,
    libraryStatus: "plan_to_watch" as const,
    isInLibrary: false,
    selectedEpisodeId: "ep-1",
    selectedSourceKey: "source-1",
    selectedPlaybackIndex: 0,
    sources: [],
    playbackOptions: [],
    currentEpisode: {
      id: "ep-1",
      number: 1,
      title: "Первый",
      is_available: true,
      provider: "aniliberty",
      anime_external_id: "8443",
      external_id: "ep-1",
    },
    currentOption: null,
    expanded: false,
    isMutating: false,
    toggleExpanded: vi.fn(),
    selectEpisode: vi.fn(),
    selectSource: vi.fn(),
    selectPlayback: vi.fn(),
    changeStatus: vi.fn(),
    changeProgress: vi.fn(),
    addToLibrary: vi.fn(),
    ...overrides,
  };
}

describe("AnimePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNavigationState();
    setNavigationState({ params: { id: "uuid-1" } });
    mocks.useAnimeWorkspace.mockReturnValue(workspace());
  });

  it("shows the card of the anime", async () => {
    render(<AnimePageContent animeId="uuid-1" />, { wrapper: createWrapper() });

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 2, name: "Ковбой Бибоп" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Описание")).toBeInTheDocument();
  });

  it("shows the skeleton while the card is loading", () => {
    mocks.useAnimeWorkspace.mockReturnValue(workspace({ isPending: true }));

    render(<AnimePageContent animeId="uuid-1" />, { wrapper: createWrapper() });

    expect(screen.getByText("Загрузка…")).toBeInTheDocument();
  });

  it("reports an error of the request", () => {
    mocks.useAnimeWorkspace.mockReturnValue(
      workspace({ error: new Error("boom"), anime: null }),
    );

    render(<AnimePageContent animeId="uuid-1" />, { wrapper: createWrapper() });

    expect(screen.getByText("Не удалось загрузить карточку")).toBeInTheDocument();
  });

  it("offers the player when a stream is resolved", () => {
    mocks.useAnimeWorkspace.mockReturnValue(
      workspace({
        currentOption: {
          provider: "aniliberty",
          source_key: "source-1",
          source_title: "Озвучка",
          kind: "hls",
          quality: 720,
          url: "https://example.org/master.m3u8",
          headers: {},
          official_url: null,
        },
      }),
    );

    render(<AnimePageContent animeId="uuid-1" />, { wrapper: createWrapper() });

    expect(screen.getByTestId("video-player")).toBeInTheDocument();
  });

  it("asks to select an episode when there is none", () => {
    mocks.useAnimeWorkspace.mockReturnValue(
      workspace({ currentEpisode: null, currentOption: null }),
    );

    render(<AnimePageContent animeId="uuid-1" />, { wrapper: createWrapper() });

    expect(screen.getByText(/Выберите серию/)).toBeInTheDocument();
  });

  it("adds the anime to the library", async () => {
    const user = userEvent.setup();
    const addToLibrary = vi.fn();
    mocks.useAnimeWorkspace.mockReturnValue(workspace({ addToLibrary }));

    render(<AnimePageContent animeId="uuid-1" />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: "В библиотеку" }));

    expect(addToLibrary).toHaveBeenCalled();
  });

  it("shows the library controls when the anime is in the library", () => {
    mocks.useAnimeWorkspace.mockReturnValue(
      workspace({
        isInLibrary: true,
        libraryStatus: "watching",
        libraryEntry: {
          id: "lib-1",
          user_id: "user-1",
          anime_id: "uuid-1",
          status: "watching",
          progress_episode: 3,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          anime,
        },
      }),
    );

    render(<AnimePageContent animeId="uuid-1" />, { wrapper: createWrapper() });

    expect(screen.getByText("3 / 2")).toBeInTheDocument();
  });
});

describe("RootLayout", () => {
  it("renders the application frame", () => {
    render(
      <RootLayout>
        <p>Контент</p>
      </RootLayout>,
    );

    expect(screen.getByText("Контент")).toBeInTheDocument();
  });
});
