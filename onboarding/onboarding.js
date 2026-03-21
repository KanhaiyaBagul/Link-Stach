import { auth } from '../js/firebase-config.js';

let currentScreenIndex = 0;
const screens = ['welcome', 'signin', 'permissions', 'tour', 'first-save'];

document.addEventListener('DOMContentLoaded', () => {
    // Initial State Check
    auth.onAuthStateChanged(user => {
        if (user) {
            // If already logged in, check if we need permissions or just go to tour/dashboard
            checkPermissions().then(hasPermissions => {
                if (hasPermissions) {
                    showScreen('tour');
                } else {
                    showScreen('permissions');
                }
            });
        }
    });

    setupEventListeners();
});

function showScreen(screenId) {
    const screenIndex = screens.indexOf(screenId);
    if (screenIndex === -1) return;
    
    currentScreenIndex = screenIndex;
    
    // Hide all screens
    document.querySelectorAll('.onboarding-screen').forEach(s => s.classList.remove('active'));
    
    // Show target screen
    const target = document.getElementById(`screen-${screenId}`);
    if (target) {
        target.classList.add('active');
        updateProgressBar(screenIndex);
    }
}

function updateProgressBar(index) {
    const progress = ((index + 1) / screens.length) * 100;
    document.getElementById('progress-bar').style.width = `${progress}%`;
}

function setupEventListeners() {
    // Screen 1 -> 2
    document.getElementById('get-started-btn').addEventListener('click', () => showScreen('signin'));

    // Screen 2: Google Login
    document.getElementById('google-login-btn').addEventListener('click', async () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        const errorEl = document.getElementById('error-msg');
        
        try {
            await auth.signInWithPopup(provider);
            // onAuthStateChanged will handle the transition
        } catch (err) {
            console.error(err);
            errorEl.textContent = `Error: ${err.message}. If the popup was blocked, please allow it and try again.`;
            errorEl.classList.remove('hidden');
        }
    });

    // Screen 3: Permissions
    document.getElementById('allow-btn').addEventListener('click', async () => {
        try {
            const granted = await chrome.permissions.request({
                permissions: ['activeTab', 'contextMenus']
            });
            
            if (granted) {
                showScreen('tour');
            } else {
                alert("LinkStash works best with these permissions. You can still continue, but some features may be limited.");
                showScreen('tour');
            }
        } catch (err) {
            console.error("Permission request error:", err);
            showScreen('tour');
        }
    });

    // Screen 4: Tour Navigation
    let currentSlide = 0;
    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.dot');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const finishBtn = document.getElementById('finish-btn');

    function updateSlides() {
        slides.forEach((s, i) => s.classList.toggle('active', i === currentSlide));
        dots.forEach((d, i) => d.classList.toggle('active', i === currentSlide));
        
        prevBtn.classList.toggle('hidden', currentSlide === 0);
        nextBtn.classList.toggle('hidden', currentSlide === slides.length - 1);
        finishBtn.classList.toggle('hidden', currentSlide !== slides.length - 1);
    }

    nextBtn.addEventListener('click', () => {
        if (currentSlide < slides.length - 1) {
            currentSlide++;
            updateSlides();
        }
    });

    prevBtn.addEventListener('click', () => {
        if (currentSlide > 0) {
            currentSlide--;
            updateSlides();
        }
    });

    document.getElementById('skip-tour-btn').addEventListener('click', () => showScreen('first-save'));
    finishBtn.addEventListener('click', () => showScreen('first-save'));

    // Screen 5: First Save
    document.getElementById('save-current-btn').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            const urlParams = new URLSearchParams({ 
                url: tab.url, 
                title: tab.title,
                source: 'onboarding' 
            }).toString();
            
            // Redirect to save flow
            window.location.href = `../save/save.html?${urlParams}`;
        } else {
            window.location.href = '../options/options.html';
        }
    });

    document.getElementById('skip-final-btn').addEventListener('click', () => {
        window.location.href = '../options/options.html';
    });
}

async function checkPermissions() {
    return new Promise(resolve => {
        chrome.permissions.contains({
            permissions: ['activeTab', 'contextMenus']
        }, resolve);
    });
}
