"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Hls from "hls.js";

import { Button } from "@/components/ui/button";
import { SourceList } from "@/components/player/source-list";
import { formatQuality } from "@/lib/utils/format";
import type { EpisodeSource, PlaybackOption } from "@/lib/api/types";

const FORWARDED_HEADERS = new Set([
  "referer",
  "referrer",
  "origin",
  "accept-language",
  "accept",
]);

export function forwardableHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  if (!headers) return {};
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (FORWARDED_HEADERS.has(name.toLowerCase())) {
      result[name] = value;
    }
  }
  return result;
}

interface SimplePlayerProps {
  currentEpisodeNumber: number;
  totalEpisodes: number | null;
  episodes: { id: string; number: number; title?: string | null; is_available: boolean }[];
  sources: EpisodeSource[];
  playbackOptions: PlaybackOption[];
  onEpisodeChange: (episodeId: string) => void;
  onSourceChange: (source: EpisodeSource) => void;
  onPlaybackChange: (option: PlaybackOption) => void;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onTimeUpdate: (currentTime: number, duration: number) => void;
  autoPlay?: boolean;
  initialTime?: number;
  className?: string;
}

export function SimplePlayer({
  currentEpisodeNumber,
  totalEpisodes,
  episodes,
  sources,
  playbackOptions,
  onEpisodeChange,
  onSourceChange,
  onPlaybackChange,
  onPlay,
  onPause,
  onEnded,
  onTimeUpdate,
  autoPlay = true,
  initialTime = 0,
  className,
}: SimplePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Refs for callbacks to avoid effect re-runs
  const onEndedRef = useRef(onEnded);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onSourceChangeRef = useRef(onSourceChange);
  const onPlaybackChangeRef = useRef(onPlaybackChange);

  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);
  useEffect(() => { onPlayRef.current = onPlay; }, [onPlay]);
  useEffect(() => { onPauseRef.current = onPause; }, [onPause]);
  useEffect(() => { onSourceChangeRef.current = onSourceChange; }, [onSourceChange]);
  useEffect(() => { onPlaybackChangeRef.current = onPlaybackChange; }, [onPlaybackChange]);

  const [selectedSourceKey, setSelectedSourceKey] = useState<string | null>(null);
  const [selectedPlaybackIndex, setSelectedPlaybackIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for values that shouldn't trigger effect re-runs
  const isMutedRef = useRef(isMuted);
  const volumeRef = useRef(volume);
  const playbackRateRef = useRef(playbackRate);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { playbackRateRef.current = playbackRate; }, [playbackRate]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const currentSource = sources.find((s) => s.key === selectedSourceKey);
  const currentOption = playbackOptions?.[selectedPlaybackIndex];

  // Memoize headers to prevent recreation
  const headers = useMemo(() => {
    const result: Record<string, string> = {};
    if (currentOption?.headers) {
      for (const [name, value] of Object.entries(currentOption.headers)) {
        if (FORWARDED_HEADERS.has(name.toLowerCase())) {
          result[name] = value;
        }
      }
    }
    return result;
  }, [currentOption?.headers]);

  // Load source when it changes - minimal dependencies
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentOption) return;

    setError(null);
    setLoading(true);

    const handleCanPlay = () => {
      setLoading(false);
      if (initialTime > 0 && !video.seeking) {
        video.currentTime = initialTime;
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdateRef.current?.(video.currentTime, video.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      onEndedRef.current?.();
    };

    const handlePlay = () => {
      setIsPlaying(true);
      onPlayRef.current?.();
    };
    const handlePause = () => {
      setIsPlaying(false);
      onPauseRef.current?.();
    };
    const handleWaiting = () => setLoading(true);
    const handleError = () => {
      setLoading(false);
      setError("Не удалось воспроизвести файл.");
    };

    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("error", handleError);

    const loadSource = async () => {
      if (currentOption.kind === "hls" || currentOption.url.includes(".m3u8")) {
        if (Hls.isSupported()) {
          // Cleanup old HLS instance
          if (hlsRef.current) {
            hlsRef.current.destroy();
          }
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            xhrSetup: (xhr) => {
              for (const [name, value] of Object.entries(headers)) {
                xhr.setRequestHeader(name, value);
              }
            },
          });
          hlsRef.current = hls;
          hls.loadSource(currentOption.url);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
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
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = currentOption.url;
        } else {
          setError("Браузер не поддерживает формат HLS.");
          setLoading(false);
        }
      } else if (currentOption.kind === "mp4" || currentOption.url.includes(".mp4")) {
        video.src = currentOption.url;
      } else {
        video.src = currentOption.url;
      }

      video.volume = isMutedRef.current ? 0 : volumeRef.current;
      video.playbackRate = playbackRateRef.current;
      if (autoPlay) {
        video.play().catch(() => {});
      }
    };

    loadSource();

    return () => {
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("error", handleError);
      // Don't call cleanup() here - let the next effect run handle cleanup
      // cleanup();
    };
  }, [currentOption, headers, autoPlay, initialTime]); // Minimal deps

  // Auto-select first source
  useEffect(() => {
    const firstSource = sources[0];
    if (firstSource && !selectedSourceKey) {
      setSelectedSourceKey(firstSource.key);
      setSelectedPlaybackIndex(0);
    }
  }, [sources, selectedSourceKey]);

  const handleSourceSelect = useCallback((source: EpisodeSource) => {
    setSelectedSourceKey(source.key);
    setSelectedPlaybackIndex(0);
    onSourceChangeRef.current?.(source);
  }, []);

  const handlePlaybackSelect = useCallback((index: number) => {
    if (playbackOptions && playbackOptions[index]) {
      setSelectedPlaybackIndex(index);
      onPlaybackChangeRef.current?.(playbackOptions[index]);
    }
  }, [playbackOptions]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, []);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(time, video.duration));
  }, []);

  const skip = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    seek(video.currentTime + seconds);
  }, [seek]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setIsMuted((m) => {
      video.muted = !m;
      video.volume = m ? volumeRef.current : 0;
      return !m;
    });
  }, []);

  const changeVolume = useCallback((vol: number) => {
    const video = videoRef.current;
    if (!video) return;
    setVolume(vol);
    setIsMuted(vol === 0);
    video.muted = vol === 0;
    video.volume = vol;
  }, []);

  const changeRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;
    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {}
  }, []);

  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch {}
  }, []);

  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    if (isPlaying) resetControlsTimeout();
    return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
  }, [isPlaying, resetControlsTimeout]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const prevEpisode = episodes.find((ep) => ep.number === currentEpisodeNumber - 1);
  const nextEpisode = episodes.find((ep) => ep.number === currentEpisodeNumber + 1);

  if (!currentOption) {
    return (
      <div className={`aspect-video w-full rounded-xl bg-black overflow-hidden relative ${className ?? ""}`} ref={containerRef}>
        <video ref={videoRef} className="w-full h-full" />
        <div className="flex h-full w-full items-center justify-center bg-black text-white px-6 text-center">
          <p className="text-lg">Выберите источник воспроизведения</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative aspect-video w-full rounded-xl bg-black overflow-hidden ${className ?? ""}`}
      ref={containerRef}
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => setShowControls(false)}
      onMouseEnter={resetControlsTimeout}
    >
      <video
        ref={videoRef}
        playsInline
        preload="metadata"
        className="w-full h-full"
        onCanPlay={() => setLoading(false)}
        onWaiting={() => setLoading(true)}
        onError={() => {
          setLoading(false);
          setError("Не удалось воспроизвести файл.");
        }}
      >
        <track kind="captions" />
      </video>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="flex flex-col items-center gap-3 text-white">
            <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin" />
            <span>Загрузка…</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-4 text-center text-white">
          <p className="text-base font-medium">Ошибка воспроизведения</p>
          <p className="text-sm text-text-muted max-w-md">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            Перезагрузить страницу
          </Button>
        </div>
      )}

      {showControls && (
        <>
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
            <div className="max-w-7xl mx-auto flex items-center justify-between pointer-events-auto">
              <div className="flex items-center gap-2">
                {currentOption && (
                  <>
                    <span className="text-sm text-white/80 bg-black/50 px-2 py-1 rounded">
                      {currentOption.source_title} · {formatQuality(currentOption.quality)}
                    </span>
                    {currentOption.official_url && (
                      <a href={currentOption.official_url} target="_blank" rel="noreferrer noopener"
                        className="text-sm text-accent hover:underline bg-black/50 px-2 py-1 rounded">
                        Открыть на сайте источника
                      </a>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-white/70">Скорость:</span>
                <select
                  value={playbackRate}
                  onChange={(e) => changeRate(parseFloat(e.target.value))}
                  className="bg-black/50 text-white text-xs rounded px-2 py-1 border border-white/20"
                >
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={r}>{r}x</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none">
            <div className="max-w-7xl mx-auto pointer-events-auto">
              {/* Progress bar */}
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 h-1.5 bg-white/20 rounded-full cursor-pointer relative group" onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  seek((e.clientX - rect.left) / rect.width * duration);
                }}>
                  <div className="h-full bg-accent rounded-full transition-all duration-75"
                    style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }} />
                  <div className="absolute top-1/2 right-0 w-3 h-3 -translate-x-1/2 -translate-y-1/2 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="flex items-center gap-2 text-xs text-white/80 w-28 shrink-0">
                  <span>{formatTime(currentTime)}</span>
                  <span className="text-white/40">/</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Control buttons */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-10 w-10 p-0 text-white/80 hover:text-white" onClick={() => skip(-10)} aria-label="Назад 10 сек">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>
                  </Button>
                  <Button variant="ghost" size="sm" className="h-10 w-10 p-0 text-white/80 hover:text-white" onClick={togglePlay} aria-label={isPlaying ? "Пауза" : "Воспроизвести"}>
                    {isPlaying ? (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    )}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-10 w-10 p-0 text-white/80 hover:text-white" onClick={() => skip(10)} aria-label="Вперед 10 сек">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zM15.5 12l8.5 6V6l-8.5 6z"/></svg>
                  </Button>
                </div>

                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-10 w-10 p-0 text-white/80 hover:text-white" onClick={toggleMute} aria-label={isMuted ? "Включить звук" : "Выключить звук"}>
                    {isMuted || volume === 0 ? (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3z"/></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                    )}
                  </Button>
                  <div className="relative h-10 w-24 flex items-center">
                    <input type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume}
                      onChange={(e) => changeVolume(parseFloat(e.target.value))}
                      className="w-full h-1.5 appearance-none bg-white/20 rounded-full cursor-pointer accent-accent" aria-label="Громкость" />
                  </div>
                </div>

                <div className="flex items-center gap-1 ml-auto">
                  {/* Source selector */}
                  {sources.length > 1 && (
                    <div className="relative">
                      <Button variant="ghost" size="sm" className="h-10 w-auto px-3 text-white/80 hover:text-white" onClick={() => setShowSettings(!showSettings)}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.572 1.065c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        <span className="ml-1 hidden sm:inline">{currentSource?.title}</span>
                      </Button>
                      {showSettings && (
                        <div className="absolute bottom-full right-0 mb-2 bg-surface rounded-lg border border-border shadow-lg overflow-hidden z-20 min-w-[200px] animate-slide-up">
                          <SourceList sources={sources} selectedKey={selectedSourceKey} onSelect={handleSourceSelect} />
                          <div className="border-t border-border p-2">
                            <p className="text-xs font-medium text-text-muted px-2 py-1">Качество</p>
                            <div className="flex flex-wrap gap-1 p-2">
                              {playbackOptions?.map((opt, idx) => (
                                <Button key={`${opt.provider}-${opt.source_key}-${opt.quality}`} variant={selectedPlaybackIndex === idx ? "primary" : "secondary"} size="sm" onClick={() => handlePlaybackSelect(idx)}>
                                  {formatQuality(opt.quality)}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <Button variant="ghost" size="sm" className="h-10 w-10 p-0 text-white/80 hover:text-white" onClick={togglePiP} aria-label="Picture-in-Picture">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  </Button>

                  <Button variant="ghost" size="sm" className="h-10 w-10 p-0 text-white/80 hover:text-white" onClick={toggleFullscreen} aria-label={isFullscreen ? "Выйти из полноэкранного" : "Полноэкранный режим"}>
                    {isFullscreen ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Episode navigation */}
          <div className="absolute bottom-full left-0 right-0 mb-2 px-3 pointer-events-none">
            <div className="max-w-7xl mx-auto flex items-center justify-between pointer-events-auto">
              {prevEpisode && (
                <Button variant="secondary" size="sm" onClick={() => onEpisodeChange(prevEpisode.id)}>
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                  Эп. {prevEpisode.number}
                </Button>
              )}
              <div className="text-center text-xs text-white/70">
                Эпизод {currentEpisodeNumber} из {totalEpisodes ?? "?"}
              </div>
              {nextEpisode && (
                <Button variant="secondary" size="sm" onClick={() => onEpisodeChange(nextEpisode.id)}>
                  Эп. {nextEpisode.number}
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export { SimplePlayer as VideoJSPlayer };