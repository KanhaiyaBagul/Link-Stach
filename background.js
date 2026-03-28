// Service Worker — must use importScripts for Firebase compat libraries
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

// ─── Share Folder Message ────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
