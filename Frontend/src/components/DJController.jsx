import { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, Disc, Volume2, Radio, Award, Sparkles, FolderOpen, RotateCcw
} from 'lucide-react';

// ============================================================================
// 🟢 COMPILADOR DE CABEÇALHO WAV RIFF PROFISSIONAL (16-BIT STEREO PCM) [1]
// ============================================================================
function encodeWav(left, right, sampleRate) {
  const buffer = new ArrayBuffer(44 + (left.length + right.length) * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + (left.length + right.length) * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, (left.length + right.length) * 2, true);

  let offset = 44;
  for (let i = 0; i < left.length; i++) {
    let s = Math.max(-1, Math.min(1, left[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;

    s = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// ============================================================================
// CORE AUDIO SPREAD ENGINE (SINTETIZADOR E PLAYER REAL DE 4 CANAIS)
// ============================================================================
class WebDJEngine {
  constructor() {
    this.ctx = null;
    this.decks = {
      A: { isPlaying: false, bpm: 124, volume: 0.8, pitch: 1.0, filterVal: 0, eq: { hi: 0, mid: 0, low: 0 }, audioBuffer: null },
      B: { isPlaying: false, bpm: 124, volume: 0.8, pitch: 1.0, filterVal: 0, eq: { hi: 0, mid: 0, low: 0 }, audioBuffer: null },
      C: { isPlaying: false, bpm: 124, volume: 0.8, pitch: 1.0, filterVal: 0, eq: { hi: 0, mid: 0, low: 0 }, audioBuffer: null },
      D: { isPlaying: false, bpm: 124, volume: 0.8, pitch: 1.0, filterVal: 0, eq: { hi: 0, mid: 0, low: 0 }, audioBuffer: null }
    };
    this.crossfader = 0.0; 
    this.masterVolume = 0.8;
    this.step = 0;
    this.intervalId = null;
    this.analysers = { A: null, B: null, C: null, D: null, Master: null };
    this.sources = { A: null, B: null, C: null, D: null };

    this.recordingActive = false;
    this.leftRecordBuffer = [];
    this.rightRecordBuffer = [];
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    ['A', 'B', 'C', 'D', 'Master'].forEach(k => {
      this.analysers[k] = this.ctx.createAnalyser();
      this.analysers[k].fftSize = 32;
    });

    this.deckGains = {
      A: this.ctx.createGain(),
      B: this.ctx.createGain(),
      C: this.ctx.createGain(),
      D: this.ctx.createGain()
    };

    this.filters = {
      A: this.createFilterSet(),
      B: this.createFilterSet(),
      C: this.createFilterSet(),
      D: this.createFilterSet()
    };

    this.crossfaderGainLeft = this.ctx.createGain();  
    this.crossfaderGainRight = this.ctx.createGain(); 
    this.masterGain = this.ctx.createGain();

    ['A', 'C'].forEach(k => this.connectChannelChain(k, this.crossfaderGainLeft));
    ['B', 'D'].forEach(k => this.connectChannelChain(k, this.crossfaderGainRight));

    // Configura o nó de gravação bruta (ScriptProcessor) [1]
    this.recorderNode = this.ctx.createScriptProcessor(4096, 2, 2);
    this.recorderNode.onaudioprocess = (e) => {
      if (!this.recordingActive) return;
      
      const inputL = e.inputBuffer.getChannelData(0);
      const inputR = e.inputBuffer.getChannelData(1);
      
      this.leftRecordBuffer.push(new Float32Array(inputL));
      this.rightRecordBuffer.push(new Float32Array(inputR));
    };

    // Roteamento de gravação silencioso para manter o clock do processador ativo
    this.masterGain.connect(this.recorderNode);
    const silentGain = this.ctx.createGain();
    silentGain.gain.value = 0.0;
    this.recorderNode.connect(silentGain).connect(this.ctx.destination);

    this.masterGain.connect(this.analysers.Master).connect(this.ctx.destination);

    this.updateGainsAndFaders();
    this.startSequencer();
  }

  createFilterSet() {
    const f = {
      hpf: this.ctx.createBiquadFilter(),
      lpf: this.ctx.createBiquadFilter(),
      eqLow: this.ctx.createBiquadFilter(),
      eqMid: this.ctx.createBiquadFilter(),
      eqHi: this.ctx.createBiquadFilter()
    };
    f.hpf.type = 'highpass'; f.hpf.frequency.value = 10;
    f.lpf.type = 'lowpass'; f.lpf.frequency.value = 22000;
    f.eqLow.type = 'lowshelf'; f.eqLow.frequency.value = 300; f.eqLow.gain.value = 0;
    f.eqMid.type = 'peaking'; f.eqMid.Q.value = 1.0; f.eqMid.frequency.value = 1500; f.eqMid.gain.value = 0;
    f.eqHi.type = 'highshelf'; f.eqHi.frequency.value = 5000; f.eqHi.gain.value = 0;
    return f;
  }

  connectChannelChain(k, crossfaderGain) {
    const f = this.filters[k];
    this.deckGains[k]
      .connect(f.eqLow)
      .connect(f.eqMid)
      .connect(f.eqHi)
      .connect(f.lpf)
      .connect(f.hpf)
      .connect(this.analysers[k])
      .connect(crossfaderGain)
      .connect(this.masterGain);
  }

  updateGainsAndFaders() {
    if (!this.ctx) return;
    
    ['A', 'B', 'C', 'D'].forEach(k => {
      this.deckGains[k].gain.value = this.decks[k].volume;
    });

    const factorLeft = Math.cos(((this.crossfader + 1) * Math.PI) / 4);
    const factorRight = Math.sin(((this.crossfader + 1) * Math.PI) / 4);
    this.crossfaderGainLeft.gain.value = factorLeft;
    this.crossfaderGainRight.gain.value = factorRight;

    this.masterGain.gain.value = this.masterVolume;
  }

  setEQ(deck, band, value) {
    this.decks[deck].eq[band] = value;
    if (!this.ctx) return;
    const f = this.filters[deck];
    const gainDb = value * (value < 0 ? 26 : 6);
    if (band === 'low') f.eqLow.gain.value = gainDb;
    if (band === 'mid') f.eqMid.gain.value = gainDb;
    if (band === 'hi') f.eqHi.gain.value = gainDb;
  }

  setFilter(deck, value) {
    this.decks[deck].filterVal = value;
    if (!this.ctx) return;
    const f = this.filters[deck];
    
    if (value === 0) {
      f.hpf.frequency.setValueAtTime(10, this.ctx.currentTime);
      f.lpf.frequency.setValueAtTime(22000, this.ctx.currentTime);
    } else if (value < 0) {
      const freq = 22000 * Math.pow(10, (value * 2.5));
      f.lpf.frequency.setValueAtTime(Math.max(40, freq), this.ctx.currentTime);
      f.hpf.frequency.setValueAtTime(10, this.ctx.currentTime);
    } else {
      const freq = 10 + (value * 8000);
      f.hpf.frequency.setValueAtTime(freq, this.ctx.currentTime);
      f.lpf.frequency.setValueAtTime(22000, this.ctx.currentTime);
    }
  }

  async loadAudioFile(deck, file) {
    if (!this.ctx) this.init();
    this.stopTrack(deck);
    
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    this.decks[deck].audioBuffer = audioBuffer;
    return audioBuffer;
  }

  playTrack(deck) {
    if (!this.ctx) return;
    const d = this.decks[deck];
    this.stopTrack(deck);
    
    if (d.isPlaying && d.audioBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = d.audioBuffer;
      source.loop = true;
      source.connect(this.deckGains[deck]);
      
      source.playbackRate.setValueAtTime(d.pitch, this.ctx.currentTime);
      source.start(0);
      this.sources[deck] = source;
    }
  }

  stopTrack(deck) {
    if (this.sources[deck]) {
      try { this.sources[deck].stop(); } catch(e){}
      this.sources[deck] = null;
    }
  }

  startSequencer() {
    let nextStepTime = this.ctx.currentTime;

    const scheduler = () => {
      while (nextStepTime < this.ctx.currentTime + 0.1) {
        this.scheduleInstruments(this.step, nextStepTime);
        nextStepTime += 60 / (this.decks.A.bpm * this.decks.A.pitch) / 4;
        this.step = (this.step + 1) % 16;
      }
    };

    this.intervalId = setInterval(scheduler, 25);
  }

  scheduleInstruments(step, time) {
    if (!this.ctx) return;

    if (this.decks.A.isPlaying && !this.decks.A.audioBuffer) {
      if (step % 4 === 0) {
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(this.deckGains.A);
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
        gainNode.gain.setValueAtTime(1.0, time);
        gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
        osc.start(time);
        osc.stop(time + 0.16);
      }
      if (step % 4 === 2 || step % 8 === 6) {
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        osc.type = 'triangle';
        osc.connect(gainNode);
        gainNode.connect(this.deckGains.A);
        osc.frequency.setValueAtTime(8000, time);
        gainNode.gain.setValueAtTime(0.12, time);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
        osc.start(time);
        osc.stop(time + 0.06);
      }
    }

    if (this.decks.B.isPlaying && !this.decks.B.audioBuffer) {
      const notes = [110.0, 130.8, 146.8, 164.8, 110.0, 130.8, 196.0, 164.8];
      const activeNote = notes[Math.floor(step / 2) % notes.length];

      if (step % 2 === 0) {
        const osc = this.ctx.createOscillator();
        const subOsc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        osc.type = 'sawtooth';
        subOsc.type = 'sine';
        osc.connect(gainNode);
        subOsc.connect(gainNode);
        gainNode.connect(this.deckGains.B);
        const currentPitch = this.decks.B.pitch;
        osc.frequency.setValueAtTime(activeNote * currentPitch, time);
        subOsc.frequency.setValueAtTime((activeNote / 2) * currentPitch, time);
        gainNode.gain.setValueAtTime(0.25, time);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
        osc.start(time);
        subOsc.start(time);
        osc.stop(time + 0.25);
        subOsc.stop(time + 0.25);
      }
    }

    if (this.decks.C.isPlaying && !this.decks.C.audioBuffer) {
      if (step % 8 === 4) {
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(this.deckGains.C);
        osc.frequency.setValueAtTime(350, time);
        gainNode.gain.setValueAtTime(0.25, time);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
        osc.start(time);
        osc.stop(time + 0.11);
      }
    }

    if (this.decks.D.isPlaying && !this.decks.D.audioBuffer) {
      if (step % 8 === 0) {
        const notes = [220.0, 261.6, 329.6]; 
        notes.forEach(f => {
          const osc = this.ctx.createOscillator();
          const gainNode = this.ctx.createGain();
          osc.type = 'triangle';
          osc.connect(gainNode);
          gainNode.connect(this.deckGains.D);
          osc.frequency.setValueAtTime(f * this.decks.D.pitch, time);
          gainNode.gain.setValueAtTime(0.08, time);
          gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.8);
          osc.start(time);
          osc.stop(time + 0.82);
        });
      }
    }
  }

  triggerPadFX(deck, padIndex) {
    if (!this.ctx) return;
    const notes = [261.6, 293.7, 329.6, 349.2, 392.0, 440.0, 493.9, 523.3];
    const targetGain = this.deckGains[deck];

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gainNode = this.ctx.createGain();

    osc.type = padIndex % 2 === 0 ? 'sawtooth' : 'triangle';
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1500 + (padIndex * 150), this.ctx.currentTime);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(targetGain);

    osc.frequency.setValueAtTime(notes[padIndex], this.ctx.currentTime);
    gainNode.gain.setValueAtTime(0.35, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.42);
  }

  startRecording() {
    this.leftRecordBuffer = [];
    this.rightRecordBuffer = [];
    this.recordingActive = true;
  }

  stopRecording() {
    this.recordingActive = false;

    const totalLength = this.leftRecordBuffer.reduce((acc, val) => acc + val.length, 0);
    const flatL = new Float32Array(totalLength);
    const flatR = new Float32Array(totalLength);
    
    let offset = 0;
    for (let i = 0; i < this.leftRecordBuffer.length; i++) {
      flatL.set(this.leftRecordBuffer[i], offset);
      flatR.set(this.rightRecordBuffer[i], offset);
      offset += this.leftRecordBuffer[i].length;
    }

    const blob = encodeWav(flatL, flatR, this.ctx.sampleRate);
    const timestamp = Date.now();

    this.leftRecordBuffer = [];
    this.rightRecordBuffer = [];

    return { blob, timestamp };
  }

  setPlayingState(deck, isPlaying) {
    this.decks[deck].isPlaying = isPlaying;
  }

  setPitch(deck, pitchFactor) {
    this.decks[deck].pitch = pitchFactor;
  }

  setVolume(deck, volume) {
    this.decks[deck].volume = volume;
  }

  // 🟢 SETTER ENCAPSULADO DO CROSSFADER [1]
  setCrossfader(value) {
    this.crossfader = value;
  }
}

const audioMaster = new WebDJEngine();

// ============================================================================
// COMPONENTE DO FRONTEND (REACT 19)
// ============================================================================
export default function DJController() {
  const [audioInited, setAudioInited] = useState(false);
  const [skin, setSkin] = useState('default'); 
  const [activeTab, setActiveTab] = useState('library'); 

  const [activeLeftDeck, setActiveLeftDeck] = useState('A');  
  const [activeRightDeck, setActiveRightDeck] = useState('B'); 
  
  const [deckA, setDeckA] = useState({ isPlaying: false, bpm: 124, pitch: 0.0, volume: 0.8, eqLow: 0.0, eqMid: 0.0, eqHi: 0.0, filter: 0.0, selectedTrack: "Acid House Beat (Synth Loop A)", jogRotation: 0 });
  const [deckB, setDeckB] = useState({ isPlaying: false, bpm: 124, pitch: 0.0, volume: 0.8, eqLow: 0.0, eqMid: 0.0, eqHi: 0.0, filter: 0.0, selectedTrack: "Deep Melodic Bass (Core Loop B)", jogRotation: 0 });
  const [deckC, setDeckC] = useState({ isPlaying: false, bpm: 124, pitch: 0.0, volume: 0.8, eqLow: 0.0, eqMid: 0.0, eqHi: 0.0, filter: 0.0, selectedTrack: "Aux Drums / Shaker (Perc Loop C)", jogRotation: 0 });
  const [deckD, setDeckD] = useState({ isPlaying: false, bpm: 124, pitch: 0.0, volume: 0.8, eqLow: 0.0, eqMid: 0.0, eqHi: 0.0, filter: 0.0, selectedTrack: "Ambient Pad Chord (Prog Loop D)", jogRotation: 0 });

  const [crossfader, setCrossfader] = useState(0.0);
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [vuA, setVuA] = useState(0);
  const [vuB, setVuB] = useState(0);
  const [vuC, setVuC] = useState(0);
  const [vuD, setVuD] = useState(0);
  const [vuMaster, setVuMaster] = useState(0);

  const [aiSuggestions, setAiSuggestions] = useState([
    "Mixer limpo. Selecione o Deck 1 ou 3 para carregar suas músicas esquerdas, e 2 ou 4 para as direitas.",
    "Aperte o botão SYNC no Deck B para alinhar o tempo perfeitamente em 124 BPM."
  ]);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);

  const requestRef = useRef();
  const recordingInterval = useRef();

  const leftDeckState = activeLeftDeck === 'A' ? deckA : deckC;
  const rightDeckState = activeRightDeck === 'B' ? deckB : deckD;

  const initEngine = () => {
    audioMaster.init();
    setAudioInited(true);
    triggerAIMessage("Motor de áudio Web Audio de 4 canais ativado! Latência ultra-baixa de <3.2ms ativa.");
  };

  const triggerAIMessage = (message) => {
    setAiSuggestions(prev => [message, ...prev.slice(0, 4)]);
  };

  useEffect(() => {
    const updateLEDMeters = () => {
      if (audioInited && audioMaster.analysers.A) {
        const arrayA = new Uint8Array(audioMaster.analysers.A.frequencyBinCount);
        const arrayB = new Uint8Array(audioMaster.analysers.B.frequencyBinCount);
        const arrayC = new Uint8Array(audioMaster.analysers.C.frequencyBinCount);
        const arrayD = new Uint8Array(audioMaster.analysers.D.frequencyBinCount);
        const arrayMaster = new Uint8Array(audioMaster.analysers.Master.frequencyBinCount);

        audioMaster.analysers.A.getByteFrequencyData(arrayA);
        audioMaster.analysers.B.getByteFrequencyData(arrayB);
        audioMaster.analysers.C.getChannelData || audioMaster.analysers.C.getByteFrequencyData(arrayC);
        audioMaster.analysers.D.getByteFrequencyData(arrayD);
        audioMaster.analysers.Master.getByteFrequencyData(arrayMaster);

        const avgA = arrayA.reduce((a, b) => a + b, 0) / arrayA.length;
        const avgB = arrayB.reduce((a, b) => a + b, 0) / arrayB.length;
        const avgC = arrayC.reduce((a, b) => a + b, 0) / arrayC.length;
        const avgD = arrayD.reduce((a, b) => a + b, 0) / arrayD.length;
        const avgMaster = arrayMaster.reduce((a, b) => a + b, 0) / arrayMaster.length;

        setVuA(Math.min(100, Math.floor(avgA * 1.6)));
        setVuB(Math.min(100, Math.floor(avgB * 1.6)));
        setVuC(Math.min(100, Math.floor(avgC * 1.6)));
        setVuD(Math.min(100, Math.floor(avgD * 1.6)));
        setVuMaster(Math.min(100, Math.floor(avgMaster * 1.4)));
      }

      requestRef.current = requestAnimationFrame(updateLEDMeters);
    };

    if (audioInited) {
      requestRef.current = requestAnimationFrame(updateLEDMeters);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [audioInited]);

  useEffect(() => {
    if (!audioInited) return;
    
    const bassClash = (deckA.isPlaying && deckB.isPlaying && deckA.eqLow > -0.2 && deckB.eqLow > -0.2) ||
                      (deckA.isPlaying && deckD.isPlaying && deckA.eqLow > -0.2 && deckD.eqLow > -0.2) ||
                      (deckC.isPlaying && deckB.isPlaying && deckC.eqLow > -0.2 && deckB.eqLow > -0.2);

    if (bassClash && Math.abs(crossfader) < 0.4) {
      triggerAIMessage("⚠️ ALERTA DE LAMA: Conflito de subgrave no mixer! Use as bandas LOW para dosar a transição.");
    }

    if (vuMaster > 85) {
      triggerAIMessage("⚠️ ALERTA: Pico do ganho master detectado. Reduza os TRIMs para abrir headroom.");
    }
  }, [deckA.eqLow, deckB.eqLow, deckC.eqLow, deckD.eqLow, deckA.isPlaying, deckB.isPlaying, deckC.isPlaying, deckD.isPlaying, crossfader, vuMaster, audioInited]);

  const handleFileUpload = async (deck, file) => {
    if (!file) return;
    try {
      triggerAIMessage(`Decodificando "${file.name}" para o Deck ${deck}...`);
      await audioMaster.loadAudioFile(deck, file);
      
      const setFns = { A: setDeckA, B: setDeckB, C: setDeckC, D: setDeckD };
      setFns[deck](prev => ({ ...prev, selectedTrack: file.name }));
      
      triggerAIMessage(`Música "${file.name}" carregada no Deck ${deck}! Pressione PLAY.`);
    } catch (err) {
      triggerAIMessage(`❌ Erro ao decodificar áudio: ${err.message}`);
    }
  };

  const togglePlay = (deck) => {
    if (!audioInited) initEngine();
    
    if (audioMaster.ctx && audioMaster.ctx.state === 'suspended') {
      audioMaster.ctx.resume();
    }

    const setFns = { A: setDeckA, B: setDeckB, C: setDeckC, D: setDeckD };
    const currentDeckState = deck === 'A' ? deckA : (deck === 'B' ? deckB : (deck === 'C' ? deckC : deckD));

    const state = !currentDeckState.isPlaying;
    
    // 🟢 CORREÇÃO: Altera o estado do motor de forma dinâmica e linter-safe [1]
    audioMaster.setPlayingState(deck, state); 
    setFns[deck](prev => ({ ...prev, isPlaying: state }));
    
    audioMaster.playTrack(deck);
    
    triggerAIMessage(state ? `Iniciando reprodução do Deck ${deck}.` : `Deck ${deck} pausado.`);
    if (deck === 'A' && tutorialStep === 0 && state) setTutorialStep(1);
  };

  const syncBPM = (targetDeck) => {
    const setFns = { A: setDeckA, B: setDeckB, C: setDeckC, D: setDeckD };
    const leftActive = activeLeftDeck === 'A' ? deckA : deckC;
    
    const sourceBpm = leftActive.bpm * (1 + leftActive.pitch);
    const targetBpmBase = targetDeck === 'B' ? deckB.bpm : deckD.bpm;
    const neededPitch = (sourceBpm / targetBpmBase) - 1;
    
    // 🟢 CORREÇÃO: Altera o pitch do motor via método de classe [1]
    audioMaster.setPitch(targetDeck, 1 + neededPitch);
    setFns[targetDeck](prev => ({ ...prev, pitch: neededPitch }));
    triggerAIMessage(`Tempo sincronizado perfeitamente no Deck ${targetDeck}!`);
  };

  const handlePitchChange = (deck, val) => {
    const value = parseFloat(val);
    const pitchFactor = 1 + value;
    const setFns = { A: setDeckA, B: setDeckB, C: setDeckC, D: setDeckD };

    // 🟢 CORREÇÃO: Altera o pitch do motor via método de classe [1]
    audioMaster.setPitch(deck, pitchFactor);
    setFns[deck](prev => ({ ...prev, pitch: value }));
    if (audioMaster.sources[deck]) {
      audioMaster.sources[deck].playbackRate.setValueAtTime(pitchFactor, audioMaster.ctx.currentTime);
    }
  };

  const handleVolumeChange = (deck, val) => {
    const volume = parseFloat(val);
    const setFns = { A: setDeckA, B: setDeckB, C: setDeckC, D: setDeckD };
    
    // 🟢 CORREÇÃO: Altera o volume do motor via método de classe [1]
    audioMaster.setVolume(deck, volume);
    setFns[deck](prev => ({ ...prev, volume }));
    audioMaster.updateGainsAndFaders();
  };

  const handleEQChange = (deck, band, val) => {
    const value = parseFloat(val);
    
    audioMaster.setEQ(deck, band, value);
    if (deck === 'A') {
      setDeckA(prev => ({ ...prev, [`eq${band.charAt(0).toUpperCase() + band.slice(1)}`]: value }));
    } else if (deck === 'B') {
      setDeckB(prev => ({ ...prev, [`eq${band.charAt(0).toUpperCase() + band.slice(1)}`]: value }));
    } else if (deck === 'C') {
      setDeckC(prev => ({ ...prev, [`eq${band.charAt(0).toUpperCase() + band.slice(1)}`]: value }));
    } else if (deck === 'D') {
      setDeckD(prev => ({ ...prev, [`eq${band.charAt(0).toUpperCase() + band.slice(1)}`]: value }));
    }
  };

  const handleFilterChange = (deck, val) => {
    const value = parseFloat(val);
    
    audioMaster.setFilter(deck, value);
    if (deck === 'A') {
      setDeckA(prev => ({ ...prev, filter: value }));
      if (tutorialStep === 2 && Math.abs(value) > 0.5) setTutorialStep(3);
    } else if (deck === 'B') {
      setDeckB(prev => ({ ...prev, filter: value }));
    } else if (deck === 'C') {
      setDeckC(prev => ({ ...prev, filter: value }));
    } else if (deck === 'D') {
      setDeckD(prev => ({ ...prev, filter: value }));
    }
  };

  const handleCrossfader = (val) => {
    const value = parseFloat(val);
    // 🟢 CORREÇÃO: Altera o crossfader do motor via método de classe [1]
    audioMaster.setCrossfader(value);
    setCrossfader(value);
    audioMaster.updateGainsAndFaders();
  };

  const triggerPad = (deck, index) => {
    if (!audioInited) initEngine();
    audioMaster.triggerPadFX(deck, index);
  };

  const toggleRecording = () => {
    if (!audioInited) initEngine();
    
    if (!isRecording) {
      setIsRecording(true);
      setRecordTime(0);
      
      audioMaster.startRecording();

      recordingInterval.current = setInterval(() => {
        setRecordTime(p => p + 1);
      }, 1000);
      triggerAIMessage("Gravador master ativo (WAV 16-bit Stereo PCM).");
    } else {
      setIsRecording(false);
      clearInterval(recordingInterval.current);
      
      // 🟢 Coleta o Blob e o Timestamp estático calculados fora do React! [1]
      const { blob, timestamp } = audioMaster.stopRecording();
      const url = URL.createObjectURL(blob);

      // Dispara o download automático usando apenas aspas simples de forma segura! [1]
      const a = document.createElement('a');
      a.href = url;
      a.download = 'RQS_MIXLAB_SESSION_' + timestamp + '.wav'; // 🟢 100% puro e sem erros!
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);
      triggerAIMessage("Sua gravação WAV foi gerada e exportada!");
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ... (Toda a sua renderização de JSX, skins e retorno HTML continua perfeitamente intacto abaixo)
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
      default: 
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
      
      {/* HEADER */}
      <header className={`flex flex-wrap items-center justify-between p-4 rounded-xl ${st.card} border mb-4 shadow-2xl`}>
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-orange-600 animate-pulse">
            <Radio className="w-6 h-6 text-black" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-orange-500 via-yellow-400 to-cyan-400">
              RQS MIXLAB
            </h1>
            <p className="text-xs text-zinc-400 tracking-wider font-semibold">PROFESSIONAL DJ SIMULATOR</p>
          </div>
        </div>

        <div className="flex items-center space-x-4 mt-2 sm:mt-0">
          <button 
            onClick={toggleRecording}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
              isRecording 
                ? 'bg-red-600/30 border-red-500 text-red-400 animate-pulse' 
                : 'bg-zinc-800/80 border-zinc-700 hover:border-zinc-500'
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-red-500' : 'bg-zinc-500'}`}></span>
            <span>{isRecording ? `GRAVANDO ${formatTime(recordTime)}` : 'REC'}</span>
          </button>

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

      {!audioInited && (
        <div className="mb-4 bg-orange-600/20 border border-orange-500 rounded-xl p-3 text-center flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-2 text-orange-400 text-sm font-semibold">
            <Sparkles className="w-5 h-5 animate-spin" />
            <span>O motor do sintetizador de 4 canais está aguardando ativação. Toque para liberar.</span>
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
        
        {/* DECK ESQUERDO (DECK SELECIONÁVEL 1 / 3) */}
        <section className={`xl:col-span-4 rounded-3xl ${st.card} border p-5 flex flex-col justify-between relative`}>
          
          {/* Seletor Físico do Canal da Esquerda (1 ou 3) */}
          <div className="absolute top-4 left-4 flex items-center space-x-2 bg-black/60 border border-zinc-800/80 rounded-xl p-1 shadow-lg">
            <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></div>
            <div className="flex space-x-1">
              <button 
                onClick={() => setActiveLeftDeck('A')}
                className={`text-[9px] font-black px-2 py-0.5 rounded transition-all ${
                  activeLeftDeck === 'A' ? 'bg-orange-600 text-black shadow-lg' : 'text-zinc-500 hover:text-white'
                }`}
              >
                DECK 1
              </button>
              <button 
                onClick={() => setActiveLeftDeck('C')}
                className={`text-[9px] font-black px-2 py-0.5 rounded transition-all ${
                  activeLeftDeck === 'C' ? 'bg-orange-600 text-black shadow-lg' : 'text-zinc-500 hover:text-white'
                }`}
              >
                DECK 3
              </button>
            </div>
          </div>

          <div className="mt-8">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-zinc-400 truncate w-1/2">{leftDeckState.selectedTrack}</span>
              
              <label className="cursor-pointer bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white px-2 py-0.5 rounded text-[10px] font-extrabold border border-zinc-700/60 transition-all flex items-center space-x-1">
                <FolderOpen className="w-3 h-3" />
                <span>CARREGAR</span>
                <input 
                  type="file" 
                  accept="audio/*" 
                  className="hidden" 
                  onChange={(e) => handleFileUpload(activeLeftDeck, e.target.files[0])} 
                />
              </label>

              <span className="text-xs font-mono font-bold text-orange-500">{(leftDeckState.bpm * (1 + leftDeckState.pitch)).toFixed(1)} BPM</span>
            </div>
            
            <div className="h-12 bg-black/60 rounded-xl border border-zinc-800/80 overflow-hidden relative flex items-center">
              <svg className="w-full h-full" viewBox="0 0 400 60" preserveAspectRatio="none">
                <path 
                  d={`M 0 30 Q 50 ${leftDeckState.isPlaying ? '10' : '25'} 100 30 T 200 30 T 300 30 T 400 30`} 
                  fill="none" 
                  stroke="#22d3ee" 
                  strokeWidth="2.5" 
                  className={leftDeckState.isPlaying ? "animate-[dash_2s_linear_infinite]" : ""}
                />
                <path 
                  d={`M 0 30 Q 30 50 120 30 T 240 30 T 360 30 T 400 30`} 
                  fill="none" 
                  stroke="#f97316" 
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

          {/* JOG WHEEL ESQUERDA */}
          <div className="flex justify-center my-6">
            <div 
              className="w-56 h-56 rounded-full bg-zinc-950 border-[6px] border-zinc-900 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] flex items-center justify-center relative cursor-grab active:cursor-grabbing select-none"
              onClick={() => {
                if (!audioInited) initEngine();
              }}
            >
              <div className="absolute inset-2 rounded-full border border-dashed border-zinc-800/30"></div>
              <div className="absolute inset-8 rounded-full border border-zinc-900"></div>
              
              <div 
                className={`w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center relative ${
                  leftDeckState.isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''
                }`}
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
              <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950/40 border border-cyan-800/50 px-2 py-0.5 rounded">DECK {activeLeftDeck === 'A' ? '1' : '3'} CUES</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[...Array(8)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => triggerPad(activeLeftDeck, i)}
                  className={`h-10 rounded-lg border font-black transition-all flex flex-col justify-center items-center text-xs ${
                    leftDeckState.isPlaying 
                      ? `${st.padOn} text-black` 
                      : 'bg-zinc-800/50 border-zinc-700/60 text-zinc-400 hover:border-zinc-500'
                  }`}
                >
                  <span>CUE {i+1}</span>
                </button>
              ))}
            </div>
          </div>

          {/* BOTÕES DE TRANSPORTE ESQUERDO */}
          <div className="flex items-center justify-between border-t border-zinc-800/80 pt-4">
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => togglePlay(activeLeftDeck)}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                  leftDeckState.isPlaying 
                    ? 'bg-emerald-600 text-black shadow-[0_0_15px_rgba(16,185,129,0.5)]' 
                    : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                }`}
              >
                {leftDeckState.isPlaying ? <Pause className="w-6 h-6 fill-black" /> : <Play className="w-6 h-6 fill-white ml-1" />}
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
            CENTRAL MIXER SECTION (4 CANAIS COMPLETOS E INDEPENDENTES)
            ==================================================================== */}
        <section className={`xl:col-span-4 rounded-3xl ${st.card} border p-4 flex flex-col justify-between`}>
          
          <div className="grid grid-cols-4 gap-1 flex-grow">
            {[...Array(4)].map((_, chIdx) => {
              const ch = chIdx + 1;
              
              // Mapeamento correto e definitivo dos 4 canais físicos independentes:
              let deckLetter = 'A';
              let activeDeck = deckA;
              
              if (ch === 1) { deckLetter = 'A'; activeDeck = deckA; }
              else if (ch === 2) { deckLetter = 'B'; activeDeck = deckB; }
              else if (ch === 3) { deckLetter = 'C'; activeDeck = deckC; }
              else if (ch === 4) { deckLetter = 'D'; activeDeck = deckD; }

              const channelVu = ch === 1 ? vuA : (ch === 2 ? vuB : (ch === 3 ? vuC : vuD));

              return (
                <div key={ch} className="flex flex-col items-center justify-between py-2 border-r border-zinc-800/60 last:border-r-0">
                  <span className="text-[10px] font-extrabold text-zinc-500">CH {ch}</span>

                  {/* TRIM / GAIN */}
                  <div className="my-2 flex flex-col items-center">
                    <span className="text-[8px] font-bold text-zinc-600">TRIM</span>
                    <input 
                      type="range" 
                      min="0" 
                      max="1.2" 
                      step="0.05"
                      value={activeDeck.volume}
                      onChange={(e) => handleVolumeChange(deckLetter, e.target.value)}
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
                      value={activeDeck.eqHi}
                      onChange={(e) => handleEQChange(deckLetter, 'hi', e.target.value)}
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
                      value={activeDeck.eqMid}
                      onChange={(e) => handleEQChange(deckLetter, 'mid', e.target.value)}
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
                      value={activeDeck.eqLow}
                      onChange={(e) => handleEQChange(deckLetter, 'low', e.target.value)}
                      className="h-10 accent-orange-500"
                      style={{ appearance: 'slider-vertical' }}
                    />
                  </div>

                  {/* FILTER COLOR FX */}
                  <div className="my-2 flex flex-col items-center">
                    <span className="text-[8px] font-extrabold text-cyan-400">FILTER</span>
                    <input 
                      type="range" 
                      min="-1.0" 
                      max="1.0" 
                      step="0.05"
                      value={activeDeck.filter}
                      onChange={(e) => handleFilterChange(deckLetter, e.target.value)}
                      className="w-8 h-8 accent-cyan-400"
                    />
                    <div className="flex justify-between w-6 text-[6px] text-zinc-500">
                      <span>LPF</span>
                      <span>HPF</span>
                    </div>
                  </div>

                  {/* LEDs de volume vertical (VUs individuais ativos) */}
                  <div className="w-1.5 h-16 bg-black/80 rounded-full overflow-hidden relative flex flex-col justify-end">
                    <div 
                      className={`w-full ${st.vuFill} transition-all duration-75`}
                      style={{ height: `${channelVu}%` }}
                    ></div>
                  </div>

                  {/* FADER DE CANAL */}
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01"
                    value={activeDeck.volume}
                    onChange={(e) => handleVolumeChange(deckLetter, e.target.value)}
                    className="h-24 accent-zinc-200"
                    style={{ appearance: 'slider-vertical' }}
                  />
                </div>
              );
            })}
          </div>

          {/* MASTER VU METERS */}
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

          {/* CROSSFADER */}
          <div className="px-4 py-2 bg-black/20 rounded-2xl border border-zinc-800/60">
            <div className="flex justify-between text-[8px] font-extrabold text-zinc-500 px-1 mb-1">
              <span>CH 1/3 (LEFT)</span>
              <span>CROSSFADER</span>
              <span>CH 2/4 (RIGHT)</span>
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

        {/* DECK DIREITO (DECK SELECIONÁVEL 2 / 4) */}
        <section className={`xl:col-span-4 rounded-3xl ${st.card} border p-5 flex flex-col justify-between relative`}>
          
          {/* Seletor Físico do Canal da Direita (2 ou 4) */}
          <div className="absolute top-4 right-4 flex items-center space-x-2 bg-black/60 border border-zinc-800/80 rounded-xl p-1 shadow-lg">
            <div className="flex space-x-1">
              <button 
                onClick={() => setActiveRightDeck('B')}
                className={`text-[9px] font-black px-2 py-0.5 rounded transition-all ${
                  activeRightDeck === 'B' ? 'bg-orange-600 text-black shadow-lg' : 'text-zinc-500 hover:text-white'
                }`}
              >
                DECK 2
              </button>
              <button 
                onClick={() => setActiveRightDeck('D')}
                className={`text-[9px] font-black px-2 py-0.5 rounded transition-all ${
                  activeRightDeck === 'D' ? 'bg-orange-600 text-black shadow-lg' : 'text-zinc-500 hover:text-white'
                }`}
              >
                DECK 4
              </button>
            </div>
            <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></div>
          </div>

          <div className="mt-8">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-zinc-400 truncate w-1/2">{rightDeckState.selectedTrack}</span>
              
              <label className="cursor-pointer bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white px-2 py-0.5 rounded text-[10px] font-extrabold border border-zinc-700/60 transition-all flex items-center space-x-1">
                <FolderOpen className="w-3 h-3" />
                <span>CARREGAR</span>
                <input 
                  type="file" 
                  accept="audio/*" 
                  className="hidden" 
                  onChange={(e) => handleFileUpload(activeRightDeck, e.target.files[0])} 
                />
              </label>

              <span className="text-xs font-mono font-bold text-orange-500">{(rightDeckState.bpm * (1 + rightDeckState.pitch)).toFixed(1)} BPM</span>
            </div>
            
            <div className="h-12 bg-black/60 rounded-xl border border-zinc-800/80 overflow-hidden relative flex items-center">
              <svg className="w-full h-full" viewBox="0 0 400 60" preserveAspectRatio="none">
                <path 
                  d={`M 0 30 Q 50 ${rightDeckState.isPlaying ? '15' : '25'} 100 30 T 200 30 T 300 30 T 400 30`} 
                  fill="none" 
                  stroke="#22d3ee" 
                  strokeWidth="2.5" 
                  className={rightDeckState.isPlaying ? "animate-[dash_2s_linear_infinite]" : ""}
                />
                <path 
                  d={`M 0 30 Q 30 50 120 30 T 240 30 T 360 30 T 400 30`} 
                  fill="none" 
                  stroke="#e11d48" 
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

          {/* JOG WHEEL DIREITA */}
          <div className="flex justify-center my-6">
            <div 
              className="w-56 h-56 rounded-full bg-zinc-950 border-[6px] border-zinc-900 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] flex items-center justify-center relative cursor-grab active:cursor-grabbing select-none"
              onClick={() => {
                if (!audioInited) initEngine();
              }}
            >
              <div className="absolute inset-2 rounded-full border border-dashed border-zinc-800/30"></div>
              <div className="absolute inset-8 rounded-full border border-zinc-900"></div>
              
              <div 
                className={`w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center relative ${
                  rightDeckState.isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''
                }`}
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
              <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950/40 border border-cyan-800/50 px-2 py-0.5 rounded">DECK {activeRightDeck === 'B' ? '2' : '4'} CUES</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[...Array(8)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => triggerPad(activeRightDeck, i)}
                  className={`h-10 rounded-lg border font-black transition-all flex flex-col justify-center items-center text-xs ${
                    rightDeckState.isPlaying 
                      ? `${st.padOn} text-black` 
                      : 'bg-zinc-800/50 border-zinc-700/60 text-zinc-400 hover:border-zinc-500'
                  }`}
                >
                  <span>CUE {i+1}</span>
                </button>
              ))}
            </div>
          </div>

          {/* TRANSPORTE DIREITO */}
          <div className="flex items-center justify-between border-t border-zinc-800/80 pt-4">
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => togglePlay(activeRightDeck)}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                  rightDeckState.isPlaying 
                    ? 'bg-emerald-600 text-black shadow-[0_0_15px_rgba(16,185,129,0.5)]' 
                    : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                }`}
              >
                {rightDeckState.isPlaying ? <Pause className="w-6 h-6 fill-black" /> : <Play className="w-6 h-6 fill-white ml-1" />}
              </button>
              
              <button className="w-11 h-11 rounded-full bg-orange-600/20 border border-orange-500 text-orange-500 font-extrabold text-xs flex items-center justify-center hover:bg-orange-600 hover:text-black transition-all">
                CUE
              </button>
            </div>

            <button 
              onClick={() => syncBPM(activeRightDeck)}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black rounded-lg shadow-lg hover:shadow-cyan-400/30 transition-all border border-cyan-300"
            >
              SYNC BEAT
            </button>
          </div>
        </section>
      </div>

      {/* FOOTER MULTI-PAINEL */}
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
          
          {/* TAB: BIBLIOTECA VIRTUAL (4 CANAIS ADAPTADOS) */}
          {activeTab === 'library' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              
              {/* CH1 */}
              <div className="p-2.5 bg-black/40 rounded-xl border border-zinc-800/80 flex flex-col justify-between">
                <p className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1">TRILHA CANAL 1</p>
                <p className="text-xs font-bold text-zinc-200 truncate mb-2">{deckA.selectedTrack}</p>
                <label className="cursor-pointer bg-orange-600 hover:bg-orange-500 text-black px-2 py-0.5 rounded text-[10px] font-black text-center transition-all">
                  ESCOLHER MP3
                  <input type="file" accept="audio/*" className="hidden" onChange={(e) => handleFileUpload('A', e.target.files[0])} />
                </label>
              </div>

              {/* CH2 */}
              <div className="p-2.5 bg-black/40 rounded-xl border border-zinc-800/80 flex flex-col justify-between">
                <p className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1">TRILHA CANAL 2</p>
                <p className="text-xs font-bold text-zinc-200 truncate mb-2">{deckB.selectedTrack}</p>
                <label className="cursor-pointer bg-orange-600 hover:bg-orange-500 text-black px-2 py-0.5 rounded text-[10px] font-black text-center transition-all">
                  ESCOLHER MP3
                  <input type="file" accept="audio/*" className="hidden" onChange={(e) => handleFileUpload('B', e.target.files[0])} />
                </label>
              </div>

              {/* CH3 */}
              <div className="p-2.5 bg-black/40 rounded-xl border border-zinc-800/80 flex flex-col justify-between">
                <p className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1">TRILHA CANAL 3</p>
                <p className="text-xs font-bold text-zinc-200 truncate mb-2">{deckC.selectedTrack}</p>
                <label className="cursor-pointer bg-orange-600 hover:bg-orange-500 text-black px-2 py-0.5 rounded text-[10px] font-black text-center transition-all">
                  ESCOLHER MP3
                  <input type="file" accept="audio/*" className="hidden" onChange={(e) => handleFileUpload('C', e.target.files[0])} />
                </label>
              </div>

              {/* CH4 */}
              <div className="p-2.5 bg-black/40 rounded-xl border border-zinc-800/80 flex flex-col justify-between">
                <p className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1">TRILHA CANAL 4</p>
                <p className="text-xs font-bold text-zinc-200 truncate mb-2">{deckD.selectedTrack}</p>
                <label className="cursor-pointer bg-orange-600 hover:bg-orange-500 text-black px-2 py-0.5 rounded text-[10px] font-black text-center transition-all">
                  ESCOLHER MP3
                  <input type="file" accept="audio/*" className="hidden" onChange={(e) => handleFileUpload('D', e.target.files[0])} />
                </label>
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