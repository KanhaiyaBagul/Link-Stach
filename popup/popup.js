import { auth } from '../js/firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    const mainView = document.getElementById('main-view');
    const authView = document.getElementById('auth-view');
    const loadingView = document.getElementById('loading-view');

    auth.onAuthStateChanged(user => {
        loadingView.classList.add('hidden');
        if (user) {
            mainView.classList.remove('hidden');
            authView.classList.add('hidden');
            setupPopupUI();
        } else {
            mainView.classList.add('hidden');
            authView.classList.remove('hidden');
            setupAuthUI();
        }
    });
});

function setupAuthUI() {
    document.getElementById('open-onboarding-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: 'onboarding/onboarding.html' });
    });
}

function setupPopupUI() {
    const saveBtn = document.getElementById('save-btn');
    const searchInput = document.getElementById('search-input');
    
    saveBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            const urlParams = new URLSearchParams({ url: tab.url, title: tab.title }).toString();
            window.location.href = `../save/save.html?${urlParams}`;
        }
    });

    // ... handle search and recent links ...
}
