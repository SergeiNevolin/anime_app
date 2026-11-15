import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PlaybackSelectors } from "@/components/player/playback-selectors";
import { SelectField } from "@/components/ui/select-field";
import type {
  AnimeEpisode,
  EpisodeSource,
  PlaybackOption,
} from "@/lib/api/types";

const episode = {
  id: "ep-1",
  number: 1,
  title: "Первый",
  is_available: true,
} as AnimeEpisode;

const unavailableEpisode = {
  id: "ep-2",
  number: 2,
  title: null,
  is_available: false,
} as AnimeEpisode;

const source = {
  provider: "aniliberty",
  key: "source-1",
  title: "Озвучка 1",
  player: "kodik",
} as EpisodeSource;

const option = {
  provider: "aniliberty",
  source_key: "source-1",
  source_title: "Озвучка 1",
  kind: "hls",
  quality: 720,
  url: "https://example.org/720.m3u8",
  headers: {},
} as PlaybackOption;

describe("PlaybackSelectors", () => {
  it("reports the selected episode", async () => {
    const user = userEvent.setup();
    const onEpisodeChange = vi.fn();

    render(
      <PlaybackSelectors
        episodes={[episode, unavailableEpisode]}
        sources={[source]}
        playbackOptions={[option]}
        selectedEpisodeId={episode.id}
        selectedSourceKey={source.key}
        selectedPlaybackIndex={0}
        onEpisodeChange={onEpisodeChange}
        onSourceChange={() => {}}
        onPlaybackChange={() => {}}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Серия"), "ep-1");

    expect(onEpisodeChange).toHaveBeenCalledWith("ep-1");
  });

  it("marks an unavailable episode", () => {
    render(
      <PlaybackSelectors
        episodes={[episode, unavailableEpisode]}
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

    expect(screen.getByRole("option", { name: /недоступен/ })).toBeDisabled();
  });

  it("reports the selected source", async () => {
    const user = userEvent.setup();
    const onSourceChange = vi.fn();
    const second = { ...source, key: "source-2", title: "Озвучка 2" };

    render(
      <PlaybackSelectors
        episodes={[episode]}
        sources={[source, second]}
        playbackOptions={[option]}
        selectedEpisodeId={episode.id}
        selectedSourceKey={source.key}
        selectedPlaybackIndex={0}
        onEpisodeChange={() => {}}
        onSourceChange={onSourceChange}
        onPlaybackChange={() => {}}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Озвучка"), "source-2");

    expect(onSourceChange).toHaveBeenCalledWith(second);
  });

  it("reports the selected quality", async () => {
    const user = userEvent.setup();
    const onPlaybackChange = vi.fn();
    const second = { ...option, quality: 1080, url: "https://example.org/1080.m3u8" };

    render(
      <PlaybackSelectors
        episodes={[episode]}
        sources={[source]}
        playbackOptions={[option, second]}
        selectedEpisodeId={episode.id}
        selectedSourceKey={source.key}
        selectedPlaybackIndex={0}
        onEpisodeChange={() => {}}
        onSourceChange={() => {}}
        onPlaybackChange={onPlaybackChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Качество"), "1");

    expect(onPlaybackChange).toHaveBeenCalledWith(second);
  });
});

describe("SelectField", () => {
  it("renders a placeholder option", () => {
    render(
      <SelectField
        value=""
        onChange={() => {}}
        placeholder="Выберите"
        options={[{ value: "a", label: "A" }]}
      />,
    );

    expect(screen.getByRole("option", { name: "Выберите" })).toBeDisabled();
  });

  it("disables the field", () => {
    render(
      <SelectField
        label="Серия"
        value=""
        onChange={() => {}}
        disabled
        options={[{ value: "a", label: "A" }]}
      />,
    );

    expect(screen.getByLabelText("Серия")).toBeDisabled();
  });
});
