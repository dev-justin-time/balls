/**
 * =====================================================================
 * @domain:    core
 * @concern:   Voice-to-Text — Web Speech API primary + Backend Whisper fallback
 * @created:   2026-06-24T21:00:00Z
 * @version:   1.0.0
 * @security:  Client-Side Audio (No persistent storage)
 * =====================================================================
 *
 * Provides voice-to-text transcription for the game:
 *   - PRIMARY: Browser Web Speech API (SpeechRecognition) — instant, offline, no server cost
 *   - FALLBACK: Python Whisper backend (POST /api/transcribe) — for browsers without native support
 *
 * Usage:
 *   import { initVoiceToText, createMicButton } from './voice_to_text.js';
 *   const vtt = initVoiceToText(game);
 *   vtt.startListening((text) => console.log('Transcribed:', text));
 *   vtt.stopListening();
 *
 *   // Or add a mic button to any container:
 *   const btn = createMicButton(vtt);
 *   document.getElementById('bottom-bar').appendChild(btn);
 */

// ---------------------------------------------------------------------------
// Web Speech API detection
// ---------------------------------------------------------------------------

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const HAS_NATIVE_SPEECH = !!SpeechRecognition;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _game = null;
let _recognizer = null;
let _isListening = false;
let _onResult = null;
let _onError = null;
let _micBtn = null;

// Audio recording state for backend fallback
let _mediaRecorder = null;
let _audioChunks = [];
let _audioStream = null;

// ---------------------------------------------------------------------------
// Web Speech API — Primary Engine
// ---------------------------------------------------------------------------

/**
 * Initialize the Web Speech API recognizer.
 * @returns {object|null} Recognizer instance or null if unavailable
 */
function _initSpeechRecognizer() {
    if (!HAS_NATIVE_SPEECH) return null;
    try {
        const rec = new SpeechRecognition();
        rec.continuous = false;         // Single utterance per invocation
        rec.interimResults = false;     // Only final results
        rec.lang = navigator.language || 'en-US';
        rec.maxAlternatives = 1;

        rec.onresult = (event) => {
            const transcript = event.results[0][0].transcript.trim();
            if (transcript && typeof _onResult === 'function') {
                _onResult(transcript);
            }
            _setIdle();
        };

        rec.onerror = (event) => {
            console.warn('[VoiceToText] Speech recognition error:', event.error);
            // If the error is not-recoverable like 'not-allowed', notify the caller
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                if (typeof _onError === 'function') _onError(event.error);
            }
            // For 'no-speech' or 'aborted', just reset silently
            _setIdle();
        };

        rec.onend = () => {
            _setIdle();
        };

        return rec;
    } catch (e) {
        console.warn('[VoiceToText] Failed to create SpeechRecognition:', e);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Backend Whisper — Fallback Engine
// ---------------------------------------------------------------------------

/**
 * Record audio from the microphone and send it to the Whisper backend.
 * @returns {Promise<string>} Transcribed text
 */
async function _transcribeViaBackend() {
    try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        _audioStream = stream;

        // Record audio (max 30 seconds)
        const mediaRecorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm'
        });
        _mediaRecorder = mediaRecorder;
        _audioChunks = [];

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (mediaRecorder.state === 'recording') mediaRecorder.stop();
            }, 30000); // 30s max recording

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) _audioChunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                clearTimeout(timeout);
                _cleanupAudioStream();

                if (_audioChunks.length === 0) {
                    reject(new Error('No audio captured'));
                    return;
                }

                try {
                    const blob = new Blob(_audioChunks, { type: 'audio/webm' });
                    const formData = new FormData();
                    formData.append('audio', blob, 'recording.webm');

                    const response = await fetch('/api/transcribe', {
                        method: 'POST',
                        body: formData
                    });

                    if (!response.ok) {
                        const errText = await response.text().catch(() => 'Unknown error');
                        throw new Error(`Backend transcription failed: ${response.status} ${errText}`);
                    }

                    const data = await response.json();
                    resolve(data.text || '');
                } catch (e) {
                    reject(e);
                } finally {
                    _audioChunks = [];
                }
            };

            mediaRecorder.onerror = (e) => {
                clearTimeout(timeout);
                _cleanupAudioStream();
                reject(new Error('MediaRecorder error: ' + e.error));
            };

            // Start recording
            mediaRecorder.start();
        });
    } catch (e) {
        _cleanupAudioStream();
        throw e;
    }
}

/**
 * Clean up microphone stream and recorder.
 */
function _cleanupAudioStream() {
    _mediaRecorder = null;
    _audioChunks = [];
    if (_audioStream) {
        _audioStream.getTracks().forEach(t => t.stop());
        _audioStream = null;
    }
}

// ---------------------------------------------------------------------------
// UI State Helpers
// ---------------------------------------------------------------------------

function _setListening() {
    _isListening = true;
    if (_micBtn) {
        _micBtn.dataset.state = 'listening';
        _micBtn.innerHTML = '🎤 ■';
        _micBtn.style.background = 'rgba(255,50,50,0.6)';
        _micBtn.style.borderColor = '#ff4444';
        _micBtn.style.animation = 'mic-pulse 0.8s ease-in-out infinite';
    }
}

function _setIdle() {
    _isListening = false;
    if (_micBtn) {
        _micBtn.dataset.state = 'idle';
        _micBtn.innerHTML = '🎤';
        _micBtn.style.background = 'rgba(255,255,255,0.08)';
        _micBtn.style.borderColor = 'rgba(255,255,255,0.2)';
        _micBtn.style.animation = 'none';
    }
}

function _setProcessing() {
    _isListening = true;  // Keep true to prevent double-trigger during backend recording
    if (_micBtn) {
        _micBtn.dataset.state = 'processing';
        _micBtn.innerHTML = '⏳';
        _micBtn.style.background = 'rgba(68,136,255,0.4)';
        _micBtn.style.borderColor = '#4488ff';
        _micBtn.style.animation = 'mic-pulse 1.2s ease-in-out infinite';
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the voice-to-text system.
 * Call once during game startup (e.g., from setupUI).
 *
 * @param {object} game - The game instance
 * @returns {{ startListening, stopListening, isSupported, isNative, isListening }}
 */
export function initVoiceToText(game) {
    _game = game;

    // Try native Web Speech API first
    _recognizer = _initSpeechRecognizer();

    // Inject mic pulse animation
    if (!document.getElementById('vtt-style')) {
        const style = document.createElement('style');
        style.id = 'vtt-style';
        style.textContent = `
            @keyframes mic-pulse {
                0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,50,50,0.4); }
                50% { transform: scale(1.08); box-shadow: 0 0 12px 4px rgba(255,50,50,0.2); }
            }
            .vtt-mic-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 36px;
                height: 36px;
                border-radius: 50%;
                border: 1px solid rgba(255,255,255,0.2);
                background: rgba(255,255,255,0.08);
                color: #fff;
                font-size: 16px;
                cursor: pointer;
                transition: all 0.2s ease;
                pointer-events: auto;
                font-family: 'Segoe UI', sans-serif;
                user-select: none;
            }
            .vtt-mic-btn:hover {
                background: rgba(255,255,255,0.15);
                transform: scale(1.05);
            }
            .vtt-mic-btn[data-state="listening"]:hover {
                background: rgba(255,50,50,0.7);
            }
            .vtt-tooltip {
                position: absolute;
                bottom: 100%;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0,0,0,0.85);
                color: #fff;
                font-size: 10px;
                padding: 4px 8px;
                border-radius: 4px;
                white-space: nowrap;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.2s;
                font-family: 'Segoe UI', sans-serif;
                margin-bottom: 6px;
            }
            .vtt-mic-btn:hover .vtt-tooltip {
                opacity: 1;
            }
            .vtt-result-toast {
                position: fixed;
                bottom: 80px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0,0,0,0.85);
                color: #fff;
                font-size: 14px;
                padding: 10px 20px;
                border-radius: 8px;
                max-width: 80%;
                text-align: center;
                pointer-events: none;
                z-index: 99999;
                backdrop-filter: blur(4px);
                border: 1px solid rgba(255,255,255,0.1);
                font-family: 'Segoe UI', sans-serif;
                animation: vtt-fadein 0.2s ease;
            }
            @keyframes vtt-fadein {
                from { opacity: 0; transform: translateX(-50%) translateY(10px); }
                to { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }

    return {
        startListening,
        stopListening,
        isSupported: HAS_NATIVE_SPEECH || true, // Backend fallback always available
        isNative: HAS_NATIVE_SPEECH,
        get isListening() { return _isListening; },
    };
}

/**
 * Start voice input. Captures speech and calls onResult with the transcribed text.
 *
 * @param {function} onResult - Callback with transcribed text string
 * @param {function} [onError] - Error callback (receives error string)
 */
export async function startListening(onResult, onError) {
    if (_isListening) {
        stopListening();
        // Small delay to allow stop to settle
        await new Promise(r => setTimeout(r, 100));
    }

    // Always overwrite callbacks from the latest invocation
    _onResult = onResult || null;
    _onError = onError || null;

    if (!_onResult) {
        console.warn('[VoiceToText] startListening called without onResult callback');
        return;
    }

    _setListening();

    // Strategy 1: Web Speech API (native, instant)
    if (_recognizer) {
        try {
            _recognizer.start();
            return;
        } catch (e) {
            console.warn('[VoiceToText] Web Speech API failed to start, falling back to backend:', e);
        }
    }

    // Strategy 2: Backend Whisper (fallback)
    _setProcessing();
    try {
        const text = await _transcribeViaBackend();
        if (text && typeof _onResult === 'function') {
            _onResult(text);
        } else if (typeof _onError === 'function') {
            _onError('No speech detected');
        }
    } catch (e) {
        console.error('[VoiceToText] Backend transcription failed:', e);
        if (typeof _onError === 'function') {
            _onError(e.message || 'Transcription failed');
        }
    } finally {
        _setIdle();
    }
}

/**
 * Stop any active voice input (native or backend recording).
 */
export function stopListening() {
    if (_recognizer && _isListening) {
        try { _recognizer.abort(); } catch (e) { /* ignore */ }
    }
    if (_mediaRecorder && _mediaRecorder.state === 'recording') {
        try { _mediaRecorder.stop(); } catch (e) { /* ignore */ }
    }
    _cleanupAudioStream();
    _setIdle();
}

/**
 * Show a transient toast with the transcribed text.
 * @param {string} text
 */
export function showTranscriptionToast(text) {
    // Remove any existing toast
    const prev = document.querySelector('.vtt-result-toast');
    if (prev) prev.remove();

    const toast = document.createElement('div');
    toast.className = 'vtt-result-toast';
    toast.textContent = `🗣️ ${text}`;
    document.body.appendChild(toast);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Create a microphone button that can be added to any container.
 * Shows a tooltip on hover, pulses red when listening.
 *
 * @param {object} vtt - The object returned by initVoiceToText()
 * @param {object} [options]
 * @param {function} [options.onResult] - Called with transcribed text
 * @param {string} [options.tooltip] - Tooltip text (default: "Voice input")
 * @returns {HTMLElement} The microphone button element
 */
export function createMicButton(vtt, options = {}) {
    const btn = document.createElement('button');
    btn.className = 'vtt-mic-btn';
    btn.dataset.state = 'idle';
    btn.setAttribute('aria-label', options.tooltip || 'Voice input');
    btn.innerHTML = '🎤';

    // Tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'vtt-tooltip';
    tooltip.textContent = options.tooltip || (vtt.isNative ? 'Voice input (native)' : 'Voice input (server)');
    btn.appendChild(tooltip);

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (vtt.isListening) {
            stopListening();
            return;
        }

        const onResult = options.onResult || ((text) => {
            showTranscriptionToast(text);
        });

        startListening(onResult, (error) => {
            console.warn('[VoiceToText] Error:', error);
            showTranscriptionToast(`❌ ${error}`);
        });
    });

    _micBtn = btn;
    return btn;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Clean up all voice-to-text resources. Call when game is destroyed.
 */
export function destroyVoiceToText() {
    stopListening();
    _game = null;
    _recognizer = null;
    _onResult = null;
    _onError = null;
    _micBtn = null;
}
