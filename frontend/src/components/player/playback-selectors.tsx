"use client";

import { SelectField } from "@/components/ui/select-field";
import type { AnimeEpisode, EpisodeSource, PlaybackOption } from "@/lib/api/types";
import { formatQuality } from "@/lib/utils/format";

/**
 * The playback selectors: series, dubbing and quality.
 *
 * The component only renders the selectors that make sense for the currently
 * available data, so a provider with a single source does not show an empty
 * dubbing list.
 */
export function PlaybackSelectors({
  episodes,
  sources,
  playbackOptions,
  selectedEpisodeId,
  selectedSourceKey,
  selectedPlaybackIndex,
  onEpisodeChange,
  onSourceChange,
  onPlaybackChange,
}: {
  episodes: AnimeEpisode[];
  sources: EpisodeSource[];
  playbackOptions: PlaybackOption[];
  selectedEpisodeId: string | null;
  selectedSourceKey: string | null;
  selectedPlaybackIndex: number;
  onEpisodeChange: (episodeId: string) => void;
  onSourceChange: (source: EpisodeSource) => void;
  onPlaybackChange: (option: PlaybackOption) => void;
}) {
  return (
    <div className="flex flex-col items-stretch gap-3 border-t border-border pt-3 sm:flex-row sm:items-start">
      <SelectField
        label="Серия"
        className="sm:flex-1"
        value={selectedEpisodeId ?? ""}
        onChange={onEpisodeChange}
        options={episodes.map((episode) => ({
          value: episode.id,
          label: `Эпизод ${episode.number}${episode.title ? `: ${episode.title}` : ""}${
            episode.is_available ? "" : " (недоступен)"
          }`,
          disabled: !episode.is_available,
        }))}
      />

      {sources.length > 1 ? (
        <SelectField
          label="Озвучка"
          className="sm:flex-1"
          value={selectedSourceKey ?? ""}
          onChange={(value) => {
            const source = sources.find((item) => item.key === value);
            if (source) {
              onSourceChange(source);
            }
          }}
          options={sources.map((source) => ({
            value: source.key,
            label: `${source.title} (${source.player})`,
          }))}
        />
      ) : null}

      {playbackOptions.length > 1 ? (
        <SelectField
          label="Качество"
          className="sm:flex-1"
          value={String(selectedPlaybackIndex)}
          onChange={(value) => {
            const option = playbackOptions[Number.parseInt(value, 10)];
            if (option) {
              onPlaybackChange(option);
            }
          }}
          options={playbackOptions.map((option, index) => ({
            value: String(index),
            label: formatQuality(option.quality),
          }))}
        />
      ) : null}
    </div>
  );
}
