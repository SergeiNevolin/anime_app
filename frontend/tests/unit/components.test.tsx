import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnimeCard } from "@/components/anime/anime-card";
import { AnimeList } from "@/components/anime/anime-list";
import { AnimeHeader } from "@/components/anime/anime-header";
import { LibraryEntryRow } from "@/components/library/library-entry-row";
import { ContinueWatchingList } from "@/components/library/continue-watching-list";
import { PlaybackSelectors } from "@/components/player/playback-selectors";
import { VideoPlayer } from "@/components/player/video-player";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SelectField } from "@/components/ui/select-field";
import type {
  AnimeDetails,
  AnimeEpisode,
  AnimeSummary,
  EpisodeSource,
  LibraryItem,
  PlaybackOption,
} from "@/lib/api/types";

const summary: AnimeSummary = {
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
} as AnimeSummary;

const details = {
  ...summary,
  description: "Описание аниме",
  dubbing_teams: ["AniLibria"],
  available_providers: ["aniliberty"],
} as AnimeDetails;

const episode: AnimeEpisode = {
  provider: "aniliberty",
  anime_external_id: "8443",
  external_id: "ep-1",
  number: 1,
  title: "Первый эпизод",
  is_available: true,
  id: "episode-id-1",
} as AnimeEpisode;

const source: EpisodeSource = {
  provider: "aniliberty",
  key: "source-1",
  title: "Озвучка AniLibria",
  player: "kodik",
  external_url: "https://example.org/player",
  official_url: "https://example.org/anime",
} as EpisodeSource;

const option: PlaybackOption = {
  provider: "aniliberty",
  source_key: "source-1",
  source_title: "Озвучка AniLibria",
  kind: "hls",
  quality: 720,
  url: "https://example.org/master.m3u8",
  headers: {},
  official_url: null,
} as PlaybackOption;

describe("AnimeCard", () => {
  it("shows the title, the year and the number of episodes", () => {
    render(<AnimeCard anime={summary} />);

    expect(screen.getByText("Ковбой Бибоп")).toBeInTheDocument();
    expect(screen.getByText("Cowboy Bebop")).toBeInTheDocument();
    expect(screen.getByText("1998")).toBeInTheDocument();
    expect(screen.getByText("26 эп.")).toBeInTheDocument();
  });

  it("links to the catalogue entry", () => {
    render(<AnimeCard anime={summary} />);

    expect(screen.getByTestId("anime-card")).toHaveAttribute(
      "href",
      "/anime/uuid-1",
    );
  });
});

describe("AnimeList", () => {
  it("renders every item", () => {
    render(<AnimeList items={[summary, { ...summary, title: "Второе" }]} />);

    expect(screen.getAllByTestId("anime-card")).toHaveLength(2);
  });
});

describe("AnimeHeader", () => {
  it("shows the titles, the facts and the description", () => {
    render(
      <AnimeHeader anime={details} expanded={false} onToggleExpand={() => {}} />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Ковбой Бибоп" }),
    ).toBeInTheDocument();    expect(screen.getByText("Озвучка: AniLibria")).toBeInTheDocument();
    expect(screen.getByText("Комедия")).toBeInTheDocument();
    expect(screen.getByText(/Описание аниме/)).toBeInTheDocument();
  });

  it("truncates the description until it is expanded", () => {
    const long = { ...details, description: "а".repeat(500) };
    render(<AnimeHeader anime={long} expanded={false} onToggleExpand={() => {}} />);

    expect(screen.getByRole("button", { name: "Читать полностью" })).toBeInTheDocument();
  });
});

describe("SelectField", () => {
  it("reports the selected value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <SelectField
        label="Серия"
        value="1"
        onChange={onChange}
        options={[
          { value: "1", label: "Эпизод 1" },
          { value: "2", label: "Эпизод 2" },
        ]}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Серия"), "2");

    expect(onChange).toHaveBeenCalledWith("2");
  });
});

describe("PlaybackSelectors", () => {
  it("hides the dubbing selector when there is a single source", () => {
    render(
      <PlaybackSelectors
        episodes={[episode]}
        sources={[source]}
        playbackOptions={[option]}
        selectedEpisodeId={episode.id}
        selectedSourceKey={source.key}
        selectedPlaybackIndex={0}
        onEpisodeChange={() => {}}
        onSourceChange={() => {}}
        onPlaybackChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("Серия")).toBeInTheDocument();
    expect(screen.queryByLabelText("Озвучка")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Качество")).not.toBeInTheDocument();
  });

  it("shows the dubbing and the quality selectors when they are needed", () => {
    render(
      <PlaybackSelectors
        episodes={[episode]}
        sources={[source, { ...source, key: "source-2", title: "Озвучка 2" }]}
        playbackOptions={[option, { ...option, quality: 1080 }]}
        selectedEpisodeId={episode.id}
        selectedSourceKey={source.key}
        selectedPlaybackIndex={0}
        onEpisodeChange={() => {}}
        onSourceChange={() => {}}
        onPlaybackChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("Озвучка")).toBeInTheDocument();
    expect(screen.getByLabelText("Качество")).toBeInTheDocument();
  });
});

describe("LibraryEntryRow", () => {
  const entry: LibraryItem = {
    id: "lib-1",
    user_id: "user-1",
    anime_id: "uuid-1",
    status: "watching",
    progress_episode: 3,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    anime: summary,
  } as LibraryItem;

  it("shows the status and the progress", () => {
    render(
      <LibraryEntryRow
        entry={entry}
        onStatusChange={() => {}}
        onProgressChange={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByLabelText("Статус просмотра")).toHaveValue("watching");
    expect(screen.getByLabelText("Прогресс просмотра")).toHaveValue(3);
  });

  it("reports a status change", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();

    render(
      <LibraryEntryRow
        entry={entry}
        onStatusChange={onStatusChange}
        onProgressChange={() => {}}
        onRemove={() => {}}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText("Статус просмотра"),
      "completed",
    );

    expect(onStatusChange).toHaveBeenCalledWith("completed");
  });

  it("reports the removal", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(
      <LibraryEntryRow
        entry={entry}
        onStatusChange={() => {}}
        onProgressChange={() => {}}
        onRemove={onRemove}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Удалить" }));

    expect(onRemove).toHaveBeenCalled();
  });
});

describe("ContinueWatchingList", () => {
  it("shows a message when nothing was watched", () => {
    render(<ContinueWatchingList items={[]} />);

    expect(screen.getByText(/начали смотреть/)).toBeInTheDocument();
  });

  it("lists the titles in progress", () => {
    render(
      <ContinueWatchingList
        items={[
          {
            id: "lib-1",
            user_id: "user-1",
            anime_id: "uuid-1",
            status: "watching",
            progress_episode: 3,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            anime: summary,
          } as LibraryItem,
        ]}
      />,
    );

    expect(screen.getByTestId("continue-list")).toBeInTheDocument();
    expect(screen.getByText("Ковбой Бибоп")).toBeInTheDocument();
  });
});

describe("VideoPlayer", () => {
  it("expands the player over the whole viewport", async () => {
    const user = userEvent.setup();
    render(<VideoPlayer src="https://example.org/video.mp4" />);

    const stage = screen.getByTestId("video-stage");
    expect(stage).toHaveAttribute("data-fullscreen", "false");

    await user.click(screen.getByRole("button", { name: "На весь экран" }));

    expect(stage).toHaveAttribute("data-fullscreen", "true");
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(
      screen.getByRole("button", { name: "Выйти из полноэкранного режима" }),
    );

    expect(stage).toHaveAttribute("data-fullscreen", "false");
    expect(document.body.style.overflow).toBe("");
  });

  it("leaves the fullscreen mode on Escape", async () => {
    const user = userEvent.setup();
    render(<VideoPlayer src="https://example.org/video.mp4" />);

    await user.click(screen.getByRole("button", { name: "На весь экран" }));
    expect(screen.getByTestId("video-stage")).toHaveAttribute(
      "data-fullscreen",
      "true",
    );

    await user.keyboard("{Escape}");

    expect(screen.getByTestId("video-stage")).toHaveAttribute(
      "data-fullscreen",
      "false",
    );
  });
});

describe("states", () => {
  it("renders the empty state", () => {
    render(<EmptyState title="Пусто" description="Ничего нет" />);

    expect(screen.getByText("Пусто")).toBeInTheDocument();
    expect(screen.getByText("Ничего нет")).toBeInTheDocument();
  });

  it("renders the error state and retries", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(<ErrorState title="Ошибка" onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "Повторить" }));

    expect(onRetry).toHaveBeenCalled();
  });

  it("renders a badge", () => {
    render(<Badge tone="accent">Новое</Badge>);

    expect(screen.getByText("Новое")).toBeInTheDocument();
  });
});
