import { auth } from '../js/firebase-config.js';
import Storage from '../js/storage.js';

document.addEventListener('DOMContentLoaded', () => {
    setupAuthListener();
    setupExportListeners();
});

function setupAuthListener() {
    auth.onAuthStateChanged(user => {
        const emailEl = document.getElementById('user-email');
        const badgeEl = document.getElementById('sync-status');
        const loginBtn = document.getElementById('login-btn');
        const logoutBtn = document.getElementById('logout-btn');

        if (user) {
            emailEl.textContent = user.email || 'Google User';
            badgeEl.textContent = 'Sync Active';
            badgeEl.className = 'status-badge online';
            loginBtn.classList.add('hidden');
            logoutBtn.classList.remove('hidden');
        } else {
            emailEl.textContent = 'Not logged in';
            badgeEl.textContent = 'Sync Disabled';
            badgeEl.className = 'status-badge offline';
            loginBtn.classList.remove('hidden');
            logoutBtn.classList.add('hidden');
        }
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        auth.signOut();
    });

    document.getElementById('login-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
    });
}

function setupExportListeners() {

    document.getElementById('export-json-btn').addEventListener('click', async () => {
        const links = await Storage.getLinks();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(links, null, 2));
        downloadFile(dataStr, "linkstash-export.json");
    });

    document.getElementById('export-csv-btn').addEventListener('click', async () => {
        const links = await Storage.getLinks();
        if (links.length === 0) return alert("No links to export.");

        const headers = ["Title", "URL", "Notes", "Tags", "Date Saved"];
        const csvRows = [
            headers.join(','),
            ...links.map(link => {
                const title = `"${(link.title || '').replace(/"/g, '""')}"`;
                const url = `"${(link.url || '').replace(/"/g, '""')}"`;
                const notes = `"${(link.notes || '').replace(/"/g, '""')}"`;
                const tags = `"${link.tags.join('; ')}"`;
                const date = new Date(link.createdAt).toISOString();
                return [title, url, notes, tags, date].join(',');
            })
        ];

        const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csvRows.join('\n'));
        downloadFile(dataStr, "linkstash-export.csv");
    });
}

function downloadFile(dataStr, filename) {
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", filename);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}
