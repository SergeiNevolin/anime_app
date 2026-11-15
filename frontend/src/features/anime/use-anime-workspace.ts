"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAnimeDetails, useAnimeEpisodes } from "@/features/anime/hooks";
import {
  useAddToLibrary,
  useLibraryEntry,
  useUpdateLibraryEntry,
} from "@/features/library/hooks";
import { useEpisodeSources, usePlaybackOptions } from "@/features/player/hooks";
import type {
  EpisodeSource,
  LibraryStatus,
  PlaybackOption,
} from "@/lib/api/types";

/**
 * The state machine of the anime page.
 *
 * It owns the selection of the episode, of the source and of the quality, and
 * keeps the library entry in sync with the progress of the user.  The page
 * itself only renders the result.
 */
export function useAnimeWorkspace(animeId: string) {
  const details = useAnimeDetails(animeId);
  const episodesQuery = useAnimeEpisodes(animeId);
  const libraryEntryQuery = useLibraryEntry(animeId);
  const updateLibrary = useUpdateLibraryEntry();
  const add = useAddToLibrary();

  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [selectedSourceKey, setSelectedSourceKey] = useState<string | null>(null);
  const [selectedPlaybackIndex, setSelectedPlaybackIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const episodes = useMemo(
    () => episodesQuery.data?.items ?? [],
    [episodesQuery.data],
  );

  const libraryEntry = libraryEntryQuery.data ?? null;
  // Primitives keep the callbacks stable across the refetches of the query.
  const hasEntry = Boolean(libraryEntry);
  const currentStatus = libraryEntry?.status ?? ("plan_to_watch" as LibraryStatus);

  /**
   * The episode the user watched last, or the first one when the title was
   * never started.
   */
  const resumeEpisode = useMemo(() => {
    const progress = libraryEntry?.progress_episode ?? 0;
    if (progress > 0) {
      const watched = episodes.find((episode) => episode.number === progress);
      if (watched) {
        return watched;
      }
    }
    return episodes[0] ?? null;
  }, [episodes, libraryEntry?.progress_episode]);

  // Select the episode to show as soon as the list is available.
  useEffect(() => {
    if (!selectedEpisodeId && resumeEpisode) {
      setSelectedEpisodeId(resumeEpisode.id);
    }
  }, [resumeEpisode, selectedEpisodeId]);

  const sourcesQuery = useEpisodeSources(selectedEpisodeId);
  const sources = useMemo(() => sourcesQuery.data ?? [], [sourcesQuery.data]);

  // Keep the selected source valid: it has to exist in the current episode.
  useEffect(() => {
    if (!sources.length) {
      return;
    }
    if (!selectedSourceKey || !sources.some((source) => source.key === selectedSourceKey)) {
      setSelectedSourceKey(sources[0]?.key ?? null);
      setSelectedPlaybackIndex(0);
    }
  }, [sources, selectedSourceKey]);

  const playbackQuery = usePlaybackOptions(selectedEpisodeId, selectedSourceKey);
  const playbackOptions = useMemo(
    () => playbackQuery.data ?? [],
    [playbackQuery.data],
  );

  // The index has to stay inside the list of the resolved options.
  useEffect(() => {
    if (selectedPlaybackIndex >= playbackOptions.length) {
      setSelectedPlaybackIndex(0);
    }
  }, [playbackOptions.length, selectedPlaybackIndex]);

  const selectEpisode = useCallback((episodeId: string) => {
    setSelectedEpisodeId(episodeId);
    setSelectedSourceKey(null);
    setSelectedPlaybackIndex(0);
  }, []);

  const selectSource = useCallback((source: EpisodeSource) => {
    setSelectedSourceKey(source.key);
    setSelectedPlaybackIndex(0);
  }, []);

  const selectPlayback = useCallback(
    (option: PlaybackOption) => {
      const index = playbackOptions.findIndex(
        (item) => item.url === option.url && item.quality === option.quality,
      );
      setSelectedPlaybackIndex(index >= 0 ? index : 0);
    },
    [playbackOptions],
  );

  const changeStatus = useCallback(
    async (status: LibraryStatus) => {
      // A title that is not in the library yet has to be created, the
      // update endpoint only works for an existing entry.
      if (!hasEntry) {
        await add.mutateAsync({ animeId, status });
        return;
      }
      await updateLibrary.mutateAsync({ animeId, status });
    },
    [add, animeId, hasEntry, updateLibrary],
  );

  const changeProgress = useCallback(
    async (progress: number) => {
      // The decision is taken before the request: the entry is refreshed by
      // the invalidation of the query and would lose the previous status.
      const wasPlanned = currentStatus === "plan_to_watch";
      if (!hasEntry) {
        await add.mutateAsync({ animeId, status: "watching", progressEpisode: progress });
        return;
      }
      await updateLibrary.mutateAsync({ animeId, progressEpisode: progress });
      if (progress > 0 && wasPlanned) {
        await updateLibrary.mutateAsync({ animeId, status: "watching" });
      }
    },
    [add, animeId, currentStatus, hasEntry, updateLibrary],
  );

  const addToLibrary = useCallback(async () => {
    await add.mutateAsync({ animeId, status: "plan_to_watch" });
  }, [add, animeId]);

  const currentEpisode = useMemo(
    () => episodes.find((episode) => episode.id === selectedEpisodeId) ?? null,
    [episodes, selectedEpisodeId],
  );

  const currentOption = playbackOptions[selectedPlaybackIndex] ?? null;

  return {
    anime: details.data ?? null,
    isPending: details.isPending || episodesQuery.isPending,
    error: details.error ?? episodesQuery.error ?? null,
    episodes,
    libraryEntry,
    libraryStatus: libraryEntry?.status ?? "plan_to_watch",
    isInLibrary: Boolean(libraryEntry),
    selectedEpisodeId,
    selectedSourceKey,
    selectedPlaybackIndex,
    sources,
    playbackOptions,
    currentEpisode,
    currentOption,
    expanded,
    isMutating: updateLibrary.isPending,
    toggleExpanded: () => setExpanded((value) => !value),
    selectEpisode,
    selectSource,
    selectPlayback,
    changeStatus,
    changeProgress,
    addToLibrary,
  };
}
