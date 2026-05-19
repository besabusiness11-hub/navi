import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import { Keyboard, Mic, MicOff, Send, X } from 'lucide-react';
import { Room, RoomEvent, Track } from 'livekit-client';

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000';

const VALID_LANGS = new Set(['it','en','fr','de','es','pt','nl','pl','ru','ar','zh','ja','ko','tr','hi']);

const SPEECH_LANG = {
  it:'it-IT', en:'en-US', fr:'fr-FR', de:'de-DE', es:'es-ES',
  pt:'pt-PT', nl:'nl-NL', pl:'pl-PL', ru:'ru-RU', ar:'ar-SA',
  zh:'zh-CN', ja:'ja-JP', ko:'ko-KR', tr:'tr-TR', hi:'hi-IN',
};

const VoiceAgent = ({
  isActive, onClose, lang, setActiveSection,
  currentSection = 'home', pendingQuestion = null,
  onPendingQuestionHandled, onSpeakingChange,
  selectedVinyl = '/vinile-finale.png',
}) => {
  const [isSpeaking,    setIsSpeaking]    = useState(false);
  const [isListening,   setIsListening]   = useState(false);
  const [isMuted,       setIsMuted]       = useState(false);
  const [statusText,    setStatusText]    = useState('Connecting…');
  const [transcript,    setTranscript]    = useState('');
  const [isConnected,   setIsConnected]   = useState(false);
  const [textMode,      setTextMode]      = useState(false);
  const [textInput,     setTextInput]     = useState('');

  const roomRef          = useRef(null);
  const audioEls         = useRef([]);
  const audioSourcesRef  = useRef([]);
  const mounted          = useRef(true);
  const pendingRef       = useRef(pendingQuestion);
  const micEnabledRef    = useRef(false);
  const hasLiveKitAudio  = useRef(false);
  const isMutedRef       = useRef(false);
  const clientAudioReady = useRef(false);
  const waveformDurs     = useRef([...Array(5)].map(() => 0.4 + Math.random() * 0.4));
  const visitorId        = useRef(
    localStorage.getItem('_navi_vid') || Math.random().toString(36).slice(2)
  );

  pendingRef.current = pendingQuestion;

  const selectedLang = VALID_LANGS.has(lang) ? lang : 'en';

  const cancelSpeech = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  const speakText = (text) => {
    if (!('speechSynthesis' in window) || !mounted.current) return;
    cancelSpeech();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang   = SPEECH_LANG[selectedLang] ?? 'en-US';
    utt.rate   = 0.92;
    utt.pitch  = 1.05;
    utt.volume = 1.0;

    // Pick best available voice for the language
    const voices = window.speechSynthesis.getVoices();
    const match  = voices.find(v => v.lang.startsWith(selectedLang) && !v.localService) ||
                   voices.find(v => v.lang.startsWith(selectedLang));
    if (match) utt.voice = match;

    utt.onstart = () => {
      if (!mounted.current) return;
      setIsSpeaking(true);
      setStatusText('Speaking');
    };
    utt.onend = () => {
      if (!mounted.current) return;
      setIsSpeaking(false);
      if (!isMutedRef.current) {
        setIsListening(true);
        setStatusText('Listening…');
        enableMic();
      }
    };
    utt.onerror = () => {
      if (!mounted.current) return;
      setIsSpeaking(false);
      setTimeout(enableMic, 300);
    };

    window.speechSynthesis.speak(utt);
  };

  const enableMic = async () => {
    if (micEnabledRef.current || !roomRef.current || !mounted.current) return;
    micEnabledRef.current = true;
    await roomRef.current.localParticipant.setMicrophoneEnabled(true).catch(() => {});
    if (mounted.current) {
      setIsListening(true);
      setStatusText('Listening…');
    }
  };

  const publish = (obj) => {
    try {
      roomRef.current?.localParticipant?.publishData(
        new TextEncoder().encode(JSON.stringify(obj)),
        { reliable: true },
      );
    } catch (_) { /* not connected — ignore */ }
  };

  const signalClientAudioReady = async () => {
    if (clientAudioReady.current || !roomRef.current) return;
    await roomRef.current.startAudio?.().catch(() => {});
    audioEls.current.forEach(el => el.play().catch(() => {}));
    publish({ type: 'client_audio_ready' });
    clientAudioReady.current = true;
  };

  const scrollToSection = (id) => {
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      setActiveSection?.(id);
    }, 400);
  };

  const showTranscript = (text, duration = 4000) => {
    setTranscript(text);
    setTimeout(() => { if (mounted.current) setTranscript(''); }, duration);
  };

  const connectRoom = async () => {
    if (!mounted.current) return;
    setStatusText('Connecting…');
    setIsConnected(false);

    // Create room immediately so startAudio() fires close to user gesture
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    room.startAudio().catch(() => {});

    // Step 1: get LiveKit token from backend
    let token, wsUrl, roomName;
    try {
      const res = await fetch(
        `${BACKEND}/api/voice-token/demo?lang=${selectedLang}&visitor_id=${encodeURIComponent(visitorId.current)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`Token ${res.status}: ${body.error || res.statusText}`);
      }
      ({ token, wsUrl, roomName } = await res.json());
    } catch (err) {
      console.error('[VoiceAgent] Token fetch failed:', err.message);
      if (mounted.current) setStatusText('Server offline');
      return;
    }

    // Step 2: connect to LiveKit room
    try {

      // Remote agent audio
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        hasLiveKitAudio.current = true;
        cancelSpeech();

        const ac = window.__naviAC;
        if (ac && ac.state === 'running') {
          // Cookie consent accepted → AudioContext running → route directly (no autoplay restriction)
          try {
            const source = ac.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
            source.connect(ac.destination);
            audioSourcesRef.current.push(source);
            return;
          } catch (err) {
            console.error('[VoiceAgent] AudioContext route failed:', err);
          }
        }

        // Fallback: audio element (works if browser allows autoplay for this origin)
        const el = track.attach();
        el.autoplay = true;
        el.setAttribute('playsinline', '');
        document.body.appendChild(el);
        audioEls.current.push(el);
        el.addEventListener('playing', () => {
          if (!mounted.current) return;
          setIsSpeaking(true);
          setIsListening(false);
          setStatusText('Speaking');
        });
        el.addEventListener('ended', () => {
          if (!mounted.current || isMutedRef.current) return;
          setIsSpeaking(false);
          setIsListening(true);
          setStatusText('Listening…');
        });
        el.play()
          .then(() => signalClientAudioReady())
          .catch(e => console.warn('[VoiceAgent] el.play() blocked:', e.name));
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach();
        audioEls.current = audioEls.current.filter(e => document.body.contains(e));
        hasLiveKitAudio.current = audioEls.current.length > 0;
      });

      // Speaking indicators from active speaker detection
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        if (!mounted.current) return;
        const agentTalking = speakers.some(p => !p.isLocal);
        setIsSpeaking(agentTalking);
        setIsListening(!agentTalking && !isMuted);
        setStatusText(agentTalking ? 'Speaking' : 'Listening…');
      });

      // Data messages from agent
      room.on(RoomEvent.DataReceived, (data) => {
        if (!mounted.current) return;
        try {
          const msg = JSON.parse(new TextDecoder().decode(data));

          if (msg.type === 'transcript') showTranscript(msg.text, 3500);

          if (msg.type === 'agent_text') {
            const agentText = msg.text;
            showTranscript(agentText, Math.max(4500, agentText.length * 60));
            // Wait for LiveKit audio track (OpenAI TTS synthesis ~1-3s); fall back to browser TTS only if absent
            setTimeout(() => {
              if (!mounted.current) return;
              if (hasLiveKitAudio.current) {
                setTimeout(enableMic, 600);
              } else {
                speakText(agentText);
              }
            }, 3000);
          }

          if (msg.type === 'navigate' && msg.section) {
            scrollToSection(msg.section);
          }

          if (msg.type === 'ready') {
            setStatusText('Starting…');
            signalClientAudioReady();
            // Safety: if agent never speaks, enable mic after 6s
            setTimeout(enableMic, 6000);
            if (pendingRef.current) {
              onPendingQuestionHandled?.();
              setTimeout(() => publish({ type: 'ask', text: pendingRef.current }), 600);
            }
          }
        } catch (_) { /* malformed data packet — ignore */ }
      });

      room.on(RoomEvent.Disconnected, () => {
        if (mounted.current) {
          setIsConnected(false);
          setIsSpeaking(false);
          setIsListening(false);
          setStatusText('Disconnected');
        }
      });

      await room.connect(wsUrl, token, { autoSubscribe: true });

      if (!mounted.current) { room.disconnect(); return; }

      // Dispatch agent to room (must happen after room exists)
      fetch(`${BACKEND}/api/voice-dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName, lang: selectedLang }),
      }).catch(() => {});

      setIsConnected(true);
      setIsListening(false);
      setStatusText('Starting…');

      // Tell agent visitor language + current section
      publish({ type: 'lang', lang: selectedLang });
      if (currentSection) publish({ type: 'section_change', section: currentSection });

    } catch (err) {
      console.error('[VoiceAgent] LiveKit connect failed:', err.message);
      if (!mounted.current) return;
      // Distinguish: credential error vs network error
      const msg = err.message?.toLowerCase() ?? '';
      if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid') || msg.includes('signature')) {
        setStatusText('Auth error — check LiveKit keys');
      } else if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('econnrefused')) {
        setStatusText('Network error');
      } else {
        setStatusText('Connection failed');
      }
    }
  };

  const disconnectRoom = () => {
    cancelSpeech();
    try { roomRef.current?.disconnect(); } catch (_) { /* already disconnected — ignore */ }
    roomRef.current = null;
    micEnabledRef.current = false;
    hasLiveKitAudio.current = false;
    clientAudioReady.current = false;
    isMutedRef.current = false;
    audioEls.current.forEach(el => { try { el.remove(); } catch (_) { /* already removed */ } });
    audioEls.current = [];
    audioSourcesRef.current.forEach(src => { try { src.disconnect(); } catch { /* already disconnected */ } });
    audioSourcesRef.current = [];
    setIsConnected(false);
    setIsSpeaking(false);
    setIsListening(false);
    setIsMuted(false);
    setStatusText('Connecting…');
    setTranscript('');
  };

  const handleToggleMic = async () => {
    if (!roomRef.current) return;
    if (!micEnabledRef.current) { await enableMic(); return; }
    const next = !isMuted;
    isMutedRef.current = next;
    await roomRef.current.localParticipant.setMicrophoneEnabled(!next).catch(() => {});
    setIsMuted(next);
    if (next) cancelSpeech(); // muting → stop speaking
    else { setIsListening(true); setStatusText('Listening…'); }
  };

  const submitTextQuestion = () => {
    const text = textInput.trim();
    if (!text) return;
    setTextInput('');
    showTranscript(text, 2500);
    if (!roomRef.current || !isConnected) {
      setStatusText('Connecting...');
      return;
    }
    publish({ type: 'ask', text });
    setStatusText('Thinking...');
  };

  // Notify agent on section change
  useEffect(() => {
    if (isConnected && currentSection) publish({ type: 'section_change', section: currentSection });
  }, [currentSection, isConnected]);

  // Main lifecycle: connect on open, disconnect on close
  useEffect(() => {
    mounted.current = true;
    if (isActive) connectRoom();
    else disconnectRoom();
    return () => { mounted.current = false; cancelSpeech(); disconnectRoom(); };
  }, [isActive, lang]);

  useEffect(() => { onSpeakingChange?.(isSpeaking); }, [isSpeaking]);

  const micActive = isListening && !isMuted;
  const waveActive = isSpeaking || micActive;

  // ─── Draggable widget position ─────────────────────────────────────────
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const [constraints, setConstraints] = useState({ left: 0, right: 0, top: 0, bottom: 0 });

  useEffect(() => {
    const update = () => {
      setConstraints({
        left: -window.innerWidth / 2 + 80,
        right: window.innerWidth / 2 - 80,
        top: -(window.innerHeight - 200),
        bottom: 80,
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Reset widget to default position (same as "Talk to Navi" button) on every activation
  useEffect(() => {
    if (isActive) {
      dragX.set(0);
      dragY.set(0);
    }
  }, [isActive]);

  const handleDragEnd = () => {
    // intentionally NOT persisted — widget returns to default on next open
  };

  return (
    <div className="fixed bottom-14 sm:bottom-16 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          style={{ originY: 1 }}
        >
          <motion.div
            drag
            dragMomentum={false}
            dragElastic={0.08}
            dragConstraints={constraints}
            onDragEnd={handleDragEnd}
            style={{ x: dragX, y: dragY }}
            whileDrag={{ scale: 1.04 }}
            className="pointer-events-auto flex flex-col items-center gap-3 select-none px-4 max-w-[calc(100vw-2rem)] cursor-grab active:cursor-grabbing"
          >
          {/* Transcript toast */}
          <AnimatePresence>
            {transcript && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-black/80 backdrop-blur-md px-4 py-2 rounded-lg max-w-sm text-center mb-2"
              >
                <span className="text-white/90 font-sans text-xs italic">"{transcript}"</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Status pill */}
          <div className="bg-[#a6b1b6] px-5 py-2 rounded-full shadow-md">
            <span className="text-[12px] font-sans text-[#1a1a1a] font-medium">
              {isSpeaking ? 'Speaking' : micActive ? 'Listening…' : isMuted ? 'Muted' : statusText}
            </span>
          </div>

          {/* Main bar */}
          <div className="flex items-center gap-3 bg-[#a6b1b6] p-2 pr-3 rounded-full shadow-2xl">

            {/* Vinyl avatar */}
            <div className="w-12 h-12 rounded-full overflow-hidden shadow-sm relative flex-shrink-0">
              <img src={selectedVinyl} alt="Navi" className="w-full h-full object-cover" />
              {micActive && (
                <motion.div
                  className="absolute inset-0 bg-green-400/20 rounded-full"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
            </div>

            {/* Name + status */}
            <div className="flex flex-col min-w-[75px] ml-1">
              <span className="text-[#1a1a1a] text-[13px] font-bold leading-tight">Navi</span>
              <span className={`text-[11px] font-medium leading-tight tracking-wide transition-colors ${
                micActive  ? 'text-[#5ea236]'  :
                isMuted    ? 'text-[#ff5252]'  :
                isSpeaking ? 'text-[#e8a020]'  :
                             'text-gray-600'
              }`}>
                {isMuted ? 'Muted' : statusText}
              </span>
            </div>

            {/* Waveform */}
            <div className="flex items-center gap-[4px] mx-3 h-6 w-8 justify-center">
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  className={`w-1.5 rounded-full ${micActive ? 'bg-[#5ea236]' : isSpeaking ? 'bg-[#e8a020]' : 'bg-[#4a5559]'}`}
                  animate={waveActive ? { height: ['20%', '100%', '20%'] } : { height: '20%' }}
                  transition={{
                    duration: micActive ? 0.8 : waveformDurs.current[i],
                    repeat:   waveActive ? Infinity : 0,
                    delay:    i * 0.1,
                    ease:     'easeInOut',
                  }}
                />
              ))}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 pl-1">
              <motion.button
                onClick={() => setTextMode((v) => !v)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title={textMode ? 'Hide keyboard' : 'Type instead'}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm cursor-pointer ${
                  textMode ? 'bg-[#4a7fff] hover:bg-[#386de8]' : 'bg-[#6b7780] hover:bg-[#5c6870]'
                }`}
              >
                <Keyboard className="w-5 h-5 text-white" />
              </motion.button>

              <motion.button
                onClick={handleToggleMic}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm relative cursor-pointer ${
                  isMuted    ? 'bg-[#ff5252] hover:bg-[#ff1744]' :
                  micActive  ? 'bg-[#5ea236] hover:bg-[#4d862c]' :
                  isSpeaking ? 'bg-[#e8a020] hover:bg-[#c98a10]' :
                               'bg-[#8c9ba1] hover:bg-[#7d8b91]'
                }`}
              >
                {micActive && (
                  <motion.div
                    className="absolute inset-0 bg-[#5ea236] rounded-full"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.4, 0, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
                {isMuted
                  ? <MicOff className="w-5 h-5 text-white relative z-10" />
                  : <Mic    className="w-5 h-5 text-white relative z-10" />
                }
              </motion.button>

              <button
                onClick={onClose}
                className="w-12 h-12 rounded-full bg-[#ff5252] flex items-center justify-center hover:bg-[#ff1744] transition-colors shadow-sm"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>
          </div>

          <AnimatePresence>
            {textMode && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-2 bg-[#a6b1b6] p-2 rounded-full shadow-2xl w-[min(92vw,420px)]"
              >
                <input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitTextQuestion();
                    if (e.key === 'Escape') setTextMode(false);
                  }}
                  placeholder="Type your question..."
                  className="flex-1 min-w-0 rounded-full border-0 bg-white/55 px-4 py-3 text-[14px] text-[#1a1a1a] placeholder:text-[#5f686d] outline-none"
                  autoFocus
                />
                <button
                  onClick={submitTextQuestion}
                  className="w-11 h-11 rounded-full bg-[#4a7fff] hover:bg-[#386de8] flex items-center justify-center transition-colors shadow-sm flex-shrink-0"
                  title="Send"
                >
                  <Send className="w-5 h-5 text-white" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
};

export default VoiceAgent;
