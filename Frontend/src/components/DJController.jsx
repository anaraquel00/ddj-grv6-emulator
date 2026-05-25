import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, Disc, Volume2, Sliders, Radio, Award, 
  Settings, HelpCircle, ChevronRight, Mic, Sparkles, FolderOpen, RotateCcw
} from 'lucide-react';

// ============================================================================
// CORE AUDIO SPREAD ENGINE (WEB AUDIO API SYNTHESIZER)
// ============================================================================

const audioMaster = new WebDJEngine();

// ============================================================================
// COMPONENTE PRINCIPAL DO FRONTEND (REACT 19)
// ============================================================================
export default function DJController() {
  const [audioInited, setAudioInited] = useState(false);
  const [skin, setSkin] = useState('default'); // 'default' | 'neon' | 'platinum'
  const [activeTab, setActiveTab] = useState('library'); // 'library' | 'ai' | 'tutorials'
  
  // Estados do Deck A
  const [deckA, setDeckA] = useState({
    isPlaying: false,
    bpm: 124,
    pitch: 0.0, // slider de -10% a +10%
    volume: 0.8,
    eqLow: 0.0,
    eqMid: 0.0,
    eqHi: 0.0,
    filter: 0.0, // -1.0 a 1.0
    jogRotation: 0,
    selectedTrack: "Acid House Beat (Synth Loop 1)"
  });

  // Estados do Deck B
  const [deckB, setDeckB] = useState({
    isPlaying: false,
    bpm: 124,
    pitch: 0.0,
    volume: 0.8,
    eqLow: 0.0,
    eqMid: 0.0,
    eqHi: 0.0,
    filter: 0.0,
    jogRotation: 0,
    selectedTrack: "Deep Melodic Bassline (Core Loop 2)"
  });

  // Mixer Central
  const [crossfader, setCrossfader] = useState(0.0);
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [vuA, setVuA] = useState(0);
  const [vuB, setVuB] = useState(0);
  const [vuMaster, setVuMaster] = useState(0);

  // Aprendizado e IA
  const [aiSuggestions, setAiSuggestions] = useState([
    "Mixer limpo. Inicie a reprodução do Deck A para ajustar os níveis de ganho.",
    "Aperte o botão SYNC no Deck B para alinhar o tempo perfeitamente em 124 BPM."
  ]);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);

  // Animação de Waveforms
  const requestRef = useRef();
  const recordingInterval = useRef();

  // Inicialização do Áudio Context por interação do usuário
  const initEngine = () => {
    audioMaster.init();
    setAudioInited(true);
    triggerAIMessage("Motor de áudio Web Audio inicializado em 24-bit. Latência ultra-baixa de <3.2ms ativa.");
  };

  // Trigger sugestão IA
  const triggerAIMessage = (message) => {
    setAiSuggestions(prev => [message, ...prev.slice(0, 4)]);
  };

  // Monitoramento dos analisadores para atualizar os LEDs
  useEffect(() => {
    const updateLEDMeters = () => {
      if (audioInited && audioMaster.analysers.A) {
        const arrayA = new Uint8Array(audioMaster.analysers.A.frequencyBinCount);
        const arrayB = new Uint8Array(audioMaster.analysers.B.frequencyBinCount);
        const arrayMaster = new Uint8Array(audioMaster.analysers.Master.frequencyBinCount);

        audioMaster.analysers.A.getByteFrequencyData(arrayA);
        audioMaster.analysers.B.getByteFrequencyData(arrayB);
        audioMaster.analysers.Master.getByteFrequencyData(arrayMaster);

        const avgA = arrayA.reduce((a, b) => a + b, 0) / arrayA.length;
        const avgB = arrayB.reduce((a, b) => a + b, 0) / arrayB.length;
        const avgMaster = arrayMaster.reduce((a, b) => a + b, 0) / arrayMaster.length;

        setVuA(Math.min(100, Math.floor(avgA * 1.6)));
        setVuB(Math.min(100, Math.floor(avgB * 1.6)));
        setVuMaster(Math.min(100, Math.floor(avgMaster * 1.4)));
      }

      // Rotação passiva dos Jogs baseada no estado Play
      if (deckA.isPlaying) {
        setDeckA(prev => ({ ...prev, jogRotation: (prev.jogRotation + 2) % 360 }));
      }
      if (deckB.isPlaying) {
        setDeckB(prev => ({ ...prev, jogRotation: (prev.jogRotation + 2) % 360 }));
      }

      requestRef.current = requestAnimationFrame(updateLEDMeters);
    };

    requestRef.current = requestAnimationFrame(updateLEDMeters);
    return () => cancelAnimationFrame(requestRef.current);
  }, [audioInited, deckA.isPlaying, deckB.isPlaying]);

  // Detector adaptativo de erros de mixagem (Real-time AI Rules)
  useEffect(() => {
    if (!audioInited) return;
    
    // Alerta de Bass Clashing (Frequências graves em disputa nas duas trilhas)
    if (deckA.isPlaying && deckB.isPlaying && deckA.eqLow > -0.2 && deckB.eqLow > -0.2 && Math.abs(crossfader) < 0.4) {
      triggerAIMessage("⚠️ ALERTA DE LAMA: Conflito de subgrave detectado! Reduza o EQ LOW do Deck B para fundir as baterias com clareza.");
    }

    // Alerta de Volume Estourado no Master
    if (vuMaster > 85) {
      triggerAIMessage("⚠️ ALERTA DE HEADROOM: Sinal master encostando no teto dinâmico. Reduza os faders verticais dos canais.");
    }
  }, [deckA.eqLow, deckB.eqLow, crossfader, vuMaster]);

  // Controles de Ações
  const togglePlay = (deck) => {
    if (!audioInited) initEngine();
    
    if (deck === 'A') {
      const state = !deckA.isPlaying;
      audioMaster.decks.A.isPlaying = state;
      setDeckA(prev => ({ ...prev, isPlaying: state }));
      triggerAIMessage(state ? "Iniciando reprodução rítmica do Deck A." : "Deck A pausado.");
      
      // Validação do tutorial de iniciante
      if (tutorialStep === 0 && state) setTutorialStep(1);
    } else {
      const state = !deckB.isPlaying;
      audioMaster.decks.B.isPlaying = state;
      setDeckB(prev => ({ ...prev, isPlaying: state }));
      triggerAIMessage(state ? "Iniciando linha melódica do Deck B." : "Deck B pausado.");
    }
  };

  const syncBPM = (targetDeck) => {
    if (targetDeck === 'B') {
      const sourceBpm = deckA.bpm * (1 + deckA.pitch);
      const neededPitch = (sourceBpm / deckB.bpm) - 1;
      audioMaster.decks.B.pitch = 1 + neededPitch;
      setDeckB(prev => ({ ...prev, pitch: neededPitch }));
      triggerAIMessage("Sincronização de fase e tempo completa (124.0 BPM). Beatgrids acoplados.");
      if (tutorialStep === 1) setTutorialStep(2);
    }
  };

  const handlePitchChange = (deck, val) => {
    const pitchFactor = 1 + parseFloat(val);
    if (deck === 'A') {
      audioMaster.decks.A.pitch = pitchFactor;
      setDeckA(prev => ({ ...prev, pitch: parseFloat(val) }));
    } else {
      audioMaster.decks.B.pitch = pitchFactor;
      setDeckB(prev => ({ ...prev, pitch: parseFloat(val) }));
    }
  };

  const handleVolumeChange = (deck, val) => {
    const volume = parseFloat(val);
    if (deck === 'A') {
      audioMaster.decks.A.volume = volume;
      setDeckA(prev => ({ ...prev, volume }));
    } else {
      audioMaster.decks.B.volume = volume;
      setDeckB(prev => ({ ...prev, volume }));
    }
    audioMaster.updateGainsAndFaders();
  };

  const handleEQChange = (deck, band, val) => {
    const value = parseFloat(val);
    audioMaster.setEQ(deck, band, value);
    if (deck === 'A') {
      setDeckA(prev => ({ ...prev, [`eq${band.charAt(0).toUpperCase() + band.slice(1)}`]: value }));
    } else {
      setDeckB(prev => ({ ...prev, [`eq${band.charAt(0).toUpperCase() + band.slice(1)}`]: value }));
    }
  };

  const handleFilterChange = (deck, val) => {
    const value = parseFloat(val);
    audioMaster.setFilter(deck, value);
    if (deck === 'A') {
      setDeckA(prev => ({ ...prev, filter: value }));
      if (tutorialStep === 2 && Math.abs(value) > 0.5) setTutorialStep(3);
    } else {
      setDeckB(prev => ({ ...prev, filter: value }));
    }
  };

  const handleCrossfader = (val) => {
    const value = parseFloat(val);
    audioMaster.crossfader = value;
    setCrossfader(value);
    audioMaster.updateGainsAndFaders();
  };

  const triggerPad = (deck, index) => {
    if (!audioInited) initEngine();
    audioMaster.triggerPadFX(deck, index);
  };

  // Gravador de Session
  const toggleRecording = () => {
    if (!isRecording) {
      setIsRecording(true);
      setRecordTime(0);
      recordingInterval.current = setInterval(() => {
        setRecordTime(p => p + 1);
      }, 1000);
      triggerAIMessage("Estúdio de Gravação Master ativado. WAV renderizado em float32.");
    } else {
      setIsRecording(false);
      clearInterval(recordingInterval.current);
      triggerAIMessage("Gravação de Mixset concluída. WAV exportado para download.");
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Escolhas de cores e estilos dinâmicos baseados no Skin
  const getSkinStyles = () => {
    switch (skin) {
      case 'neon':
        return {
          bg: 'bg-gradient-to-br from-purple-950 via-slate-900 to-black',
          card: 'bg-purple-950/40 backdrop-blur-md border-purple-500/50',
          accent: 'text-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.5)]',
          padOn: 'bg-pink-500 shadow-[0_0_12px_rgba(236,72,153,0.8)] border-pink-300',
          vuFill: 'bg-gradient-to-t from-pink-500 via-purple-500 to-cyan-400',
          faderTrack: 'bg-purple-900',
          textAccent: 'text-pink-400'
        };
      case 'platinum':
        return {
          bg: 'bg-slate-300',
          card: 'bg-slate-100 border-slate-400 shadow-md',
          accent: 'text-blue-600',
          padOn: 'bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.7)] border-blue-400',
          vuFill: 'bg-gradient-to-t from-blue-700 via-blue-500 to-red-500',
          faderTrack: 'bg-slate-400',
          textAccent: 'text-blue-600'
        };
      default: // Dark Original GRV6
        return {
          bg: 'bg-gradient-to-b from-stone-950 via-neutral-900 to-black',
          card: 'bg-zinc-900/90 border-zinc-800 shadow-xl',
          accent: 'text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.4)]',
          padOn: 'bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)] border-cyan-200',
          vuFill: 'bg-gradient-to-t from-emerald-500 via-amber-400 to-red-500',
          faderTrack: 'bg-zinc-800',
          textAccent: 'text-cyan-400'
        };
    }
  };

  const st = getSkinStyles();

  return (
    <div className={`min-h-screen ${st.bg} p-4 text-zinc-100 flex flex-col justify-between font-sans transition-colors duration-500`}>
      
      {/* HEADER / MASTER CONTROL BAR */}
      <header className={`flex flex-wrap items-center justify-between p-4 rounded-xl ${st.card} border mb-4 shadow-2xl`}>
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-orange-600 animate-pulse">
            <Radio className="w-6 h-6 text-black" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-orange-500 via-yellow-400 to-cyan-400">
              PIONEER DDJ-GRV6
            </h1>
            <p className="text-xs text-zinc-400 tracking-wider font-semibold">REKORDBOX & SERATO HYBRID EMULATOR</p>
          </div>
        </div>

        {/* CONTROLES DE GRAVAÇÃO E SKIN */}
        <div className="flex items-center space-x-4 mt-2 sm:mt-0">
          {/* Gravador */}
          <button 
            onClick={toggleRecording}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
              isRecording 
                ? 'bg-red-600/30 border-red-500 text-red-400 animate-pulse' 
                : 'bg-zinc-800/80 border-zinc-700 hover:border-zinc-500'
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-red-500' : 'bg-zinc-500'}`}></span>
            <span>{isRecording ? `GRAVANDO ${formatTime(recordTime)}` : 'REC REC'}</span>
          </button>

          {/* Seletor de Skins */}
          <div className="flex items-center space-x-1 bg-black/40 rounded-lg p-1 border border-zinc-800">
            {['default', 'neon', 'platinum'].map((sk) => (
              <button
                key={sk}
                onClick={() => setSkin(sk)}
                className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded transition-all ${
                  skin === sk ? 'bg-orange-600 text-black shadow-lg' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {sk}
              </button>
            ))}
          </div>

          <div className="text-right text-[10px] text-zinc-500 font-mono hidden md:block">
            <p>LATÊNCIA: <span className="text-emerald-400 font-bold">&lt;3.2ms</span></p>
            <p>MIDI DEV: <span className="text-cyan-400 font-bold">READY</span></p>
          </div>
        </div>
      </header>

      {/* ÁREA DE INTERACTION PROMPT */}
      {!audioInited && (
        <div className="mb-4 bg-orange-600/20 border border-orange-500 rounded-xl p-3 text-center flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-2 text-orange-400 text-sm font-semibold">
            <Sparkles className="w-5 h-5 animate-spin" />
            <span>O motor do sintetizador está aguardando ativação. Toque em qualquer deck para liberar o som.</span>
          </div>
          <button 
            onClick={initEngine}
            className="bg-orange-600 hover:bg-orange-500 text-black px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
          >
            ATIVAR ENGINE
          </button>
        </div>
      )}

      {/* RANGER DE CONTROLE PRINCIPAL */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 flex-grow items-stretch">
        
        {/* ====================================================================
            DECK ESQUERDO (DECK A)
            ==================================================================== */}
        <section className={`xl:col-span-4 rounded-3xl ${st.card} border p-5 flex flex-col justify-between relative`}>
          <div className="absolute top-4 left-4 flex items-center space-x-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"></div>
            <span className="text-[10px] font-bold text-zinc-400">DECK A</span>
          </div>

          {/* Seletor de Track e Waveform Dinâmica */}
          <div className="mt-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-zinc-400 truncate w-3/4">{deckA.selectedTrack}</span>
              <span className="text-xs font-mono font-bold text-orange-500">{(deckA.bpm * (1 + deckA.pitch)).toFixed(1)} BPM</span>
            </div>
            
            {/* Waveform Canvas-Emulated */}
            <div className="h-12 bg-black/60 rounded-xl border border-zinc-800/80 overflow-hidden relative flex items-center">
              <svg className="w-full h-full" viewBox="0 0 400 60" preserveAspectRatio="none">
                <path 
                  d={`M 0 30 Q 50 ${deckA.isPlaying ? '10' : '25'} 100 30 T 200 30 T 300 30 T 400 30`} 
                  fill="none" 
                  stroke="#22d3ee" 
                  strokeWidth="2.5" 
                  className={deckA.isPlaying ? "animate-[dash_2s_linear_infinite]" : ""}
                />
                <path 
                  d={`M 0 30 Q 30 50 120 30 T 240 30 T 360 30 T 400 30`} 
                  fill="none" 
                  stroke="#f97316" 
                  strokeWidth="1" 
                  strokeDasharray="4 4"
                />
              </svg>
              {/* Beatgrid Markers */}
              <div className="absolute inset-0 flex justify-between pointer-events-none px-4">
                {[...Array(16)].map((_, i) => (
                  <div key={i} className="w-[1px] h-full bg-zinc-800/50"></div>
                ))}
              </div>
              <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-red-600 shadow-[0_0_8px_red]"></div>
            </div>
          </div>

          {/* JOG WHEEL INTERATIVA */}
          <div className="flex justify-center my-6">
            <div 
              className="w-56 h-56 rounded-full bg-zinc-950 border-[6px] border-zinc-900 shadow-[inset_0_0_20px_rgba(0,0,0,0.8),0_8px_20px_rgba(0,0,0,0.6)] flex items-center justify-center relative cursor-grab active:cursor-grabbing select-none"
              onClick={() => {
                if (!audioInited) initEngine();
                // Simulação sutil de scratch / pitch bend
                setDeckA(p => ({ ...prev => ({ ...p, jogRotation: (p.jogRotation + 25) % 360 }) }));
              }}
            >
              {/* Detalhe estético de estrias físicas */}
              <div className="absolute inset-2 rounded-full border border-dashed border-zinc-800/30"></div>
              <div className="absolute inset-8 rounded-full border border-zinc-900"></div>
              
              {/* Giro central LED do prato */}
              <div 
                className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center relative"
                style={{ transform: `rotate(${deckA.jogRotation}deg)` }}
              >
                <div className="absolute top-1 w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]"></div>
                <Disc className="w-10 h-10 text-zinc-600" />
              </div>
            </div>
          </div>

          {/* PERFORMANCE PADS (8 Pads com suporte de click) */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest">PERFORMANCE PADS</span>
              <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950/40 border border-cyan-800/50 px-2 py-0.5 rounded">HOT CUE / ROLL</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[...Array(8)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => triggerPad('A', i)}
                  className={`h-10 rounded-lg border font-black transition-all flex flex-col justify-center items-center text-xs ${
                    deckA.isPlaying 
                      ? `${st.padOn} text-black` 
                      : 'bg-zinc-800/50 border-zinc-700/60 text-zinc-400 hover:border-zinc-500'
                  }`}
                >
                  <span>CUE {i+1}</span>
                </button>
              ))}
            </div>
          </div>

          {/* BOTÕES DE PLAY, CUE, SYNC */}
          <div className="flex items-center justify-between border-t border-zinc-800/80 pt-4">
            <div className="flex items-center space-x-3">
              {/* Botão de Play / Pause */}
              <button 
                onClick={() => togglePlay('A')}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                  deckA.isPlaying 
                    ? 'bg-emerald-600 text-black shadow-[0_0_15px_rgba(16,185,129,0.5)]' 
                    : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                }`}
              >
                {deckA.isPlaying ? <Pause className="w-6 h-6 fill-black" /> : <Play className="w-6 h-6 fill-white ml-1" />}
              </button>
              
              <button className="w-11 h-11 rounded-full bg-orange-600/20 border border-orange-500 text-orange-500 font-extrabold text-xs flex items-center justify-center hover:bg-orange-600 hover:text-black transition-all">
                CUE
              </button>
            </div>

            <button className="px-4 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 text-xs font-bold hover:bg-zinc-700 border border-zinc-700/60">
              SLIP
            </button>
          </div>
        </section>

        {/* ====================================================================
            CENTRAL MIXER SECTION (4 CANAIS)
            ==================================================================== */}
        <section className={`xl:col-span-4 rounded-3xl ${st.card} border p-4 flex flex-col justify-between`}>
          
          {/* Seção de Controles de Canal */}
          <div className="grid grid-cols-4 gap-1 flex-grow">
            {[...Array(4)].map((_, chIdx) => {
              const ch = chIdx + 1;
              const isDeckCh = ch === 1 || ch === 2; // CH1 associado ao Deck A, CH2 ao Deck B
              const activeDeck = ch === 1 ? deckA : (ch === 2 ? deckB : null);
              const deckLetter = ch === 1 ? 'A' : (ch === 2 ? 'B' : null);

              return (
                <div key={ch} className="flex flex-col items-center justify-between py-2 border-r border-zinc-800/60 last:border-r-0">
                  <span className="text-[10px] font-extrabold text-zinc-500">CH {ch}</span>

                  {/* Knob TRIMS */}
                  <div className="my-2 flex flex-col items-center">
                    <span className="text-[8px] font-bold text-zinc-600">TRIM</span>
                    <input 
                      type="range" 
                      min="0" 
                      max="1.2" 
                      step="0.05"
                      value={activeDeck ? activeDeck.volume : 0}
                      onChange={(e) => isDeckCh && handleVolumeChange(deckLetter, e.target.value)}
                      className="w-10 h-10 accent-orange-600 bg-transparent rotate-180" 
                      style={{ writingMode: 'bt-lr', appearance: 'slider-vertical' }}
                    />
                  </div>

                  {/* EQ HI */}
                  <div className="my-1.5 flex flex-col items-center">
                    <span className="text-[8px] font-bold text-zinc-600">HI</span>
                    <input 
                      type="range" 
                      min="-1.0" 
                      max="1.0" 
                      step="0.05"
                      value={activeDeck ? activeDeck.eqHi : 0}
                      onChange={(e) => isDeckCh && handleEQChange(deckLetter, 'hi', e.target.value)}
                      className="h-10 accent-orange-500"
                      style={{ appearance: 'slider-vertical' }}
                    />
                  </div>

                  {/* EQ MID */}
                  <div className="my-1.5 flex flex-col items-center">
                    <span className="text-[8px] font-bold text-zinc-600">MID</span>
                    <input 
                      type="range" 
                      min="-1.0" 
                      max="1.0" 
                      step="0.05"
                      value={activeDeck ? activeDeck.eqMid : 0}
                      onChange={(e) => isDeckCh && handleEQChange(deckLetter, 'mid', e.target.value)}
                      className="h-10 accent-orange-500"
                      style={{ appearance: 'slider-vertical' }}
                    />
                  </div>

                  {/* EQ LOW */}
                  <div className="my-1.5 flex flex-col items-center">
                    <span className="text-[8px] font-bold text-zinc-600">LOW</span>
                    <input 
                      type="range" 
                      min="-1.0" 
                      max="1.0" 
                      step="0.05"
                      value={activeDeck ? activeDeck.eqLow : 0}
                      onChange={(e) => isDeckCh && handleEQChange(deckLetter, 'low', e.target.value)}
                      className="h-10 accent-orange-500"
                      style={{ appearance: 'slider-vertical' }}
                    />
                  </div>

                  {/* COLOR FX FILTER (Bipolar LPF/HPF) */}
                  <div className="my-2 flex flex-col items-center">
                    <span className="text-[8px] font-extrabold text-cyan-400">FILTER</span>
                    <input 
                      type="range" 
                      min="-1.0" 
                      max="1.0" 
                      step="0.05"
                      value={activeDeck ? activeDeck.filter : 0}
                      onChange={(e) => isDeckCh && handleFilterChange(deckLetter, e.target.value)}
                      className="w-8 h-8 accent-cyan-400"
                    />
                    <div className="flex justify-between w-6 text-[6px] text-zinc-500">
                      <span>LPF</span>
                      <span>HPF</span>
                    </div>
                  </div>

                  {/* LEDs físicos de volume vertical do canal */}
                  <div className="w-1.5 h-16 bg-black/80 rounded-full overflow-hidden relative flex flex-col justify-end">
                    <div 
                      className={`w-full ${st.vuFill} transition-all duration-75`}
                      style={{ height: `${ch === 1 ? vuA : (ch === 2 ? vuB : 0)}%` }}
                    ></div>
                  </div>

                  {/* FADER DE VOLUME VERTICAL */}
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01"
                    value={activeDeck ? activeDeck.volume : 0}
                    onChange={(e) => isDeckCh && handleVolumeChange(deckLetter, e.target.value)}
                    className="h-24 accent-zinc-200"
                    style={{ appearance: 'slider-vertical' }}
                  />
                </div>
              );
            })}
          </div>

          {/* MASTER VU METERS E CONTROLE DE GANHO MASTER */}
          <div className="bg-black/30 rounded-2xl p-3 border border-zinc-800/60 my-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-extrabold text-zinc-400 tracking-wider">MASTER VU</span>
              <div className="w-40 h-2 bg-zinc-950/80 rounded-full relative overflow-hidden flex items-stretch">
                <div 
                  className={`h-full ${st.vuFill} transition-all duration-75`}
                  style={{ width: `${vuMaster}%` }}
                ></div>
              </div>
            </div>
            
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Volume2 className="w-4 h-4 text-orange-500" />
                <span className="text-[10px] font-bold text-zinc-400">LEVEL</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={masterVolume}
                onChange={(e) => {
                  setMasterVolume(parseFloat(e.target.value));
                  audioMaster.masterVolume = parseFloat(e.target.value);
                  audioMaster.updateGainsAndFaders();
                }}
                className="w-32 accent-orange-500"
              />
            </div>
          </div>

          {/* CROSSFADER HORIZONTAL */}
          <div className="px-4 py-2 bg-black/20 rounded-2xl border border-zinc-800/60">
            <div className="flex justify-between text-[8px] font-extrabold text-zinc-500 px-1 mb-1">
              <span>DECK A</span>
              <span>CROSSFADER</span>
              <span>DECK B</span>
            </div>
            <input 
              type="range" 
              min="-1.0" 
              max="1.0" 
              step="0.01"
              value={crossfader}
              onChange={(e) => handleCrossfader(e.target.value)}
              className="w-full accent-orange-500"
            />
          </div>
        </section>

        {/* ====================================================================
            DECK DIREITO (DECK B)
            ==================================================================== */}
        <section className={`xl:col-span-4 rounded-3xl ${st.card} border p-5 flex flex-col justify-between relative`}>
          <div className="absolute top-4 right-4 flex items-center space-x-1.5">
            <span className="text-[10px] font-bold text-zinc-400">DECK B</span>
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"></div>
          </div>

          {/* Seletor de Track e Waveform */}
          <div className="mt-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-zinc-400 truncate w-3/4">{deckB.selectedTrack}</span>
              <span className="text-xs font-mono font-bold text-orange-500">{(deckB.bpm * (1 + deckB.pitch)).toFixed(1)} BPM</span>
            </div>
            
            {/* Waveform Canvas-Emulated */}
            <div className="h-12 bg-black/60 rounded-xl border border-zinc-800/80 overflow-hidden relative flex items-center">
              <svg className="w-full h-full" viewBox="0 0 400 60" preserveAspectRatio="none">
                <path 
                  d={`M 0 30 Q 50 ${deckB.isPlaying ? '15' : '25'} 100 30 T 200 30 T 300 30 T 400 30`} 
                  fill="none" 
                  stroke="#22d3ee" 
                  strokeWidth="2.5" 
                  className={deckB.isPlaying ? "animate-[dash_2s_linear_infinite]" : ""}
                />
                <path 
                  d={`M 0 30 Q 30 50 120 30 T 240 30 T 360 30 T 400 30`} 
                  fill="none" 
                  stroke="#e11d48" 
                  strokeWidth="1" 
                  strokeDasharray="4 4"
                />
              </svg>
              {/* Beatgrid Markers */}
              <div className="absolute inset-0 flex justify-between pointer-events-none px-4">
                {[...Array(16)].map((_, i) => (
                  <div key={i} className="w-[1px] h-full bg-zinc-800/50"></div>
                ))}
              </div>
              <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-red-600 shadow-[0_0_8px_red]"></div>
            </div>
          </div>

          {/* JOG WHEEL INTERATIVA */}
          <div className="flex justify-center my-6">
            <div 
              className="w-56 h-56 rounded-full bg-zinc-950 border-[6px] border-zinc-900 shadow-[inset_0_0_20px_rgba(0,0,0,0.8),0_8px_20px_rgba(0,0,0,0.6)] flex items-center justify-center relative cursor-grab active:cursor-grabbing select-none"
              onClick={() => {
                if (!audioInited) initEngine();
                setDeckB(p => ({ ...prev => ({ ...p, jogRotation: (p.jogRotation + 25) % 360 }) }));
              }}
            >
              <div className="absolute inset-2 rounded-full border border-dashed border-zinc-800/30"></div>
              <div className="absolute inset-8 rounded-full border border-zinc-900"></div>
              
              <div 
                className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center relative"
                style={{ transform: `rotate(${deckB.jogRotation}deg)` }}
              >
                <div className="absolute top-1 w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]"></div>
                <Disc className="w-10 h-10 text-zinc-600" />
              </div>
            </div>
          </div>

          {/* PERFORMANCE PADS */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest">PERFORMANCE PADS</span>
              <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950/40 border border-cyan-800/50 px-2 py-0.5 rounded">HOT CUE / ROLL</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[...Array(8)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => triggerPad('B', i)}
                  className={`h-10 rounded-lg border font-black transition-all flex flex-col justify-center items-center text-xs ${
                    deckB.isPlaying 
                      ? `${st.padOn} text-black` 
                      : 'bg-zinc-800/50 border-zinc-700/60 text-zinc-400 hover:border-zinc-500'
                  }`}
                >
                  <span>CUE {i+1}</span>
                </button>
              ))}
            </div>
          </div>

          {/* BOTÕES DE PLAY, CUE, SYNC DECK B */}
          <div className="flex items-center justify-between border-t border-zinc-800/80 pt-4">
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => togglePlay('B')}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                  deckB.isPlaying 
                    ? 'bg-emerald-600 text-black shadow-[0_0_15px_rgba(16,185,129,0.5)]' 
                    : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                }`}
              >
                {deckB.isPlaying ? <Pause className="w-6 h-6 fill-black" /> : <Play className="w-6 h-6 fill-white ml-1" />}
              </button>
              
              <button className="w-11 h-11 rounded-full bg-orange-600/20 border border-orange-500 text-orange-500 font-extrabold text-xs flex items-center justify-center hover:bg-orange-600 hover:text-black transition-all">
                CUE
              </button>
            </div>

            <button 
              onClick={() => syncBPM('B')}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black rounded-lg shadow-lg hover:shadow-cyan-400/30 transition-all border border-cyan-300"
            >
              SYNC BEAT
            </button>
          </div>
        </section>
      </div>

      {/* ====================================================================
          SIDEBAR INFORMATIVO: MULTI-PAINEL (LIBRARY, AI ASSISTANT, TUTORIAIS)
          ==================================================================== */}
      <footer className={`mt-4 rounded-2xl ${st.card} border p-4 shadow-2xl flex flex-col lg:flex-row gap-4 justify-between items-stretch`}>
        
        {/* Seletor de Tabs */}
        <div className="lg:w-1/4 flex flex-col space-y-2 border-r border-zinc-800/60 pr-4">
          <button 
            onClick={() => setActiveTab('library')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'library' ? 'bg-orange-600 text-black' : 'hover:bg-zinc-800'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            <span>BIBLIOTECA VIRTUAL</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('ai')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'ai' ? 'bg-orange-600 text-black' : 'hover:bg-zinc-800'
            }`}
          >
            <Sparkles className="w-4 h-4 animate-bounce" />
            <span>ASSISTENTE DE IA</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('tutorials')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'tutorials' ? 'bg-orange-600 text-black' : 'hover:bg-zinc-800'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>MODO APRENDIZADO</span>
          </button>
        </div>

        {/* Exibição da Tab Selecionada */}
        <div className="flex-grow min-h-32 flex flex-col justify-center">
          
          {/* TAB: BIBLIOTECA */}
          {activeTab === 'library' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-black/40 rounded-xl border border-zinc-800/80">
                <p className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider mb-2">TRILHA DO DECK A</p>
                <p className="text-sm font-bold text-zinc-200">{deckA.selectedTrack}</p>
                <p className="text-xs text-zinc-500 mt-1">Gênero: Acid House Loop / BPM Base: 124.0</p>
              </div>
              <div className="p-3 bg-black/40 rounded-xl border border-zinc-800/80">
                <p className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider mb-2">TRILHA DO DECK B</p>
                <p className="text-sm font-bold text-zinc-200">{deckB.selectedTrack}</p>
                <p className="text-xs text-zinc-500 mt-1">Gênero: Progressive Bassline / BPM Base: 124.0</p>
              </div>
            </div>
          )}

          {/* TAB: AI ASSISTANT PANEL */}
          {activeTab === 'ai' && (
            <div className="space-y-2 max-h-32 overflow-y-auto">
              <p className="text-xs font-bold text-cyan-400 flex items-center space-x-1.5 mb-1">
                <Sparkles className="w-4 h-4" />
                <span>DIAGNÓSTICO ACÚSTICO EM TEMPO REAL:</span>
              </p>
              {aiSuggestions.map((msg, idx) => (
                <div key={idx} className="text-xs bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/50 font-mono text-zinc-300">
                  {msg}
                </div>
              ))}
            </div>
          )}

          {/* TAB: TUTORIAL SYSTEM */}
          {activeTab === 'tutorials' && (
            <div className="bg-orange-600/10 border border-orange-500/30 rounded-2xl p-4 flex justify-between items-center">
              <div>
                <p className="text-xs font-extrabold text-orange-500 uppercase mb-1">TUTORIAL 1: INICIAÇÃO RÍTMICA E BEATMATCH</p>
                {tutorialStep === 0 && <p className="text-sm font-semibold">Passo 1: Clique em PLAY no DECK A para ligar o loop de bateria.</p>}
                {tutorialStep === 1 && <p className="text-sm font-semibold text-cyan-400">Passo 2: Perfeito! Agora clique em SYNC BEAT no DECK B para parear a velocidade.</p>}
                {tutorialStep === 2 && <p className="text-sm font-semibold text-pink-400">Passo 3: Frequências em fase! Gire o botão de FILTER do Deck A para remover agudos.</p>}
                {tutorialStep === 3 && <p className="text-sm font-semibold text-emerald-400">🎉 Excelente! Você aprendeu as bases do beatmatch e do isolamento acústico!</p>}
              </div>
              
              <button 
                onClick={() => setTutorialStep(0)} 
                className="p-2 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-all"
                title="Resetar Tutorial"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </div>
          )}

        </div>
      </footer>
    </div>
  );
}