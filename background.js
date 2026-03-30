const MAX_SCREENSHOT_WIDTH = 400; // Limit image size to prevent reaching storage limits
// ... (rest of background.js remains)
importScripts('./lib/firebase-app.js');
importScripts('./lib/firebase-auth.js');
importScripts('./lib/firebase-firestore.js');

const firebaseConfig = {
    apiKey: "AIzaSyCItzc_DOEJQvr77DMXSlexTEDGTSNMHUQ",
    authDomain: "link-stach.firebaseapp.com",
    projectId: "link-stach",
    storageBucket: "link-stach.firebasestorage.app",
    messagingSenderId: "344277938908",
    appId: "1:344277938908:web:af1c2e687e71f7385cfa19",
    measurementId: "G-DNL5FPZ7FC"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// ─── Sync: push local storage changes to Firestore ──────────────────────────
let isSyncingDown = false;
let unsubscribeLinks = null;

auth.onAuthStateChanged(async user => {
    if (user) {
        await pushLocalToFirestore(user);
        startFirestoreSync(user);
    } else {
        if (unsubscribeLinks) {
            unsubscribeLinks();
            unsubscribeLinks = null;
        }
    }
});

async function pushLocalToFirestore(user) {
    const result = await chrome.storage.local.get('links');
    const localLinks = result.links || [];
    if (localLinks.length === 0) return;
    localLinks.forEach(link => {
        db.collection('users').doc(user.uid).collection('links').doc(link.id)
            .set(link, { merge: true })
            .catch(err => console.error("Error syncing local to Firestore:", err));
    });
}

function startFirestoreSync(user) {
    const linksRef = db.collection('users').doc(user.uid).collection('links');
    unsubscribeLinks = linksRef.onSnapshot(async snapshot => {
        const result = await chrome.storage.local.get('links');
        let localLinks = result.links || [];
        let changed = false;

        snapshot.docChanges().forEach(change => {
            const data = change.doc.data();
            if (change.type === 'added' || change.type === 'modified') {
                const idx = localLinks.findIndex(l => l.id === data.id);
                if (idx === -1) { localLinks.push(data); changed = true; }
                else {
                    const localTime = localLinks[idx].updatedAt || localLinks[idx].createdAt || 0;
                    const remoteTime = data.updatedAt || data.createdAt || 0;
                    if (remoteTime > localTime) { localLinks[idx] = data; changed = true; }
                }
            }
            if (change.type === 'removed') {
                const before = localLinks.length;
                localLinks = localLinks.filter(l => l.id !== data.id);
                if (localLinks.length !== before) changed = true;
            }
        });

        if (changed) {
            isSyncingDown = true;
            localLinks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            await chrome.storage.local.set({ links: localLinks });
            setTimeout(() => { isSyncingDown = false; }, 1000);
        }
    });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local' || isSyncingDown) return;
    const user = auth.currentUser;
    if (!user) return;
    if (!changes.links) return;

    const newLinks = changes.links.newValue || [];
    const oldLinks = changes.links.oldValue || [];

    newLinks.forEach(newLink => {
        const oldLink = oldLinks.find(l => l.id === newLink.id);
        const localTime = newLink.updatedAt || newLink.createdAt || 0;
        const oldTime = oldLink ? (oldLink.updatedAt || oldLink.createdAt || 0) : 0;
        if (!oldLink || localTime > oldTime) {
            db.collection('users').doc(user.uid).collection('links')
                .doc(newLink.id).set(newLink, { merge: true });
        }
    });

    oldLinks.forEach(oldLink => {
        if (!newLinks.find(l => l.id === oldLink.id)) {
            db.collection('users').doc(user.uid).collection('links').doc(oldLink.id).delete();
        }
    });
});

// ─── Context Menu ────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "save-to-linkstash",
        title: "Save to LinkStash",
        contexts: ["page", "link"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "save-to-linkstash") {
        const targetUrl = info.linkUrl || info.pageUrl;
        const targetTitle = tab.title || "Unknown Title";
        const urlParams = new URLSearchParams({ url: targetUrl, title: targetTitle }).toString();
        chrome.windows.create({
            url: `save/save.html?${urlParams}`,
            type: "popup",
            width: 400,
            height: 600
        });
    }
});

// ─── Google Auth via chrome.identity (works on Chrome, Edge, Brave) ─────────
const GOOGLE_CLIENT_ID = '344277938908-le7t8f5rd2ofu49bv0jn3j3jvumgn12q.apps.googleusercontent.com';
const GOOGLE_SCOPES   = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "signInWithGoogle") {
        const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
        const authUrl = 'https://accounts.google.com/o/oauth2/auth?' + new URLSearchParams({
            client_id:     GOOGLE_CLIENT_ID,
            response_type: 'token',
            redirect_uri:  redirectUri,
            scope:         GOOGLE_SCOPES
        }).toString();

        chrome.identity.launchWebAuthFlow(
            { url: authUrl, interactive: true },
            async (redirectUrl) => {
                if (chrome.runtime.lastError || !redirectUrl) {
                    const err = chrome.runtime.lastError?.message || 'Auth cancelled by user';
                    console.error('launchWebAuthFlow error:', err);
                    sendResponse({ success: false, error: err });
                    return;
                }

                // Extract access_token from the redirect URL hash
                const hash   = new URL(redirectUrl).hash.slice(1);
                const params = new URLSearchParams(hash);
                const accessToken = params.get('access_token');

                if (!accessToken) {
                    sendResponse({ success: false, error: 'No access token in redirect response' });
                    return;
                }

                try {
                    // Exchange token for Firebase credential
                    const credential = firebase.auth.GoogleAuthProvider.credential(null, accessToken);
                    const result     = await auth.signInWithCredential(credential);
                    console.log('Firebase sign-in success:', result.user.email);
                    sendResponse({ success: true, user: { uid: result.user.uid, email: result.user.email } });
                } catch (err) {
                    console.error('Firebase signInWithCredential error:', err);
                    sendResponse({ success: false, error: err.message });
                }
            }
        );
        return true; // Keep the message channel open for async response
    }

    if (request.action === "shareFolder") {
        const user = auth.currentUser;
        if (!user) {
            sendResponse({ success: false, error: "Not logged in" });
            return true;
        }
        const shareDoc = {
            ownerId: user.uid,
            folderName: request.folderName,
            links: request.links,
            createdAt: Date.now()
        };
        db.collection('shared_folders').add(shareDoc)
            .then(docRef => sendResponse({ success: true, shareId: docRef.id }))
            .catch(err => { console.error("Share error:", err); sendResponse({ success: false }); });
        return true;
    }
});

// ─── Keyboard Shortcuts ──────────────────────────────────────────────────────
chrome.commands.onCommand.addListener((command) => {
    if (command === "quick-save") {
        quickSave();
    }
});

async function quickSave() {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        if (!tab || !tab.url) return;

        const { links = [], folders = [] } = await chrome.storage.local.get(['links', 'folders']);

        // Check if duplicate
        let normalizedUrl = tab.url;
        try { normalizedUrl = new URL(tab.url).href; } catch (e) { }

        const isDuplicate = links.some(link => {
            try { return new URL(link.url).href === normalizedUrl; }
            catch (e) { return link.url === tab.url; }
        });

        if (isDuplicate) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'assets/icon128.png',
                title: 'Already Stashed!',
                message: 'This link is already in your LinkStash.'
            });
            return;
        }

        // Find or create "Quick Saves" folder
        const FOLDER_NAME = "Quick Saves";
        let quickSavesFolder = folders.find(f => f.name === FOLDER_NAME);
        if (!quickSavesFolder) {
            quickSavesFolder = { id: self.crypto.randomUUID(), name: FOLDER_NAME, createdAt: Date.now() };
            folders.push(quickSavesFolder);
            await chrome.storage.local.set({ folders });
        }

        const newLink = {
            id: self.crypto.randomUUID(),
            url: tab.url,
            title: tab.title || "Quick Save",
            notes: "",
            folderId: quickSavesFolder.id,
            tags: ["quick-save"],
            createdAt: Date.now(),
            favicon: `https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}&sz=32`,
            screenshot: await captureTabScreenshot(tab.windowId)
        };

        links.push(newLink);
        await chrome.storage.local.set({ links });

        // Feedback
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'assets/icon128.png',
            title: 'Saved to LinkStash',
            message: `"${newLink.title}" has been saved to Quick Saves.`
        });

        playSuccessSound();

    } catch (err) {
        console.error("Quick save error:", err);
    }
}

async function captureTabScreenshot(windowId) {
    try {
        // captureVisibleTab returns a dataUrl string
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 50 });
        return dataUrl;
    } catch (e) {
        console.warn("Screenshot capture skipped:", e);
        return null;
    }
}

async function playSuccessSound() {
    const OFFSCREEN_PATH = 'offscreen/offscreen.html';

    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
    });

    if (existingContexts.length === 0) {
        await chrome.offscreen.createDocument({
            url: OFFSCREEN_PATH,
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Play success sound on quick save'
        });
    }

    // Send message to offscreen to play sound
    chrome.runtime.sendMessage({
        target: 'offscreen',
        action: 'playAudio',
        source: chrome.runtime.getURL('assets/success.mp3'),
        volume: 0.5
    });
}
