import { describe, it, expect } from "vitest";

import {
  formatEpisodeCount,
  formatLibraryStatus,
  formatPlaybackKind,
  formatQuality,
  formatReleaseStatus,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

describe("formatReleaseStatus", () => {
  it("translates the known statuses", () => {
    expect(formatReleaseStatus("ongoing")).toBe("Выходит");
    expect(formatReleaseStatus("completed")).toBe("Завершён");
    expect(formatReleaseStatus("upcoming")).toBe("Анонс");
  });

  it("falls back to the raw value", () => {
    expect(formatReleaseStatus("custom")).toBe("custom");
    expect(formatReleaseStatus(undefined)).toBe("Неизвестно");
    expect(formatReleaseStatus(null)).toBe("Неизвестно");
  });
});

describe("formatLibraryStatus", () => {
  it("translates the known statuses", () => {
    expect(formatLibraryStatus("plan_to_watch")).toBe("В планах");
    expect(formatLibraryStatus("watching")).toBe("Смотрю");
    expect(formatLibraryStatus("completed")).toBe("Просмотрено");
    expect(formatLibraryStatus("on_hold")).toBe("Отложено");
    expect(formatLibraryStatus("dropped")).toBe("Брошено");
  });

  it("falls back to the default", () => {
    expect(formatLibraryStatus(undefined)).toBe("В планах");
    expect(formatLibraryStatus("other")).toBe("other");
  });
});

describe("formatQuality", () => {
  it("formats the resolution", () => {
    expect(formatQuality(720)).toBe("720p");
    expect(formatQuality(1080)).toBe("1080p");
  });

  it("reports the audio only streams", () => {
    expect(formatQuality(0)).toBe("Аудио");
  });
});

describe("formatPlaybackKind", () => {
  it("translates the known kinds", () => {
    expect(formatPlaybackKind("hls")).toBe("HLS");
    expect(formatPlaybackKind("mp4")).toBe("MP4");
    expect(formatPlaybackKind("dash")).toBe("MPEG-DASH");
    expect(formatPlaybackKind("embed")).toBe("Встроенный плеер");
    expect(formatPlaybackKind("external")).toBe("Внешний источник");
  });
});

describe("formatEpisodeCount", () => {
  it("formats the number of episodes", () => {
    expect(formatEpisodeCount(26)).toBe("26 эп.");
    expect(formatEpisodeCount(0)).toBe("—");
    expect(formatEpisodeCount(null)).toBe("—");
  });
});

describe("cn", () => {
  it("joins the class names and skips the empty ones", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
    expect(cn()).toBe("");
  });
});
