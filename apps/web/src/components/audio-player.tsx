'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Pause, Play } from 'lucide-react';
import { fmtDuration } from '@/lib/format';
import { cn } from '@/lib/utils';

export function AudioPlayer({ src, className }: { src: string; className?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrent(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnd = () => setPlaying(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play();
      setPlaying(true);
    }
  }

  function cycleRate() {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  return (
    <div className={cn('flex items-center gap-3 rounded-lg border border-border bg-black/20 px-3 py-2', className)}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={toggle}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 cursor-pointer"
      >
        {playing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
      </button>
      <span className="font-mono-nums w-12 text-right text-xs text-muted-foreground">
        {fmtDuration(current)}
      </span>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={current}
        onChange={(e) => {
          const t = Number(e.target.value);
          if (audioRef.current) audioRef.current.currentTime = t;
          setCurrent(t);
        }}
        className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-[--primary]"
        style={{ accentColor: 'var(--primary)' }}
      />
      <span className="font-mono-nums w-12 text-xs text-muted-foreground">
        {fmtDuration(duration)}
      </span>
      <button
        onClick={cycleRate}
        className="font-mono-nums rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
      >
        {rate}×
      </button>
      <a
        href={src}
        download
        className="text-muted-foreground transition-colors hover:text-foreground"
        title="Download"
      >
        <Download className="size-4" />
      </a>
    </div>
  );
}
