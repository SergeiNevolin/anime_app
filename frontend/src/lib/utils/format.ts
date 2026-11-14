/** Formatting helpers shared by the components. */

const RELEASE_STATUS_LABELS: Record<string, string> = {
  unknown: "Неизвестно",
  ongoing: "Выходит",
  completed: "Завершён",
  upcoming: "Анонс",
  paused: "Приостановлен",
  cancelled: "Отменён",
};

const LIBRARY_STATUS_LABELS: Record<string, string> = {
  plan_to_watch: "В планах",
  watching: "Смотрю",
  completed: "Просмотрено",
  on_hold: "Отложено",
  dropped: "Брошено",
};

/** Return the human readable label of a release status. */
export function formatReleaseStatus(status: string | null | undefined): string {
  if (!status) {
    return RELEASE_STATUS_LABELS.unknown ?? "Неизвестно";
  }
  return RELEASE_STATUS_LABELS[status] ?? status;
}

/** Return the human readable label of a library status. */
export function formatLibraryStatus(status: string | null | undefined): string {
  if (!status) {
    return LIBRARY_STATUS_LABELS.plan_to_watch ?? "В планах";
  }
  return LIBRARY_STATUS_LABELS[status] ?? status;
}

/** Return the label of a playback quality. */
export function formatQuality(quality: number): string {
  if (!quality) {
    return "Аудио";
  }
  return `${quality}p`;
}

/** Return the label of a playback kind. */
export function formatPlaybackKind(kind: string): string {
  switch (kind) {
    case "hls":
      return "HLS";
    case "mp4":
      return "MP4";
    case "dash":
      return "MPEG-DASH";
    case "embed":
      return "Встроенный плеер";
    default:
      return "Внешний источник";
  }
}

/** Format a number of episodes. */
export function formatEpisodeCount(count: number | null | undefined): string {
  if (!count) {
    return "—";
  }
  return `${count} эп.`;
}
