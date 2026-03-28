import { auth } from '../js/firebase-config.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Check if already logged in
    auth.onAuthStateChanged(user => {
        if (user) {
            window.close(); // Close onboarding tab since we are logged in
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
            console.log("Starting offscreen Google login...");
            // Send message to background to handle auth via offscreen doc
            chrome.runtime.sendMessage({ action: "signInWithGoogle" }, (response) => {
                if (response && response.success) {
                    console.log("Offscreen login success!");
                    // onAuthStateChanged will naturally fire and close the tab
                } else {
                    const errorMsg = response ? response.error : "Unknown error";
                    console.error("Auth Bridge error:", errorMsg);
                    showError(`Auth failed: ${errorMsg}`);
                }
            });
        } catch (err) {
            console.error("Bridge Communication Error:", err);
            showError(`Error starting authentication: ${err.message}`);
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
