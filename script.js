import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

// UI Elements
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const loader = document.getElementById('loader');

// Auth Logic
loginBtn.onclick = () => signInWithPopup(auth, provider);
logoutBtn.onclick = () => signOut(auth);

onAuthStateChanged(auth, (user) => {
    if (user) {
        authContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        document.getElementById('user-display').innerText = `HI, ${user.displayName.split(' ')[0]}`;
        checkDailyStatus();
    } else {
        authContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }
});

// Click Listener for Mood Cards
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('mood-card')) {
        const selectedMood = e.target.getAttribute('data-mood');
        handleMood(selectedMood);
    }
});

// Clock Logic
function updateClock() {
    const now = new Date();
    document.getElementById('clock-display').innerText = now.toLocaleTimeString('en-GB');
}
setInterval(updateClock, 1000);

// --- AI MOOD LOGIC ---
const GEMINI_API_KEY = "AIzaSyATDqsVQ0FQAayHbtpomOaFum20HAGE3ao"; 

const handleMood = async (mood) => {
    const selectionPage = document.getElementById('selection-page');
    
    // 1. Enter Loading State
    selectionPage.classList.add('hidden');
    loader.classList.remove('hidden');

    const PROMPT = `You are a minimalist philosopher. For someone feeling ${mood}, provide:
    1. A one-sentence, noir, brutalist quote.
    2. A single "Do" action (2-4 words).
    3. A single "Don't" action (2-4 words).
    Format it exactly like this: Quote | Do action | Don't action. 
    No labels, no emojis. Max 25 words total.`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: PROMPT }] }]
            })
        });

        const data = await response.json();
        const rawText = data.candidates[0].content.parts[0].text.trim();
        
        // Split the response into parts
        const [quote, doAction, dontAction] = rawText.split('|').map(s => s.trim());

        // Create the data object
        const moodData = { 
            quote: quote || "The archive is silent.", 
            doAction: doAction || "Wait.", 
            dontAction: dontAction || "Rush.", 
            moodType: mood 
        };

        // Save to LocalStorage
        localStorage.setItem('moodDate', new Date().toDateString());
        localStorage.setItem('moodData', JSON.stringify(moodData));

        // 2. Exit Loading State & Show Result
        loader.classList.add('hidden');
        showFullPageMessage(mood, moodData);

    } catch (error) {
        console.error("AI Error:", error);
        loader.classList.add('hidden');
        showFullPageMessage(mood, { quote: "SYSTEM TIMEOUT. THE ARCHIVE IS SILENT.", doAction: "Retry.", dontAction: "Panic." });
    }
};

// --- STABLE UI LOGIC ---

function checkDailyStatus() {
    const lastSavedDate = localStorage.getItem('moodDate');
    const savedData = localStorage.getItem('moodData');
    
    if (lastSavedDate === new Date().toDateString() && savedData) {
        const moodData = JSON.parse(savedData);
        showFullPageMessage(moodData.moodType, moodData, true);
    }
}

function showFullPageMessage(mood, dataObj, isReturning = false) {
    const area = document.getElementById('message-area');
    const selectionPage = document.getElementById('selection-page');
    
    selectionPage.classList.add('hidden');
    area.classList.remove('hidden');
    area.classList.add('full-page-message');
    
    document.getElementById('mood-label').innerText = `TODAY: ${mood}`;
    
    if (isReturning) {
        document.getElementById('daily-text').innerText = dataObj.quote;
        document.getElementById('do-text').innerText = dataObj.doAction;
        document.getElementById('dont-text').innerText = dataObj.dontAction;
    } else {
        typeWriter(dataObj.quote, 'daily-text');
        // Clear previous actions while typing
        document.getElementById('do-text').innerText = "";
        document.getElementById('dont-text').innerText = "";
        
        // Show actions after quote types
        setTimeout(() => {
            document.getElementById('do-text').innerText = dataObj.doAction;
            document.getElementById('dont-text').innerText = dataObj.dontAction;
        }, 1500);
    }
}

function typeWriter(text, id) {
    const el = document.getElementById(id);
    el.innerText = "";
    let i = 0;
    function type() {
        if (i < text.length) {
            el.innerText += text.charAt(i);
            i++;
            setTimeout(type, 50);
        }
    }
    type();
}