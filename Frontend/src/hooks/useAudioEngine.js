// src/hooks/useAudioEngine.js
import { useRef, useEffect } from 'react';

class WebDJEngine {
    constructor() {
      this.ctx = null;
      this.decks = {
        A: { isPlaying: false, bpm: 124, volume: 0.8, pitch: 1.0, filterVal: 0, eq: { hi: 0, mid: 0, low: 0 } },
        B: { isPlaying: false, bpm: 124, volume: 0.8, pitch: 1.0, filterVal: 0, eq: { hi: 0, mid: 0, low: 0 } }
      };
      this.crossfader = 0.0; // -1.0 (A) to 1.0 (B)
      this.masterVolume = 0.8;
      this.step = 0;
      this.intervalId = null;
      this.analysers = { A: null, B: null, Master: null };
    }
  
    init() {
      if (this.ctx) return;
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      
      // Configuração dos analisadores de espectro (para os LEDs físicos do Mixer)
      this.analysers.A = this.ctx.createAnalyser();
      this.analysers.B = this.ctx.createAnalyser();
      this.analysers.Master = this.ctx.createAnalyser();
      
      this.analysers.A.fftSize = 32;
      this.analysers.B.fftSize = 32;
      this.analysers.Master.fftSize = 32;
  
      // Nós de Ganho dos Decks
      this.deckGains = {
        A: this.ctx.createGain(),
        B: this.ctx.createGain()
      };
  
      // Filtros e EQs do Deck A
      this.filters = {
        A: {
          hpf: this.ctx.createBiquadFilter(),
          lpf: this.ctx.createBiquadFilter(),
          eqLow: this.ctx.createBiquadFilter(),
          eqMid: this.ctx.createBiquadFilter(),
          eqHi: this.ctx.createBiquadFilter()
        },
        B: {
          hpf: this.ctx.createBiquadFilter(),
          lpf: this.ctx.createBiquadFilter(),
          eqLow: this.ctx.createBiquadFilter(),
          eqMid: this.ctx.createBiquadFilter(),
          eqHi: this.ctx.createBiquadFilter()
        }
      };
  
      this.setupFilters('A');
      this.setupFilters('B');
  
      // Nó de Crossfader
      this.crossfaderGainA = this.ctx.createGain();
      this.crossfaderGainB = this.ctx.createGain();
      this.masterGain = this.ctx.createGain();
  
      // Roteamento Deck A
      this.deckGains.A
        .connect(this.filters.A.eqLow)
        .connect(this.filters.A.eqMid)
        .connect(this.filters.A.eqHi)
        .connect(this.filters.A.lpf)
        .connect(this.filters.A.hpf)
        .connect(this.analysers.A)
        .connect(this.crossfaderGainA)
        .connect(this.masterGain);
  
      // Roteamento Deck B
      this.deckGains.B
        .connect(this.filters.B.eqLow)
        .connect(this.filters.B.eqMid)
        .connect(this.filters.B.eqHi)
        .connect(this.filters.B.lpf)
        .connect(this.filters.B.hpf)
        .connect(this.analysers.B)
        .connect(this.crossfaderGainB)
        .connect(this.masterGain);
  
      this.masterGain.connect(this.analysers.Master).connect(this.ctx.destination);
  
      this.updateGainsAndFaders();
      this.startSequencer();
    }
  
    setupFilters(deck) {
      const f = this.filters[deck];
      
      // HPF e LPF de Color FX
      f.hpf.type = 'highpass';
      f.hpf.frequency.value = 10;
      f.lpf.type = 'lowpass';
      f.lpf.frequency.value = 22000;
  
      // EQ Três bandas (Pioneer Iso)
      f.eqLow.type = 'lowshelf';
      f.eqLow.frequency.value = 300;
      f.eqLow.gain.value = 0;
  
      f.eqMid.type = 'peaking';
      f.eqMid.Q.value = 1.0;
      f.eqMid.frequency.value = 1500;
      f.eqMid.gain.value = 0;
  
      f.eqHi.type = 'highshelf';
      f.eqHi.frequency.value = 5000;
      f.eqHi.gain.value = 0;
    }
  
    updateGainsAndFaders() {
      if (!this.ctx) return;
      
      // Faders de Volume Verticais
      this.deckGains.A.gain.value = this.decks.A.volume;
      this.deckGains.B.gain.value = this.decks.B.volume;
  
      // Crossfader (Curva Linear Standard)
      const factorA = Math.cos(((this.crossfader + 1) * Math.PI) / 4);
      const factorB = Math.sin(((this.crossfader + 1) * Math.PI) / 4);
      this.crossfaderGainA.gain.value = factorA;
      this.crossfaderGainB.gain.value = factorB;
  
      // Ganho Geral
      this.masterGain.gain.value = this.masterVolume;
    }
  
    setEQ(deck, band, value) {
      this.decks[deck].eq[band] = value;
      if (!this.ctx) return;
      const f = this.filters[deck];
      
      // Mapeamento de -26dB a +6dB
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
        // Passa Baixas (Lover / Filter esquerdo)
        const freq = 22000 * Math.pow(10, (value * 2.5));
        f.lpf.frequency.setValueAtTime(Math.max(40, freq), this.ctx.currentTime);
        f.hpf.frequency.setValueAtTime(10, this.ctx.currentTime);
      } else {
        // Passa Altas (High / Filter direito)
        const freq = 10 + (value * 8000);
        f.hpf.frequency.setValueAtTime(freq, this.ctx.currentTime);
        f.lpf.frequency.setValueAtTime(22000, this.ctx.currentTime);
      }
    }
  
    // Sequenciador de Síntese de Áudio para emular som de DJ
    startSequencer() {
      const stepDuration = 60 / 124 / 4; // 16th notes a 124 BPM
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
  
      // DECK A: Sintetizador de Bateria (House Beat Loop)
      if (this.decks.A.isPlaying) {
        // Kick Drum (Passos 1, 5, 9, 13)
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
  
        // Hi-Hat (Passos 3, 7, 11, 15)
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
  
      // DECK B: Sintetizador Melódico (Melody Bass Loop)
      if (this.decks.B.isPlaying) {
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
    }
  
    triggerPadFX(deck, padIndex) {
      if (!this.ctx) return;
      const notes = [261.6, 293.7, 329.6, 349.2, 392.0, 440.0, 493.9, 523.3]; // Escala de Dó maior
      const targetGain = deck === 'A' ? this.deckGains.A : this.deckGains.B;
  
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
  }


const audioMaster = new WebDJEngine();

export function useAudioEngine() {
  const engineRef = useRef(audioMaster);
  
  useEffect(() => {
    // Garante que o intervalo do sequenciador limpe se o componente desmontar
    return () => {
      if (engineRef.current.intervalId) {
        clearInterval(engineRef.current.intervalId);
      }
    };
  }, []);

  return engineRef.current;
}