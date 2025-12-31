// Registry Manifest - Manually update this list when adding new YAML files to clips_registry/
const REGISTRY_FILES = [
    'yjhd.yaml'
];

// State
let clips = [];
let selectedClip = null;
let videoBlobUrl = null;
let midnight = new Date(new Date().getFullYear() + 1, 0, 1, 0, 0, 0).getTime(); // Default Next Year
// midnight = new Date().setHours(24,0,0,0); // Next midnight for testing? User wants New Year.

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
let devOffset = 0; // Seconds to shift "Midnight" by
if (location.hash === '#dev') {
    document.getElementById('dev-panel').classList.remove('hidden');
}
// Toggle Dev Panel with Ctrl+Shift+D
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        document.getElementById('dev-panel').classList.toggle('hidden');
    }
});

document.getElementById('dev-set-midnight').addEventListener('click', () => {
    const now = Date.now();
    // Set midnight to 10 seconds from now
    midnight = now + 10000;
    devOffset = 0; // Reset offset if manually setting target
    log(`Dev: Midnight set to ${new Date(midnight).toLocaleTimeString()}`);
});

document.getElementById('dev-offset').addEventListener('change', (e) => {
    devOffset = parseInt(e.target.value) * 1000;
    log(`Dev: Offset set to ${devOffset}ms`);
});

// App Init
async function init() {
    log('Initializing...');
    await loadRegistry();
    renderCarousel();

    // Check if it is already past New Year? (Not handling for now, assuming before)
}

async function loadRegistry() {
    try {
        const promises = REGISTRY_FILES.map(async file => {
            const res = await fetch(`clips_registry/${file}`);
            const text = await res.text();
            const data = jsyaml.load(text);
            return { ...data, id: file.replace('.yaml', '') };
        });
        clips = await Promise.all(promises);
        log(`Loaded ${clips.length} clips`);

        if (clips.length > 0) {
            selectClip(clips[0]); // Auto-select first
        }
    } catch (e) {
        log('Error loading registry: ' + e.message);
        cardTrack.innerHTML = '<div style="color:red; text-align:center;">Failed to load clips.<br><small>If running locally, simple file access is blocked by CORS. Please use a local server (e.g., python -m http.server) or deploy.</small></div>';
    }
}

function parseTimeStr(str) {
    // "00:11" -> 11 seconds
    const parts = str.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return Number(str);
}

function renderCarousel() {
    cardTrack.innerHTML = '';
    clips.forEach(clip => {
        const div = document.createElement('div');
        div.className = 'clip-card';
        div.innerHTML = `<h3>${clip.name}</h3><p>${clip.duration}s Clip</p>`;
        div.onclick = () => selectClip(clip);
        if (selectedClip && selectedClip.id === clip.id) {
            div.classList.add('selected');
        }
        cardTrack.appendChild(div);
    });
}

function selectClip(clip) {
    selectedClip = clip;
    // Update UI
    Array.from(cardTrack.children).forEach(c => c.classList.remove('selected'));
    // (In a real carousel, we'd map index, but simplistic here)
    const index = clips.indexOf(clip);
    if (cardTrack.children[index]) cardTrack.children[index].classList.add('selected');

    armBtn.disabled = false;
    log(`Selected: ${clip.name}`);
}

// Arming / View Switch
armBtn.addEventListener('click', async () => {
    if (!selectedClip) return;

    views.selection.classList.remove('active');
    views.countdown.classList.add('active');

    statusMsg.innerText = "Preloading video...";

    // Preload Video
    try {
        const res = await fetch(selectedClip.path);
        const blob = await res.blob();
        videoBlobUrl = URL.createObjectURL(blob);
        video.src = videoBlobUrl;
        video.load();
        log('Video preloaded blob size: ' + blob.size);
        statusMsg.innerText = "Waiting for the drop...";

        // Start Timer loop
        requestAnimationFrame(updateTimer);
    } catch (e) {
        statusMsg.innerText = "Error loading video: " + e.message;
    }
});

document.getElementById('cancel-btn').addEventListener('click', () => {
    views.countdown.classList.remove('active');
    views.selection.classList.add('active');
    videoContainer.classList.add('hidden');
    video.pause();
    video.currentTime = 0;
});

// Timing Logic
let hasTriggered = false;

function updateTimer() {
    if (!views.countdown.classList.contains('active')) return;

    const now = Date.now();
    const target = midnight + devOffset;
    const diff = target - now;

    // Formatting
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

    // Trigger Check
    if (!selectedClip) return;

    const startOffsetSec = parseTimeStr(selectedClip.start_time_before_new_year);
    // Time needed to start: Target - (Offset * 1000)
    // We want to hit play exactly at that moment

    const triggerTime = target - (startOffsetSec * 1000);

    // Check if we are past trigger time (and haven't triggered yet)
    // Allow a small window (e.g., within last 500ms) to avoid double triggering if loop is slow
    if (!hasTriggered && now >= triggerTime) {
        log(`Triggering drop at ${new Date().toISOString()} (Target: ${new Date(target).toISOString()})`);
        playDrop();
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
            statusMsg.innerText = "Click to Play!";
            statusMsg.onclick = () => video.play();
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
