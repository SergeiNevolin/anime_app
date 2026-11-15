"use client";

import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";

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
 * error instead of failing silently.
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

function isHlsSource(src: string): boolean {
  return src.includes(".m3u8") || src.includes(".m3u");
}

/**
 * A minimal video player.
 *
 * It supports HLS (through hls.js or the native support of the browser) and
 * every other format the browser can play natively.  A stream that cannot be
 * played is reported as an error and the official page of the source stays
 * available.
 */
export function VideoPlayer({
  src,
  headers,
  title,
  className,
}: {
  src: string;
  headers?: Record<string, string>;
  title?: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSource = useCallback(() => {
    const video = videoRef.current;
    if (!video || !src) {
      return;
    }

    setError(null);
    setLoading(true);

    if (isHlsSource(src)) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          xhrSetup: (xhr) => {
            for (const [name, value] of Object.entries(
              forwardableHeaders(headers),
            )) {
              xhr.setRequestHeader(name, value);
            }
          },
        });
        hlsRef.current = hls;
        hls.loadSource(src);
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
        return;
      }
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        return;
      }
      setError("Браузер не поддерживает формат HLS.");
      setLoading(false);
      return;
    }

    video.src = src;
  }, [src, headers]);

  useEffect(() => {
    loadSource();
    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [loadSource]);

  if (error) {
    return (
      <div
        className={`flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-control bg-black p-4 text-center ${className ?? ""}`}
        data-testid="video-player"
      >
        <p className="text-[15px] font-medium text-white">Ошибка воспроизведения</p>
        <p className="text-[13px] text-white/70">{error}</p>
      </div>
    );
  }

  return (
    <div className={className} data-testid="video-player">
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

      {title ? (
        <div className="mt-1.5 text-[12px] text-text-muted truncate">
          {title}
        </div>
      ) : null}
    </div>
  );
}
