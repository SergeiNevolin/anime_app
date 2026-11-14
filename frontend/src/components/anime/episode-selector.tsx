"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { AnimeEpisode } from "@/lib/api/types";

interface EpisodeSelectorProps {
  episodes: AnimeEpisode[];
  selectedEpisodeId: string | null;
  onChange: (episodeId: string) => void;
  currentEpisode: AnimeEpisode | undefined;
  totalEpisodes: number | null;
}

export function EpisodeSelector({
  episodes,
  selectedEpisodeId,
  onChange,
  currentEpisode,
  totalEpisodes,
}: EpisodeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredEpisodes = episodes.filter((ep) =>
    ep.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    `эпизод ${ep.number}`.includes(searchTerm.toLowerCase())
  );

  return (
    <div className="relative" ref={selectRef}>
      <div className="flex items-center gap-4">
        {/* Current episode display */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-text-muted">Серия</span>
              <span className="text-lg font-semibold text-text tabular-nums">
                {currentEpisode?.number ?? "—"}
              </span>
              {currentEpisode?.title && (
                <span className="text-sm text-text-muted truncate max-w-[300px]">
                  {currentEpisode.title}
                </span>
              )}
            </div>
            <span className="text-sm text-text-muted shrink-0">
              {currentEpisode?.number ?? "—"} / {totalEpisodes ?? "?"}
            </span>
          </div>
        </div>

        {/* Dropdown trigger */}
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="w-full sm:w-auto min-w-[200px] justify-between gap-2"
            onClick={() => setIsOpen(!isOpen)}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
          >
            <span className="truncate">
              {currentEpisode
                ? `Эпизод ${currentEpisode.number}${currentEpisode.title ? `: ${currentEpisode.title}` : ""}`
                : "Выбрать эпизод"}
            </span>
            <svg className={`w-4 h-4 text-text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </Button>

          {/* Dropdown panel */}
          {isOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-surface border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-slide-up">
              <div className="p-3 border-b border-border">
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Поиск эпизода…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-control bg-bg text-text focus:border-accent focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="max-h-[400px] overflow-y-auto divide-y divide-border">
                {filteredEpisodes.length === 0 ? (
                  <div className="p-4 text-center text-text-muted text-sm">
                    Эпизоды не найдены
                  </div>
                ) : (
                  filteredEpisodes.map((ep) => (
                    <Link
                      key={ep.id}
                      href="#"
                      onClick={(e) => { e.preventDefault(); onChange(ep.id); setIsOpen(false); }}
                      className={`flex items-center gap-3 p-3 w-full text-left transition-colors ${ep.id === selectedEpisodeId ? "bg-accent/10" : "hover:bg-surface-muted"}`}
                    >
                      <span className="w-8 shrink-0 text-right text-sm tabular-nums text-text-muted">
                        {ep.number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-medium ${ep.is_available ? "text-text" : "text-text-muted"}`}>
                          {ep.title || `Эпизод ${ep.number}`}
                        </p>
                        {!ep.is_available && (
                          <span className="text-xs text-text-muted">Недоступен</span>
                        )}
                      </div>
                      {ep.id === selectedEpisodeId && (
                        <svg className="w-5 h-5 text-accent shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
                      )}
                    </Link>
                  ))
                )}
              </div>
              <div className="p-3 border-t border-border bg-surface/50 text-center text-xs text-text-muted">
                Всего эпизодов: {totalEpisodes ?? episodes.length}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}