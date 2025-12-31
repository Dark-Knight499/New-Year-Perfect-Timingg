/**
 * REGISTRY DATA (Embedded for Offline Access)
 * This allows the app to work directly from the file system without CORS errors.
 */
const REGISTRY_DATA = [
    `
name: "Yeh Jawaani Hai Deewani"
duration: 12
start_time_before_new_year: "00:11"
path: "./clips/yjhd.mp4"
`
];

// State
let clips = [];
let selectedClip = null;
let videoBlobUrl = null;
let midnight = new Date(new Date().getFullYear() + 1, 0, 1, 0, 0, 0).getTime();

// DOM Elements
const views = {
    selection: document.getElementById('selection-view'),
    countdown: document.getElementById('countdown-view')
};
const cardTrack = document.getElementById('card-track');
const armBtn = document.getElementById('arm-btn');
const timeEls = {
    h: document.getElementById('hours'),
    m: document.getElementById('minutes'),
    s: document.getElementById('seconds')
};
const videoContainer = document.getElementById('video-container');
const video = document.getElementById('main-video');
const statusMsg = document.getElementById('status-msg');

// Dev Panel
let devOffset = 0;
if (location.hash === '#dev') {
    document.getElementById('dev-panel').classList.remove('hidden');
}

// Keybinds (Dev Panel)
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        document.getElementById('dev-panel').classList.toggle('hidden');
    }
});

document.getElementById('dev-set-midnight').addEventListener('click', () => {
    const now = Date.now();
    midnight = now + 10000; // 10s from now
    devOffset = 0;
    log(`Dev: Midnight set to ${new Date(midnight).toLocaleTimeString()}`);
});

document.getElementById('dev-set-target').addEventListener('click', () => {
    const timeInput = document.getElementById('dev-target-time').value;
    if (!timeInput) return;

    const [h, m] = timeInput.split(':').map(Number);
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);

    // If target is in the past, assume it's for tomorrow (or just let it be past for testing "missed" logic)
    // But usually for testing we want upcoming. 
    // If user sets 22:00 and it's 22:51, it's past. They probably meant 23:00.

    midnight = target.getTime();
    devOffset = 0;
    log(`Dev: Target set to ${target.toLocaleTimeString()}`);
});

document.getElementById('dev-offset').addEventListener('change', (e) => {
    devOffset = parseInt(e.target.value) * 1000;
    log(`Dev: Offset set to ${devOffset}ms`);
});

// App Init
async function init() {
    log('Initializing Midnight Gold...');
    loadRegistry();
    renderCarousel();
}

function loadRegistry() {
    try {
        clips = REGISTRY_DATA.map(yamlStr => {
            return jsyaml.load(yamlStr);
        });
        // Add ID based on index since no filename
        clips.forEach((c, i) => c.id = 'clip_' + i);

        log(`Loaded ${clips.length} clips internally.`);

        if (clips.length > 0) {
            selectClip(clips[0]);
        }
    } catch (e) {
        log('Error parsing embedded registry: ' + e.message);
        cardTrack.innerHTML = '<div style="color:red">Failed to load clips.</div>';
    }
}

function parseTimeStr(str) {
    if (typeof str === 'number') return str;
    const parts = str.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return Number(str);
}

function renderCarousel() {
    cardTrack.innerHTML = '';
    clips.forEach(clip => {
        const div = document.createElement('div');
        div.className = 'clip-card';
        div.innerHTML = `<h3>${clip.name}</h3><p>${clip.duration}s Sequence</p>`;
        div.onclick = () => selectClip(clip);
        if (selectedClip && selectedClip.id === clip.id) {
            div.classList.add('selected');
        }
        cardTrack.appendChild(div);
    });
}

function selectClip(clip) {
    selectedClip = clip;
    Array.from(cardTrack.children).forEach(c => c.classList.remove('selected'));
    const index = clips.indexOf(clip);
    if (cardTrack.children[index]) cardTrack.children[index].classList.add('selected');

    armBtn.disabled = false;
    log(`Selected: ${clip.name}`);
}

// Arming logic
armBtn.addEventListener('click', async () => {
    if (!selectedClip) return;

    views.selection.classList.remove('active');
    views.countdown.classList.add('active');

    statusMsg.innerText = "Buffering High-Res Content...";

    // Attempt normal load since validation is tricky with files without CORS
    // but try/catch might not catch a network 404 on <video> tag easily without listeners
    video.src = selectedClip.path;
    video.load();

    video.addEventListener('canplaythrough', onVideoReady, { once: true });
    video.addEventListener('error', (e) => {
        statusMsg.innerText = "Error loading video file.";
        log("Video error: " + e);
    });

    // Fallback if canplaythrough doesn't fire (sometimes local files are weird)
    setTimeout(() => {
        if (video.readyState >= 3) onVideoReady();
    }, 1000);
});

function onVideoReady() {
    statusMsg.innerText = "Ready for the Drop.";
    log('Video buffered and ready.');
    requestAnimationFrame(updateTimer);
}

document.getElementById('cancel-btn').addEventListener('click', () => {
    views.countdown.classList.remove('active');
    views.selection.classList.add('active');
    videoContainer.classList.add('hidden');
    video.pause();
    video.currentTime = 0;
    hasTriggered = false;
});

// Timing Logic
let hasTriggered = false;

function updateTimer() {
    if (!views.countdown.classList.contains('active')) return;

    const now = Date.now();
    const target = midnight + devOffset;
    const diff = target - now;

    if (diff > 0) {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);

        timeEls.h.innerText = h.toString().padStart(2, '0');
        timeEls.m.innerText = m.toString().padStart(2, '0');
        timeEls.s.innerText = s.toString().padStart(2, '0');
    } else {
        timeEls.h.innerText = "00";
        timeEls.m.innerText = "00";
        timeEls.s.innerText = "00";
    }

    if (!selectedClip) return;

    const startOffsetSec = parseTimeStr(selectedClip.start_time_before_new_year);
    const triggerTime = target - (startOffsetSec * 1000);

    // Trigger window
    if (!hasTriggered && now >= triggerTime) {
        // If we missed it by more than 5 seconds, don't play (user opened late)
        if (now - triggerTime < 5000) {
            log(`Triggering drop at ${new Date().toISOString()}`);
            playDrop();
        } else {
            console.warn("Missed the trigger window.");
        }
    }

    requestAnimationFrame(updateTimer);
}

function playDrop() {
    hasTriggered = true;
    videoContainer.classList.remove('hidden');
    video.currentTime = 0;
    video.volume = 1.0;

    const playPromise = video.play();
    if (playPromise !== undefined) {
        playPromise.then(_ => {
            log('Playback started');
        }).catch(error => {
            log('Playback failed: ' + error);
            // Auto-interaction policy might block this if user didn't click anything
            // But they clicked "Confirm Selection" which is a strong interaction.
        });
    }
}

function log(msg) {
    console.log(msg);
    const panel = document.getElementById('debug-log');
    if (panel) {
        const div = document.createElement('div');
        div.innerText = msg;
        panel.prepend(div);
    }
}

init();
