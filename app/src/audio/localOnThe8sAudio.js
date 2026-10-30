(function () {
var RetroWeather = window.RetroWeather || (window.RetroWeather = {});

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const LOOP_SOURCES = [
  './assets/audio/jazz-brunch.mp3',
  './assets/audio/vibing-over-venus.mp3',
  './assets/audio/smooth-lovin.mp3',
  './assets/audio/airport-lounge.mp3'
];
const BPM = 88;
const STEP_SECONDS = 60 / BPM / 4;
const SCHEDULE_AHEAD_SECONDS = 0.22;
const SCHEDULER_INTERVAL_MS = 85;
const CHORDS = [
  [57, 60, 64, 67],
  [53, 57, 60, 64],
  [55, 59, 62, 65],
  [52, 55, 59, 62]
];
const BASS = [45, 45, 41, 41, 43, 43, 40, 40];
const LEAD = [72, 74, 76, 79, 76, 74, 71, 69, 67, 69, 71, 74, 71, 69, 67, 64];

function createLocalOnThe8sAudio({ onStatusChange } = {}) {
  let audioElement = null;
  let audioElementFailed = false;
  let context = null;
  let master = null;
  let padBus = null;
  let enabled = false;
  let status = 'off';
  let scheduler = 0;
  let nextStepTime = 0;
  let step = 0;
  let lastLoopSource = '';

  function setStatus(nextStatus) {
    if (status === nextStatus) {
      return;
    }

    status = nextStatus;
    onStatusChange?.(status);
  }

  function ensureContext() {
    if (!AudioContextClass) {
      setStatus('error');
      return null;
    }

    if (context) {
      return context;
    }

    try {
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = 0.22;

      const tone = context.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 5200;
      tone.Q.value = 0.4;

      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -22;
      compressor.knee.value = 24;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.015;
      compressor.release.value = 0.22;

      padBus = context.createGain();
      padBus.gain.value = 0.18;

      padBus.connect(tone);
      tone.connect(compressor);
      compressor.connect(master);
      master.connect(context.destination);
    } catch {
      context = null;
      master = null;
      padBus = null;
      setStatus('error');
      return null;
    }

    return context;
  }

  function ensureAudioElement() {
    if (audioElementFailed || typeof window.Audio !== 'function') {
      return null;
    }

    if (audioElement) {
      return audioElement;
    }

    audioElement = new window.Audio(randomLoopSource());
    audioElement.loop = false;
    audioElement.preload = 'metadata';
    audioElement.volume = 0.72;
    audioElement.addEventListener('playing', () => {
      if (!enabled) {
        audioElement.pause();
        return;
      }
      stopScheduler();
      setStatus('playing');
    });
    audioElement.addEventListener('pause', () => {
      if (enabled) {
        setStatus('pending');
      }
    });
    audioElement.addEventListener('error', () => {
      audioElementFailed = true;
      if (enabled) {
        playSynth();
      }
    });
    audioElement.addEventListener('ended', () => {
      if (enabled) {
        play();
      }
    });
    return audioElement;
  }

  async function play() {
    enabled = true;
    const loop = ensureAudioElement();
    if (loop) {
      try {
        if (loop.paused || loop.ended) {
          loop.src = randomLoopSource();
          loop.load();
        }
        loop.currentTime = loop.ended ? 0 : loop.currentTime;
        await loop.play();
        if (!enabled) {
          loop.pause();
          return false;
        }
        stopScheduler();
        setStatus('playing');
        return true;
      } catch (error) {
        if (!enabled) {
          return false;
        }
        if (!isUnsupportedMediaError(error)) {
          setStatus('pending');
          return false;
        }

        audioElementFailed = true;
      }
    }

    return playSynth();
  }

  async function playSynth() {
    const audioContext = ensureContext();
    if (!audioContext) {
      return false;
    }

    try {
      await audioContext.resume();
    } catch {
      setStatus('pending');
      return false;
    }

    if (!enabled) {
      return false;
    }

    if (audioContext.state !== 'running') {
      setStatus('pending');
      return false;
    }

    if (master) {
      const now = audioContext.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
      master.gain.setTargetAtTime(0.28, now, 0.05);
    }

    nextStepTime = audioContext.currentTime + 0.04;
    setStatus('playing');
    startScheduler();
    return true;
  }

  function stop() {
    enabled = false;
    stopScheduler();
    if (audioElement) {
      audioElement.pause();
    }
    if (master && context) {
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(0.0001, now, 0.03);
      setTimeout(() => {
        if (!enabled && master) {
          master.gain.value = 0.22;
        }
      }, 160);
    }
    setStatus('off');
  }

  function startScheduler() {
    stopScheduler();
    scheduler = window.setInterval(schedule, SCHEDULER_INTERVAL_MS);
    schedule();
  }

  function stopScheduler() {
    if (scheduler) {
      window.clearInterval(scheduler);
      scheduler = 0;
    }
  }

  function schedule() {
    if (!enabled || !context || context.state !== 'running') {
      if (enabled) {
        setStatus('pending');
      }
      return;
    }

    while (nextStepTime < context.currentTime + SCHEDULE_AHEAD_SECONDS) {
      scheduleStep(step, nextStepTime);
      nextStepTime += STEP_SECONDS;
      step = (step + 1) % 128;
    }
  }

  function scheduleStep(currentStep, time) {
    const beat = currentStep % 16;
    if (beat === 0) {
      playChord(CHORDS[Math.floor(currentStep / 16) % CHORDS.length], time, 1.95);
    }

    if (beat === 0 || beat === 8) {
      playBass(BASS[Math.floor(currentStep / 8) % BASS.length], time);
    }

    if (beat === 4 || beat === 12) {
      playHat(time, 0.055);
    }

    if (beat === 0 || beat === 10) {
      playBrush(time, 0.035);
    }

    if (currentStep % 8 === 6) {
      playLead(LEAD[Math.floor(currentStep / 8) % LEAD.length], time + STEP_SECONDS * 0.1);
    }
  }

  function playChord(notes, time, duration) {
    notes.forEach((note, index) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      osc.type = index % 2 ? 'triangle' : 'sine';
      osc.frequency.value = midiToFrequency(note);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800, time);
      filter.frequency.exponentialRampToValueAtTime(720, time + duration);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.07, time + 0.045);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(padBus);
      osc.start(time);
      osc.stop(time + duration + 0.08);
    });
  }

  function playBass(note, time) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(midiToFrequency(note), time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.11, time + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.46);
    osc.connect(gain);
    gain.connect(padBus);
    osc.start(time);
    osc.stop(time + 0.55);
  }

  function playLead(note, time) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(midiToFrequency(note), time);
    osc.frequency.linearRampToValueAtTime(midiToFrequency(note - 0.12), time + 0.16);
    filter.type = 'bandpass';
    filter.frequency.value = 1150;
    filter.Q.value = 1.8;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.065, time + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.72);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(padBus);
    osc.start(time);
    osc.stop(time + 0.82);
  }

  function playHat(time, volume) {
    const source = context.createBufferSource();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    source.buffer = noiseBuffer(0.08);
    filter.type = 'highpass';
    filter.frequency.value = 5200;
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(padBus);
    source.start(time);
  }

  function playBrush(time, volume) {
    const source = context.createBufferSource();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    source.buffer = noiseBuffer(0.18);
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(padBus);
    source.start(time);
  }

  function noiseBuffer(duration) {
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function midiToFrequency(note) {
    return 440 * (2 ** ((note - 69) / 12));
  }

  function randomLoopSource() {
    if (LOOP_SOURCES.length < 2) {
      return LOOP_SOURCES[0];
    }

    let nextSource = lastLoopSource;
    while (nextSource === lastLoopSource) {
      const index = Math.floor(Math.random() * LOOP_SOURCES.length);
      nextSource = LOOP_SOURCES[index];
    }
    lastLoopSource = nextSource;
    return nextSource;
  }

  function isUnsupportedMediaError(error) {
    return error?.name === 'NotSupportedError' || error?.code === 4;
  }

  return {
    getStatus() {
      return status;
    },
    setEnabled(nextEnabled, options = {}) {
      if (nextEnabled) {
        if (options.userGesture) {
          return play();
        }
        enabled = true;
        setStatus('pending');
        return Promise.resolve(false);
      }

      stop();
      return Promise.resolve(true);
    },
    unlock() {
      if (enabled && status === 'pending') {
        return play();
      }
      return Promise.resolve(false);
    }
  };
}

RetroWeather.createLocalOnThe8sAudio = createLocalOnThe8sAudio;
}());
