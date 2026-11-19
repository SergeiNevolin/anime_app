"use client";

import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  exitTelegramFullscreen,
  requestTelegramFullscreen,
} from "@/lib/telegram/webapp";
import { cn } from "@/lib/utils/cn";

const FORWARDED_HEADERS = new Set([
  "referer",
  "referrer",
  "origin",
  "accept-language",
  "accept",
]);

type Orientation = "portrait" | "landscape";

/**
 * The Orientation Lock API is not part of the TypeScript DOM library yet.
 */
type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: Orientation) => Promise<void>;
  unlock?: () => void;
};

function getScreenOrientation(): LockableScreenOrientation | undefined {
  if (typeof screen === "undefined" || !("orientation" in screen)) {
    return undefined;
  }
  return screen.orientation as LockableScreenOrientation;
}

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
 * Ask the platform to lock the screen orientation.
 *
 * Android only grants the lock to a fullscreen element, and Telegram webviews
 * may reject the whole request: the player then rotates the stage itself.
 */
function lockScreenOrientation(mode: Orientation): void {
  const orientation = getScreenOrientation();
  if (!orientation || typeof orientation.lock !== "function") {
    return;
  }
  try {
    void orientation.lock(mode).catch(() => undefined);
  } catch {
    // A webview without the Orientation Lock API keeps the device as is.
  }
}

function unlockScreenOrientation(): void {
  const orientation = getScreenOrientation();
  if (orientation && typeof orientation.unlock === "function") {
    orientation.unlock();
  }
}

/**
 * A minimal video player.
 *
 * It supports HLS (through hls.js or the native support of the browser) and
 * every other format the browser can play natively.  A stream that cannot be
 * played is reported as an error and the official page of the source stays
 * available.
 *
 * Fullscreen is implemented by the player itself (Telegram webviews either
 * disable or ignore the fullscreen control of the native media controls).  On
 * a phone the stage opens in landscape: it first asks for the system
 * orientation lock, and when the webview refuses the video is simply rotated,
 * so the result does not depend on the client.
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
  const stageRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [isPortraitViewport, setIsPortraitViewport] = useState(false);

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

  // Track the shape of the viewport: a portrait phone needs the stage to be
  // rotated, a phone that is already horizontal does not.
  useEffect(() => {
    const update = (): void =>
      setIsPortraitViewport(window.innerHeight >= window.innerWidth);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  const enterFullscreen = useCallback(() => {
    setIsFullscreen(true);
    setOrientation("landscape");
    lockScreenOrientation("landscape");
    requestTelegramFullscreen();

    // A real fullscreen element gives the platform the right to lock the
    // orientation; where it is unsupported the request is simply rejected.
    const stage = stageRef.current;
    if (stage && typeof stage.requestFullscreen === "function") {
      stage.requestFullscreen().catch(() => undefined);
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
    setOrientation("portrait");
    unlockScreenOrientation();
    exitTelegramFullscreen();
    if (typeof document !== "undefined" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }, [enterFullscreen, exitFullscreen, isFullscreen]);

  const toggleOrientation = useCallback(() => {
    const next: Orientation = orientation === "landscape" ? "portrait" : "landscape";
    setOrientation(next);
    lockScreenOrientation(next);
  }, [orientation]);

  // Lock the page behind the overlay and leave fullscreen on Escape or on
  // unmount, so the Telegram header is never left hidden.
  useEffect(() => {
    if (!isFullscreen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    };
    // Leaving the native fullscreen (the system gesture or Escape) closes the
    // overlay as well.
    const onFullscreenChange = (): void => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      unlockScreenOrientation();
      exitTelegramFullscreen();
    };
  }, [isFullscreen]);

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

  // A portrait phone showing a landscape stage: the frame is stretched to the
  // rotated viewport and turned by 90 degrees around its own centre.
  const rotated =
    isFullscreen && orientation === "landscape" && isPortraitViewport;

  return (
    <div className={className} data-testid="video-player">
      <div
        ref={stageRef}
        className={cn(
          "bg-black",
          isFullscreen
            ? "fixed inset-0 z-50"
            : "relative aspect-video w-full overflow-hidden rounded-control",
        )}
        data-testid="video-stage"
        data-fullscreen={isFullscreen ? "true" : "false"}
        data-orientation={isFullscreen ? orientation : "portrait"}
      >
        <div
          className="flex h-full w-full items-center justify-center bg-black"
          data-testid="video-frame"
          data-rotated={rotated ? "true" : "false"}
          style={
            rotated
              ? {
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: "100vh",
                  height: "100vw",
                  transform: "translate(-50%, -50%) rotate(90deg)",
                }
              : undefined
          }
        >
          <video
            ref={videoRef}
            controls
            playsInline
            preload="metadata"
            className={cn("h-full w-full", isFullscreen && "object-contain")}
            onCanPlay={() => setLoading(false)}
            onWaiting={() => setLoading(true)}
            onError={() => {
              setLoading(false);
              setError("Не удалось воспроизвести файл.");
            }}
          >
            <track kind="captions" />
          </video>
        </div>

        <div className="absolute right-2 top-2 z-10 flex gap-1.5">
          <button
            type="button"
            aria-label={
              isFullscreen ? "Выйти из полноэкранного режима" : "На весь экран"
            }
            onClick={toggleFullscreen}
            className="flex h-9 w-9 items-center justify-center rounded-control bg-black/60 text-[15px] leading-none text-white"
          >
            <span aria-hidden="true">{isFullscreen ? "⤡" : "⤢"}</span>
          </button>
          {isFullscreen ? (
            <button
              type="button"
              aria-label={
                orientation === "landscape"
                  ? "Повернуть вертикально"
                  : "Повернуть горизонтально"
              }
              onClick={toggleOrientation}
              className="flex h-9 w-9 items-center justify-center rounded-control bg-black/60 text-[15px] leading-none text-white"
            >
              <span aria-hidden="true">⟳</span>
            </button>
          ) : null}
        </div>

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
