import {  } from 'react';

export default function Waveform({ isPlaying, bpm, pitch, isDeckA }) {
  const strokeColor = isDeckA ? "#22d3ee" : "#22d3ee";
  const shadowColor = isDeckA ? "#f97316" : "#e11d48";
  const currentBpm = (bpm * (1 + pitch)).toFixed(1);

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-mono font-bold text-orange-500">{currentBpm} BPM</span>
      </div>
      
      <div className="h-12 bg-black/60 rounded-xl border border-zinc-800/80 overflow-hidden relative flex items-center">
        <svg className="w-full h-full" viewBox="0 0 400 60" preserveAspectRatio="none">
          <path 
            d={`M 0 30 Q 50 ${isPlaying ? '10' : '25'} 100 30 T 200 30 T 300 30 T 400 30`} 
            fill="none" 
            stroke={strokeColor} 
            strokeWidth="2.5" 
            className={isPlaying ? "animate-[dash_2s_linear_infinite]" : ""}
          />
          <path 
            d={`M 0 30 Q 30 50 120 30 T 240 30 T 360 30 T 400 30`} 
            fill="none" 
            stroke={shadowColor} 
            strokeWidth="1" 
            strokeDasharray="4 4"
          />
        </svg>
        <div className="absolute inset-0 flex justify-between pointer-events-none px-4">
          {[...Array(16)].map((_, i) => (
            <div key={i} className="w-[1px] h-full bg-zinc-800/50"></div>
          ))}
        </div>
        <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-red-600 shadow-[0_0_8px_red]"></div>
      </div>
    </div>
  );
}