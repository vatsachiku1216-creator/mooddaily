import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getRemoteConfig, getValue, fetchAndActivate } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-remote-config.js";

// 1. FIREBASE CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyBoMGDWZi8X_8rqMXVM-z6KPVw3AFQ2HQ4",
    authDomain: "mooddaily.firebaseapp.com",
    projectId: "mooddaily",
    storageBucket: "mooddaily.firebasestorage.app",
    messagingSenderId: "77985784890",
    appId: "1:77985784890:web:82615635abf41ecb1e8103",
    measurementId: "G-YKKG7JZZE6"
};  

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// 2. REMOTE CONFIG (The "Vault")
const remoteConfig = getRemoteConfig(app);
remoteConfig.settings.minimumFetchIntervalMillis = 3600000; 

let SECURE_GEMINI_KEY = "";

async function initSecurity() {
    try {
        await fetchAndActivate(remoteConfig);
        SECURE_GEMINI_KEY = getValue(remoteConfig, 'GEMINI_API_KEY').asString();
        console.log("Security Handshake Complete.");
    } catch (err) {
        console.error("Vault Access Failed:", err);
    }
}
initSecurity();

// 3. UI STATE & ELEMENTS
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const mainNav = document.getElementById('main-nav');
const loader = document.getElementById('loader');
const vibeToggle = document.getElementById('vibe-toggle');
const vibeToggleContainer = document.querySelector('.vibe-toggle-container');

let isThinking = false;

// 4. AUTHENTICATION
onAuthStateChanged(auth, (user) => {
    loader.classList.add('hidden');
    if (user) {
        authContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        if (mainNav) mainNav.classList.remove('hidden');
        document.getElementById('user-display').innerText = `HI, ${user.displayName.split(' ')[0]}`;
        checkDailyStatus();
    } else {
        authContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
        if (mainNav) mainNav.classList.add('hidden');
    }
});

if (loginBtn) loginBtn.onclick = () => signInWithPopup(auth, provider);
if (logoutBtn) logoutBtn.onclick = () => signOut(auth);

// 5. CLOCK & PERSISTENT TOGGLE
if (vibeToggle) {
    const savedVibe = localStorage.getItem('vibeEnabled') === 'true';
    
    // Apply immediately on load
    vibeToggle.checked = savedVibe;
    document.body.classList.toggle('vibe-mode', savedVibe);

    vibeToggle.onchange = () => {
        const isEnabled = vibeToggle.checked;
        document.body.classList.toggle('vibe-mode', isEnabled);
        localStorage.setItem('vibeEnabled', isEnabled);
    };
}

function updateClock() {
    const clock = document.getElementById('clock-display');
    if (clock) clock.innerText = new Date().toLocaleTimeString('en-GB');
}
setInterval(updateClock, 1000);
updateClock();

// 6. CLICK LISTENER
document.addEventListener('click', (e) => {
    const card = e.target.closest('.mood-card');
    const resetBtn = e.target.closest('.reset-btn');

    if (resetBtn) {
        backToSelection();
        return;
    }

    if (!card || isThinking) return;

    const mood = card.getAttribute('data-mood');
    const today = new Date().toDateString();
    const savedDate = localStorage.getItem('moodDate');

    if (savedDate === today) {
        const savedData = JSON.parse(localStorage.getItem('moodData'));
        showFullPageMessage(savedData.moodType, savedData, true);
    } else {
        handleMood(mood);
    }
});

function backToSelection() {
    document.getElementById('selection-page').classList.remove('hidden');
    document.getElementById('message-area').classList.add('hidden');
    
    // Ensure the toggle container comes back
    if (vibeToggleContainer) {
        vibeToggleContainer.classList.remove('hidden');
        
        // RE-SYNC: Make sure the toggle and body still match localStorage
        const isEnabled = localStorage.getItem('vibeEnabled') === 'true';
        vibeToggle.checked = isEnabled;
        document.body.classList.toggle('vibe-mode', isEnabled);
    }
}

// 7. AI LOGIC
const handleMood = async (mood) => {
    if (!SECURE_GEMINI_KEY) {
        await initSecurity();
        if (!SECURE_GEMINI_KEY) {
            alert("Security check in progress. Please wait.");
            return;
        }
    }

    isThinking = true; 
    document.getElementById('selection-page').classList.add('hidden');
    if (vibeToggleContainer) vibeToggleContainer.classList.add('hidden');
    loader.classList.remove('hidden');

    const isVibe = vibeToggle && vibeToggle.checked;
    
    // Strict prompt to minimize extra output
    const PROMPT = isVibe 
    ? `Gen Z slang for ${mood}. Format: "Quote" | Do-Action | Don't-Action. NO LABELS. Quote must be 3+ words.` 
    : `Brutalist noir philosophy for ${mood}. Format: "Quote" | Do-Action | Don't-Action. NO LABELS. Quote must be 3+ words. Do not add any text after the Don't-Action.`;

    const model = "gemini-2.5-flash-lite"; 
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${SECURE_GEMINI_KEY}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: PROMPT }] }]
            })
        });

        if (!response.ok) throw new Error(`API_${response.status}`);

const data = await response.json();
const rawText = data.candidates[0].content.parts[0].text.trim();

// 1. Split by pipe and take only the first 3 parts
const parts = rawText.replace(/\*/g, '').split('|').map(s => s.trim()).slice(0, 3);

// 2. NEW: Function to strip hallucinated quotes from the end of a string
// This removes things like: "Don't do this. 'Shadows are real.'" -> "Don't do this."
const stripHallucinatedQuote = (str) => {
    if (!str) return "";
    // This regex looks for the first occurrence of a quote mark after some text
    // and cuts everything from that quote mark onwards.
    const quoteIndex = str.indexOf('"');
    return quoteIndex !== -1 ? str.substring(0, quoteIndex).trim() : str;
};

// 3. Clean Labels AND strip extra quotes from the actions
const cleanDo = parts[1] ? stripHallucinatedQuote(parts[1].replace(/^do:?\s*/i, "")) : "Wait.";
const cleanDont = parts[2] ? stripHallucinatedQuote(parts[2].replace(/^don't:?\s*/i, "")) : "Panic.";

const moodData = { 
    quote: parts[0] || "The void is silent.", 
    doAction: cleanDo, 
    dontAction: cleanDont, 
    moodType: mood 
};

        localStorage.setItem('moodDate', new Date().toDateString());
        localStorage.setItem('moodData', JSON.stringify(moodData));
        
        loader.classList.add('hidden');
        showFullPageMessage(mood, moodData);

    } catch (error) {
        console.error("AI Error:", error);
        loader.classList.add('hidden');
        const fallback = isVibe 
            ? { quote: "SERVERS GHOSTED US.", doAction: "Stay chill.", dontAction: "Panic." }
            : { quote: "THE SYSTEM IS OFFLINE.", doAction: "Reflect.", dontAction: "Inquire." };
        showFullPageMessage(mood, fallback);
    } finally {
        isThinking = false; 
    }
};

// 8. UI DISPLAY LOGIC
function checkDailyStatus() {
    if (localStorage.getItem('moodDate') === new Date().toDateString()) {
        const data = JSON.parse(localStorage.getItem('moodData'));
        showFullPageMessage(data.moodType, data, true);
    }
}

function showFullPageMessage(mood, dataObj, isReturning = false) {
    document.getElementById('selection-page').classList.add('hidden');
    if (vibeToggleContainer) vibeToggleContainer.classList.add('hidden');

    const area = document.getElementById('message-area');
    area.classList.remove('hidden');
    area.classList.add('full-page-message');
    
    document.getElementById('mood-label').innerText = `TODAY: ${mood}`;
    const rows = document.querySelectorAll('.action-row');

    let quotedText = dataObj.quote.startsWith('"') ? dataObj.quote : `"${dataObj.quote}"`;

    if (isReturning) {
        document.getElementById('daily-text').innerText = quotedText;
        document.getElementById('do-text').innerText = dataObj.doAction;
        document.getElementById('dont-text').innerText = dataObj.dontAction;
        rows.forEach(r => r.classList.add('reveal'));
    } else {
        document.getElementById('do-text').innerText = "";
        document.getElementById('dont-text').innerText = "";
        rows.forEach(r => r.classList.remove('reveal'));
        
        typeWriter(quotedText, 'daily-text', () => {
            document.getElementById('do-text').innerText = dataObj.doAction;
            document.getElementById('dont-text').innerText = dataObj.dontAction;
            setTimeout(() => rows.forEach(r => r.classList.add('reveal')), 200);
        });
    }
}

function typeWriter(text, id, callback) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerText = "";
    let i = 0;
    function type() {
        if (i < text.length) {
            el.innerText += text.charAt(i++);
            setTimeout(type, 50);
        } else if (callback) callback();
    }
    type();
}

