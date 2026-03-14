import { auth } from '../js/firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    // Check if already logged in -> redirect or close (if opened as tab)
    auth.onAuthStateChanged(user => {
        if (user) {
            window.close(); // Close onboarding tab since we are logged in
            // If it's the popup, we'd route to main popup, but we assume
            // this page is opened in a full tab on startup
        }
    });

    setupTabs();
    setupForms();
});

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab buttons
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update active forms
            const targetId = tab.dataset.target;
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            document.getElementById(`${targetId}-form`).classList.add('active');

            hideError();
        });
    });
}

function setupForms() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const googleBtn = document.getElementById('google-login-btn');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('login-btn');
        btn.disabled = true;
        btn.textContent = 'Logging in...';

        try {
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;
            await auth.signInWithEmailAndPassword(email, pass);
        } catch (err) {
            showError(err.message);
            btn.disabled = false;
            btn.textContent = 'Log In';
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('register-btn');
        btn.disabled = true;
        btn.textContent = 'Creating...';

        try {
            const email = document.getElementById('register-email').value;
            const pass = document.getElementById('register-password').value;
            await auth.createUserWithEmailAndPassword(email, pass);
        } catch (err) {
            showError(err.message);
            btn.disabled = false;
            btn.textContent = 'Create Account';
        }
    });

    googleBtn.addEventListener('click', async () => {
        try {
            // For Chrome MV3 extensions, signInWithPopup often fails. 
            // We will attempt signInWithPopup and if it blocks, provide a fallback alert asking user 
            // to configure chrome.identity. 
            // Usually passing a specific provider works if domains are authorized.
            const provider = new firebase.auth.GoogleAuthProvider();
            await auth.signInWithPopup(provider);
        } catch (err) {
            console.error(err);
            if (err.code === 'auth/operation-not-supported-in-this-environment' || err.code === 'auth/popup-closed-by-user') {
                showError("Google popup blocked or not supported in this extension context without advanced config. Please use Email/Password.");
            } else {
                showError(err.message);
            }
        }
    });
}

function showError(msg) {
    const errEl = document.getElementById('error-msg');
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
}

function hideError() {
    const errEl = document.getElementById('error-msg');
    errEl.classList.add('hidden');
}
