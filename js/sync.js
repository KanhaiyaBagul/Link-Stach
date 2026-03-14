import { auth, db } from './firebase-config.js';
import Storage from './storage.js';

let unsubscribeLinks = null;
let isSyncingDown = false;

auth.onAuthStateChanged(async user => {
    if (user) {
        // 1. First, push any local items to Firestore that might not be there
        await pushLocalToFirestore(user);
        // 2. Start listening to realtime changes from Firestore down to local
        startFirestoreSync(user);
    } else {
        // User logged out, stop listening
        if (unsubscribeLinks) {
            unsubscribeLinks();
            unsubscribeLinks = null;
        }
    }
});

async function pushLocalToFirestore(user) {
    const localLinks = await Storage.getLinks();
    if (localLinks.length === 0) return;

    // We use standard set/merge loop instead of batch to avoid 500 limit issues
    // For a production app we'd batch, but this simple loop is fine for MVP
    localLinks.forEach(link => {
        db.collection('users').doc(user.uid).collection('links').doc(link.id).set(link, { merge: true })
            .catch(err => console.error("Error syncing local to FS:", err));
    });
}

function startFirestoreSync(user) {
    const linksRef = db.collection('users').doc(user.uid).collection('links');

    unsubscribeLinks = linksRef.onSnapshot(async snapshot => {
        let localLinks = await Storage.getLinks();
        let changed = false;

        snapshot.docChanges().forEach(change => {
            const data = change.doc.data();
            if (change.type === 'added' || change.type === 'modified') {
                const idx = localLinks.findIndex(l => l.id === data.id);
                if (idx === -1) {
                    localLinks.push(data);
                    changed = true;
                } else {
                    // Compare timestamps to see if remote is newer
                    const localTime = localLinks[idx].updatedAt || localLinks[idx].createdAt || 0;
                    const remoteTime = data.updatedAt || data.createdAt || 0;
                    if (remoteTime > localTime) {
                        localLinks[idx] = data;
                        changed = true;
                    }
                }
            }
            if (change.type === 'removed') {
                const initialLen = localLinks.length;
                localLinks = localLinks.filter(l => l.id !== data.id);
                if (localLinks.length !== initialLen) changed = true;
            }
        });

        if (changed) {
            isSyncingDown = true;
            // Sort newest first
            localLinks.sort((a, b) => b.createdAt - a.createdAt);
            await chrome.storage.local.set({ links: localLinks });

            // Wait longer than standard JS execution to debounce the onChanged listener
            setTimeout(() => { isSyncingDown = false; }, 1000);
        }
    });
}

// Listen to local changes and push UP to Firestore
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local' || isSyncingDown) return;

    const user = auth.currentUser;
    if (!user) return;

    if (changes.links) {
        const newLinks = changes.links.newValue || [];
        const oldLinks = changes.links.oldValue || [];

        // 1. Find additions and modifications
        newLinks.forEach(newLink => {
            const oldLink = oldLinks.find(l => l.id === newLink.id);
            const localTime = newLink.updatedAt || newLink.createdAt || 0;
            const oldTime = oldLink ? (oldLink.updatedAt || oldLink.createdAt || 0) : 0;

            if (!oldLink || localTime > oldTime) {
                db.collection('users').doc(user.uid).collection('links').doc(newLink.id).set(newLink, { merge: true });
            }
        });

        // 2. Find deletions
        oldLinks.forEach(oldLink => {
            if (!newLinks.find(l => l.id === oldLink.id)) {
                db.collection('users').doc(user.uid).collection('links').doc(oldLink.id).delete();
            }
        });
    }
});
