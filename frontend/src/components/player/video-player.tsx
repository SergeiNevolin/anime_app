"use client";

import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";

import { requestTelegramFullscreen } from "@/lib/telegram/webapp";
import { cn } from "@/lib/utils/cn";

/** How long the controls stay on screen while a fullscreen video plays. */
const CONTROLS_HIDE_DELAY = 3000;

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

/** Format a number of seconds as `m:ss` or `h:mm:ss`. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const secondsPart = String(rest).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${secondsPart}`;
  }
  return `${minutes}:${secondsPart}`;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M8 5.5a1 1 0 0 1 1.52-.85l10.5 6.5a1 1 0 0 1 0 1.7l-10.5 6.5A1 1 0 0 1 8 18.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
      <rect x="6.5" y="5" width="3.6" height="14" rx="1.3" />
      <rect x="13.9" y="5" width="3.6" height="14" rx="1.3" />
    </svg>
  );
}

function FullscreenIcon({ exit = false }: { exit?: boolean }) {
  const d = exit
    ? "M4 9h5V4M20 9h-5V4M20 15h-5v5M4 15h5v5"
    : "M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5";
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

function RotateIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12a8 8 0 0 1 13.66-5.66L20 8.7" />
      <path d="M20 4v4.7h-4.7" />
      <path d="M20 12a8 8 0 0 1-13.66 5.66L4 15.3" />
      <path d="M4 20v-4.7h4.7" />
    </svg>
  );
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
 * A minimalistic video player with its own controls.
 *
 * The native media controls are not used: Telegram webviews disable or ignore
 * their fullscreen button, and they cannot be styled.  The player supports HLS
 * (through hls.js or the native support of the browser) and every other format
 * the browser can play natively; a stream that cannot be played is reported as
 * an error and the official page of the source stays available.
 *
 * On a phone the stage opens in landscape: it first asks for the system
 * orientation lock, and when the webview refuses the video is simply rotated,
 * so the result does not depend on the client.
 *
 * A Mini App cannot hide the system status bar: Telegram puts the fullscreen
 * Mini App underneath it and reports its height through `safeAreaInset`.  The
 * overlay therefore fills the whole screen and keeps its own controls and a
 * scrim behind the system bar instead of trying to move the bar away.
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
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [isPortraitViewport, setIsPortraitViewport] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

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

  // Follow the playback state of the element, so the controls stay correct
  // when the video is paused by the system or reaches its end.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const onTimeUpdate = (): void => setCurrentTime(video.currentTime || 0);
    const onDurationChange = (): void =>
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    const onPlay = (): void => setPlaying(true);
    const onPause = (): void => setPlaying(false);
    const onEnded = (): void => setPlaying(false);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("loadedmetadata", onDurationChange);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("loadedmetadata", onDurationChange);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
    };
  }, []);

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

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (playing) {
      video.pause();
      setPlaying(false);
    } else {
      const started = video.play();
      if (started) {
        void started.catch(() => setPlaying(false));
      }
      setPlaying(true);
    }
  }, [playing]);

  const seek = useCallback((value: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.currentTime = value;
    setCurrentTime(value);
  }, []);

  /**
   * The controls fade away while a fullscreen video plays, so the frame is
   * never covered; any touch, pointer movement or paused state brings them
   * back.
   */
  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    clearHideTimer();
    if (!isFullscreen || !playing) {
      return;
    }
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setControlsVisible(false);
    }, CONTROLS_HIDE_DELAY);
  }, [clearHideTimer, isFullscreen, playing]);

  useEffect(() => {
    if (!isFullscreen || !playing) {
      clearHideTimer();
      setControlsVisible(true);
      return;
    }
    revealControls();
    return clearHideTimer;
  }, [clearHideTimer, isFullscreen, playing, revealControls]);

  const handleVideoClick = useCallback(() => {
    // A tap on a bare fullscreen video only brings the controls back; the next
    // tap pauses, as in any other player.
    if (isFullscreen && !controlsVisible) {
      revealControls();
      return;
    }
    togglePlay();
  }, [controlsVisible, isFullscreen, revealControls, togglePlay]);

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
    // The app itself stays fullscreen: only the stage overlay is closed, so
    // the Telegram header does not slide back over the page afterwards.
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

  // The frame itself is turned by 90 degrees, so the device insets land on
  // other sides of the rotated video: the bottom safe area becomes the left
  // edge of the frame, the top one becomes the right edge.
  const controlInsets = rotated
    ? {
        paddingBottom: "0.5rem",
        paddingLeft:
          "calc(0.5rem + var(--app-safe-area-bottom, env(safe-area-inset-bottom, 0px)))",
        paddingRight:
          "calc(0.5rem + var(--app-safe-area-top, env(safe-area-inset-top, 0px)))",
      }
    : {
        paddingBottom:
          "calc(0.5rem + var(--app-safe-area-bottom, env(safe-area-inset-bottom, 0px)))",
        paddingLeft:
          "calc(0.5rem + var(--app-safe-area-left, env(safe-area-inset-left, 0px)))",
        paddingRight:
          "calc(0.5rem + var(--app-safe-area-right, env(safe-area-inset-right, 0px)))",
      };

  // The controls are rendered inside the frame, so they follow the rotation
  // and stay on the bottom edge of the video instead of the physical screen.
  const controls = (
    <div
      data-testid="player-controls"
      data-visible={controlsVisible ? "true" : "false"}
      className={cn(
        "absolute inset-x-0 bottom-0 z-10 flex items-center gap-1 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-2 pt-10 text-white transition-opacity duration-200",
        controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      style={controlInsets}
    >
      <button
        type="button"
        aria-label={playing ? "Пауза" : "Воспроизвести"}
        onClick={togglePlay}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white drop-shadow transition-colors duration-150 hover:bg-white/10 active:bg-white/20"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <span
        className="shrink-0 pl-0.5 text-[11px] font-medium tabular-nums text-white/90"
        data-testid="playback-time"
      >
        {formatTime(currentTime)}
        <span className="text-white/50"> / {formatTime(duration)}</span>
      </span>

      <div className="flex h-8 min-w-0 flex-1 items-center px-1.5">
        <input
          type="range"
          aria-label="Перемотка"
          min={0}
          max={duration}
          step={0.1}
          value={Math.min(currentTime, duration)}
          disabled={duration === 0}
          onChange={(event) => {
            seek(Number(event.target.value));
            revealControls();
          }}
          className="h-1 w-full cursor-pointer accent-white disabled:cursor-default"
        />
      </div>

      <button
        type="button"
        aria-label={
          isFullscreen ? "Выйти из полноэкранного режима" : "На весь экран"
        }
        onClick={toggleFullscreen}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white drop-shadow transition-colors duration-150 hover:bg-white/10 active:bg-white/20"
      >
        <FullscreenIcon exit={isFullscreen} />
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
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white drop-shadow transition-colors duration-150 hover:bg-white/10 active:bg-white/20"
        >
          <RotateIcon />
        </button>
      ) : null}
    </div>
  );

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
        onPointerDown={revealControls}
        onPointerMove={revealControls}
      >
        <div
          className="relative flex h-full w-full items-center justify-center bg-black"
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
            playsInline
            preload="metadata"
            className={cn("h-full w-full", isFullscreen && "object-contain")}
            onClick={handleVideoClick}
            onCanPlay={() => setLoading(false)}
            onWaiting={() => setLoading(true)}
            onError={() => {
              setLoading(false);
              setError("Не удалось воспроизвести файл.");
            }}
          >
            <track kind="captions" />
          </video>

          {controls}
        </div>

        {isFullscreen ? (
          // The system bar of the phone stays drawn above the Mini App; a dark
          // scrim keeps its icons readable over a bright frame.
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 via-black/20 to-transparent transition-opacity duration-200",
              controlsVisible ? "opacity-100" : "opacity-0",
            )}
            style={{
              height:
                "calc(var(--app-safe-area-top, env(safe-area-inset-top, 0px)) + 2rem)",
            }}
          />
        ) : null}

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
