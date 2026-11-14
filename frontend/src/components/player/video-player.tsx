"use client";

import Hls from "hls.js";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { PlaybackOption } from "@/lib/api/types";
import { formatQuality } from "@/lib/utils/format";

const FORWARDED_HEADERS = new Set([
  "referer",
  "referrer",
  "origin",
  "accept-language",
  "accept",
]);

/**
 * Keep only the headers a browser is allowed to send.
 *
 * `User-Agent` and `Cookie` are forbidden header names, so they are dropped:
 * the stream may then be rejected by the CDN, which is reported as a playback
 * error instead of silently failing.
 */
export function forwardableHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  if (!headers) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (FORWARDED_HEADERS.has(name.toLowerCase())) {
      result[name] = value;
    }
  }
  return result;
}

/**
 * A minimal video player.
 *
 * It supports HLS (through hls.js or the native support of the browser) and
 * MP4.  Every other format is reported as unsupported and the user is offered
 * the official page of the source.
 */
export function VideoPlayer({ option }: { option: PlaybackOption | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const headers = useMemo(
    () => forwardableHeaders(option?.headers),
    [option?.headers],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !option) {
      return;
    }

    setError(null);
    setLoading(true);
    let hls: Hls | null = null;

    if (option.kind === "hls") {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = option.url;
      } else if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          xhrSetup: (xhr) => {
            for (const [name, value] of Object.entries(headers)) {
              xhr.setRequestHeader(name, value);
            }
          },
        });
        hls.loadSource(option.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) {
            return;
          }
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setError("Не удалось загрузить поток. Попробуйте другой источник.");
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            setError("Ошибка воспроизведения. Попробуйте другой источник.");
          } else {
            setError("Источник недоступен.");
          }
          setLoading(false);
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setLoading(false);
        });
      } else {
        setError("Браузер не поддерживает формат HLS.");
        setLoading(false);
      }
    } else if (option.kind === "mp4") {
      video.src = option.url;
    } else {
      setError("Этот формат не поддерживается во встроенном плеере.");
      setLoading(false);
    }

    return () => {
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [option, headers]);

  if (!option) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2" data-testid="video-player">
      <div className="relative aspect-video w-full overflow-hidden rounded-control bg-black">
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          className="h-full w-full"
          onCanPlay={() => setLoading(false)}
          onWaiting={() => setLoading(true)}
          onError={() => {
            setLoading(false);
            setError("Не удалось воспроизвести файл.");
          }}
        >
          <track kind="captions" />
        </video>
        {loading ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-control bg-black/60 px-3 py-1.5 text-[12px] text-white">
              Загрузка…
            </span>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="text-[12px] text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between text-[12px] text-text-muted">
        <span>
          {option.source_title} · {formatQuality(option.quality)}
        </span>
        {option.official_url ? (
          <a
            href={option.official_url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent hover:underline"
          >
            Открыть на сайте источника
          </a>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The placeholder shown when no stream is selected yet.
 */
export function PlayerPlaceholder({ message }: { message: string }) {
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-control bg-surface-muted px-6 text-center">
      <p className="text-[13px] text-text-muted">{message}</p>
    </div>
  );
}

/**
 * The button that opens the official page of a source.
 */
export function ExternalSourceButton({ url }: { url: string }) {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.open(url, "_blank")}>
      Открыть во внешнем плеере
    </Button>
  );
}
