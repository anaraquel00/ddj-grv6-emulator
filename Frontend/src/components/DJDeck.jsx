// src/components/DJDeck.jsx

import { Play, Pause, Disc } from 'lucide-react';
import Waveform from './Waveform';

export default function DJDeck({ 
  deckId, 
  state, 
  onTogglePlay, 
  onTriggerPad, 
  onSync, 
  stStyle 
}) {
  const isDeckA = deckId === 'A';

  return (
    <section className={`rounded-3xl ${stStyle.card} border p-5 flex flex-col justify-between relative`}>
      <div className={`absolute top-4 ${isDeckA ? 'left-4' : 'right-4'} flex items-center space-x-1.5`}>
        {isDeckA && <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"></div>}
        <span className="text-[10px] font-bold text-zinc-400">DECK {deckId}</span>
        {!isDeckA && <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"></div>}
      </div>

      <Waveform 
        isPlaying={state.isPlaying} 
        bpm={state.bpm} 
        pitch={state.pitch} 
        isDeckA={isDeckA} 
      />

      {/* JOG WHEEL */}
      <div className="flex justify-center my-6">
        <div 
          onClick={onTogglePlay}
          className="w-56 h-56 rounded-full bg-zinc-950 border-[6px] border-zinc-900 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] flex items-center justify-center relative cursor-pointer"
        >
          <div 
            className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center relative"
            style={{ transform: `rotate(${state.jogRotation}deg)` }}
          >
            <div className="absolute top-1 w-2.5 h-2.5 rounded-full bg-cyan-400"></div>
            <Disc className="w-10 h-10 text-zinc-600" />
          </div>
        </div>
      </div>

      {/* PERFORMANCE PADS */}
      <div className="mb-4">
        <div className="grid grid-cols-4 gap-2">
          {[...Array(8)].map((_, i) => (
            <button
              key={i}
              onClick={() => onTriggerPad(deckId, i)}
              className={`h-10 rounded-lg border font-black text-xs ${
                state.isPlaying ? `${stStyle.padOn} text-black` : 'bg-zinc-800/50 border-zinc-700/60 text-zinc-400'
              }`}
            >
              CUE {i+1}
            </button>
          ))}
        </div>
      </div>

      {/* TRANSPORTE */}
      <div className="flex items-center justify-between border-t border-zinc-800/80 pt-4">
        <button 
          onClick={onTogglePlay}
          className={`w-14 h-14 rounded-full flex items-center justify-center ${
            state.isPlaying ? 'bg-emerald-600 text-black' : 'bg-zinc-800 text-white'
          }`}
        >
          {state.isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
        </button>
        
        {!isDeckA && onSync && (
          <button onClick={() => onSync('B')} className="px-4 py-2 bg-cyan-500 text-black text-xs font-black rounded-lg">
            SYNC BEAT
          </button>
        )}
      </div>
    </section>
  );
}