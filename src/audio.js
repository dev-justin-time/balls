/*
 Audio module.
 Exports: initAudio(game) - sets up rolling SFX, background music, music toggle button.
*/
export function initAudio(game) {
    // Rolling SFX
    game.rollSound = new Audio('assets/sfx/rolling_loop.mp3');
    game.rollSound.loop = true;
    game.rollSound.volume = 0;
    game.rollSoundStarted = false;

    // Background music
    game.backgroundMusic = new Audio('assets/sfx/elevator_music.mp3');
    game.backgroundMusic.loop = true;
    game.backgroundMusic.volume = 0.18;
    game.backgroundMusicStarted = false;
    game.musicEnabled = (localStorage.getItem('goingBalls_musicEnabled') !== 'false');

    // --- Music visualizer: AudioContext analyser + border canvas ---
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        game._audioCtx = new AudioCtx();
        game._mediaSrc = game._audioCtx.createMediaElementSource(game.backgroundMusic);
        game._analyser = game._audioCtx.createAnalyser();
        game._analyser.fftSize = 256;
        game._analyser.smoothingTimeConstant = 0.6;
        game._mediaSrc.connect(game._analyser);
        game._analyser.connect(game._audioCtx.destination);
        game._freqData = new Uint8Array(game._analyser.frequencyBinCount);

        const canvas = document.createElement('canvas');
        canvas.id = 'music-visualizer';
        canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:1001;';
        document.body.appendChild(canvas);
        game._visCanvas = canvas;
        game._visCtx = canvas.getContext('2d');
        const resizeVis = () => {
            canvas.width = Math.max(300, window.innerWidth);
            canvas.height = Math.max(200, window.innerHeight);
        };
        resizeVis();
        window.addEventListener('resize', resizeVis);
    } catch (e) {
        console.warn('AudioContext/analyser unavailable, visualizer disabled', e);
        game._audioCtx = null;
        game._analyser = null;
        game._freqData = null;
        game._visCanvas = null;
        game._visCtx = null;
    }

    // Resume audio context on user interaction
    const resumeAudioCtx = async () => {
        try {
            if (game._audioCtx && game._audioCtx.state === 'suspended') await game._audioCtx.resume();
        } catch (e) {}
    };
    window.addEventListener('keydown', resumeAudioCtx, { once: true });
    window.addEventListener('mousedown', resumeAudioCtx, { once: true });
    window.addEventListener('touchstart', resumeAudioCtx, { once: true });

    // Resume audio context on first interaction
    const resumeAudio = () => {
        if (!game.rollSoundStarted) {
            game.rollSound.play().catch(() => {});
            game.rollSoundStarted = true;
        }
        if (!game.backgroundMusicStarted && game.musicEnabled) {
            game.backgroundMusic.play().catch(() => {});
            game.backgroundMusicStarted = true;
        }
        window.removeEventListener('keydown', resumeAudio);
        window.removeEventListener('mousedown', resumeAudio);
        window.removeEventListener('touchstart', resumeAudio);
    };
    window.addEventListener('keydown', resumeAudio);
    window.addEventListener('mousedown', resumeAudio);
    window.addEventListener('touchstart', resumeAudio);

    // Pause music when overlay/menu is open
    const overlay = document.getElementById('overlay');
    const topMenu = document.getElementById('top-menu');
    const updateMusicOnUI = () => {
        const menuVisible = topMenu && topMenu.classList.contains('visible');
        const overlayVisible = overlay && overlay.style.display === 'flex';
        if (!game.musicEnabled) {
            game.backgroundMusic.pause();
            return;
        }
        if (menuVisible || overlayVisible) {
            game.backgroundMusic.volume = 0.06;
            if (game.backgroundMusic.paused && game.backgroundMusicStarted) game.backgroundMusic.play().catch(()=>{});
        } else {
            game.backgroundMusic.volume = 0.18;
            if (game.backgroundMusic.paused && game.backgroundMusicStarted) game.backgroundMusic.play().catch(()=>{});
        }
    };

    if (topMenu) {
        const observer = new MutationObserver(updateMusicOnUI);
        observer.observe(topMenu, { attributes: true, attributeFilter: ['class'] });
    }
    setInterval(updateMusicOnUI, 500);

    // Music toggle button
    const musicBtn = document.getElementById('music-toggle');
    const updateMusicButtonUI = () => {
        if (!musicBtn) return;
        musicBtn.innerText = game.musicEnabled ? 'MUSIC: ON' : 'MUSIC: OFF';
        musicBtn.style.borderColor = game.musicEnabled ? '#00ff88' : 'white';
        musicBtn.style.background = game.musicEnabled ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)';
    };
    updateMusicButtonUI();

    if (musicBtn) {
        musicBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            game.musicEnabled = !game.musicEnabled;
            localStorage.setItem('goingBalls_musicEnabled', game.musicEnabled ? 'true' : 'false');
            if (game.musicEnabled) {
                game.backgroundMusic.play().catch(()=>{});
                game.backgroundMusicStarted = true;
            } else {
                try { game.backgroundMusic.pause(); } catch (e) {}
            }
            updateMusicButtonUI();
        });
    }
}

// SFX player - simple clone-based pool
const _sfxPool = {};

export function playSound(name) {
    try {
        const a = _sfxPool[name];
        if (!a) return;
        const clone = a.cloneNode();
        clone.play().catch(()=>{});
        clone.addEventListener('ended', () => { try { clone.remove(); } catch(e){} });
    } catch (e) {}
}

export function registerSfx(name, url) {
    try {
        const a = new Audio(url);
        a.preload = 'auto';
        _sfxPool[name] = a;
    } catch (e) { /* ignore */ }
}

// Portal teleport sound — Web Audio API generated whoosh (no file needed)
export function playPortalSound(game) {
    try {
        const ctx = game._audioCtx;
        if (!ctx) return;
        const now = ctx.currentTime;

        // Noise buffer for whoosh texture
        const bufSize = ctx.sampleRate * 0.3;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = ctx.createBufferSource();
        noise.buffer = buf;

        // Bandpass filter for sci-fi character
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(3000, now);
        filter.frequency.exponentialRampToValueAtTime(400, now + 0.25);
        filter.Q.value = 1.5;

        // Gain envelope: quick attack, decay
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(now);
        noise.stop(now + 0.3);
    } catch (e) { /* non-fatal — portal SFX is optional */ }
}
