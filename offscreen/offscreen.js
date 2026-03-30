// offscreen.js — runs as a plain script, Firebase globals set by HTML script tags

const firebaseConfig = {
    apiKey: "AIzaSyCItzc_DOEJQvr77DMXSlexTEDGTSNMHUQ",
    authDomain: "link-stach.firebaseapp.com",
    projectId: "link-stach",
    storageBucket: "link-stach.firebasestorage.app",
    messagingSenderId: "344277938908",
    appId: "1:344277938908:web:af1c2e687e71f7385cfa19"
};

// Initialize Firebase only if not already done
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();

console.log("Offscreen: Firebase initialized, setting up listener...");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Offscreen received message:", message.action);
    if (message.action === 'signInWithGoogle') {
        const provider = new firebase.auth.GoogleAuthProvider();
        console.log("Offscreen: starting signInWithPopup...");

        auth.signInWithPopup(provider)
            .then(result => {
                console.log("Offscreen: sign-in success!", result.user.email);
                sendResponse({
                    success: true,
                    user: { uid: result.user.uid, email: result.user.email }
                });
            })
            .catch(error => {
                console.error("Offscreen auth error:", error.code, error.message);
                sendResponse({ success: false, error: error.message });
            });

        return true; // keep channel open for async sendResponse
    }

    if (message.action === 'playAudio') {
        const audio = new Audio(message.source);
        audio.volume = message.volume || 1.0;
        audio.play()
            .then(() => sendResponse({ success: true }))
            .catch(err => {
                console.error("Audio playback error:", err);
                sendResponse({ success: false, error: err.message });
            });
        return true;
    }
});

// Signal ready after a tiny delay so the background listener is active
console.log("Offscreen: sending OFFSCREEN_READY...");
chrome.runtime.sendMessage({ action: 'OFFSCREEN_READY' }, () => {
    // Ignore any "no receiver" error — background is already waiting
    if (chrome.runtime.lastError) {
        console.warn("Offscreen ready signal warning:", chrome.runtime.lastError.message);
    }
});
