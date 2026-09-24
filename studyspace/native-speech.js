/* Android app only — injected at document start into every frame of the app's own origin.
   Android's WebView has no reliable built-in voices, so this routes the standard Web Speech API
   (speechSynthesis + SpeechSynthesisUtterance) to Android's TextToSpeech engine through the
   SSNative message channel. Word boundaries come from UtteranceProgressListener.onRangeStart,
   so the study console's karaoke highlighting keeps working. Pause/resume restart speech from the
   last spoken word (Android TTS has no native pause). In a normal browser this file does nothing. */
(function () {
  'use strict';
  if (!window.SSNative || window.__ssSpeech) return;
  window.__ssSpeech = true;
  const bridge = window.SSNative;
  const send = (o) => bridge.postMessage(JSON.stringify(Object.assign({ ch: 'tts' }, o)));

  const Events = {
    addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); },
    removeEventListener(t, f) { const a = this._l[t]; if (a) this._l[t] = a.filter((x) => x !== f); },
    _emit(t, init) {
      const e = Object.assign({ type: t, target: this, elapsedTime: 0 }, init || {});
      const call = (f) => { try { f.call(this, e); } catch (err) { console.error(err); } };
      if (typeof this['on' + t] === 'function') call(this['on' + t]);
      (this._l[t] || []).slice().forEach(call);
    },
  };

  function Utterance(text) {
    this._l = {}; this.text = text == null ? '' : String(text);
    this.lang = ''; this.voice = null; this.volume = 1; this.rate = 1; this.pitch = 1;
    this.onstart = this.onend = this.onerror = this.onboundary = this.onpause = this.onresume = this.onmark = null;
  }
  Object.assign(Utterance.prototype, Events);

  let voices = [], seq = 0, cur = null; // cur: { u, id, offset, last, first, stopping }
  const queue = [];
  const synth = Object.assign({
    _l: {}, speaking: false, paused: false, pending: false, onvoiceschanged: null,
    getVoices() { return voices.slice(); },
    speak(u) {
      if (!(u instanceof Utterance)) throw new TypeError('Expected a SpeechSynthesisUtterance');
      queue.push(u); this.pending = !!cur; if (!cur) next();
    },
    cancel() {
      queue.length = 0; this.pending = false;
      if (cur) { const c = cur; cur = null; this.speaking = false; this.paused = false; send({ cmd: 'stop' }); c.u._emit('error', { error: 'interrupted', charIndex: c.last, utterance: c.u }); }
    },
    pause() {
      if (!cur || this.paused) return;
      this.paused = true; cur.stopping = true; cur.pausedAt = cur.last; send({ cmd: 'stop' });
      cur.u._emit('pause', { charIndex: cur.last, utterance: cur.u });
    },
    resume() {
      if (!cur || !this.paused) return;
      this.paused = false; const from = cur.pausedAt || 0; speakFrom(cur, from, false);
      cur.u._emit('resume', { charIndex: from, utterance: cur.u });
    },
  }, Events);

  function next() {
    const u = queue.shift(); synth.pending = queue.length > 0;
    if (!u) { cur = null; synth.speaking = false; return; }
    cur = { u, last: 0 }; synth.speaking = true; speakFrom(cur, 0, true);
  }
  function speakFrom(c, from, first) {
    c.id = 'u' + (++seq); c.offset = from; c.first = first; c.stopping = false;
    const v = c.u.voice;
    send({ cmd: 'speak', id: c.id, text: c.u.text.slice(from), lang: c.u.lang || (v && v.lang) || '', voice: v ? v.voiceURI : '', rate: +c.u.rate || 1, pitch: +c.u.pitch || 1, volume: c.u.volume == null ? 1 : +c.u.volume });
  }

  bridge.addEventListener('message', (e) => {
    let m; try { m = JSON.parse(e.data); } catch (_) { return; }
    if (!m || m.ch !== 'tts') return;
    if (m.ev === 'voices') {
      voices = (m.voices || []).map((v) => Object.freeze({ voiceURI: v.id, name: v.name, lang: v.lang, localService: !!v.local, default: !!v.default }));
      synth._emit('voiceschanged');
      return;
    }
    const c = cur; if (!c || m.id !== c.id) return; // a stale utterance (cancelled or paused)
    if (m.ev === 'start') { if (c.first) { c.first = false; c.u._emit('start', { charIndex: 0, utterance: c.u }); } }
    else if (m.ev === 'boundary') { c.last = c.offset + m.start; c.u._emit('boundary', { name: 'word', charIndex: c.last, charLength: m.end - m.start, utterance: c.u }); }
    else if (m.ev === 'done') { if (c.stopping) return; cur = null; synth.speaking = false; c.u._emit('end', { charIndex: c.u.text.length, utterance: c.u }); next(); }
    else if (m.ev === 'error') { if (c.stopping) return; cur = null; synth.speaking = false; c.u._emit('error', { error: m.error || 'synthesis-failed', utterance: c.u }); next(); }
  });

  try { Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, enumerable: true }); } catch (e) { /* keep the built-in one */ }
  window.SpeechSynthesisUtterance = Utterance;
  send({ cmd: 'voices' });
})();
