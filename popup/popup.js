import Storage from '../js/storage.js';

let links = [];
let folders = [];
let tags = [];
let currentFilter = { type: 'all', value: null };
let searchQuery = '';

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    setupEventListeners();
    setupStorageListener();
});

function setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.links) {
            // Reload data and re-render only if links actually changed
            loadData();
        }
    });
}

async function loadData() {
    links = await Storage.getLinks();
    folders = await Storage.getFolders();
    tags = await Storage.getTags();

    renderFolders();
    renderTags();
    renderLinks();
}

function renderFolders() {
    const container = document.getElementById('folder-list');
    container.innerHTML = '';

    folders.forEach(folder => {
        const el = document.createElement('div');
        el.className = `nav-item ${currentFilter.type === 'folder' && currentFilter.value === folder.id ? 'active' : ''}`;
        el.dataset.type = 'folder';
        el.dataset.value = folder.id;
        el.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
      ${escapeHtml(folder.name)}
    `;
        el.addEventListener('click', () => setFilter('folder', folder.id));
        container.appendChild(el);
    });
}

function renderTags() {
    const container = document.getElementById('tag-list');
    container.innerHTML = '';

    tags.forEach(tag => {
        const el = document.createElement('div');
        el.className = `tag ${currentFilter.type === 'tag' && currentFilter.value === tag ? 'active' : ''}`;
        el.textContent = tag;
        el.addEventListener('click', () => setFilter('tag', tag));
        container.appendChild(el);
    });
}

function setFilter(type, value) {
    currentFilter = { type, value };

    // Update UI selection
    document.querySelectorAll('.nav-item').forEach(el => {
        if (el.dataset.type === type && el.dataset.value === value) el.classList.add('active');
        else if (type === 'all' && el.dataset.filter === 'all') el.classList.add('active');
        else el.classList.remove('active');
    });
    document.querySelectorAll('.tag').forEach(el => {
        if (type === 'tag' && el.textContent === value) el.classList.add('active');
        else el.classList.remove('active');
    });

    // Toggle Share Button visibility
    const shareBtn = document.getElementById('share-folder-btn');
    if (shareBtn) {
        if (type === 'folder') {
            shareBtn.style.display = 'block';
        } else {
            shareBtn.style.display = 'none';
        }
    }

    renderLinks();
}

function renderLinks() {
    const container = document.getElementById('link-list');
    const emptyState = document.getElementById('empty-state');

    container.innerHTML = '';

    // Filter links
    let filtered = links.filter(link => {
        // 1. Sidebar filter
        if (currentFilter.type === 'folder' && link.folderId !== currentFilter.value) return false;
        if (currentFilter.type === 'tag' && !link.tags.includes(currentFilter.value)) return false;

        // 2. Search query filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const matchTitle = (link.title || '').toLowerCase().includes(q);
            const matchUrl = (link.url || '').toLowerCase().includes(q);
            const matchNote = (link.notes || '').toLowerCase().includes(q);
            const matchTag = link.tags.some(t => t.toLowerCase().includes(q));

            let folderName = folders.find(f => f.id === link.folderId)?.name.toLowerCase() || "";
            const matchFolder = folderName.includes(q);

            if (!matchTitle && !matchUrl && !matchNote && !matchTag && !matchFolder) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        emptyState.classList.remove('hidden');
        container.style.display = 'none';
    } else {
        emptyState.classList.add('hidden');
        container.style.display = 'flex';

        filtered.forEach(link => {
            const card = document.createElement('div');
            card.className = 'link-card';

            const folderName = folders.find(f => f.id === link.folderId)?.name || '';

            card.innerHTML = `
        <div class="favicon">
          <img src="${escapeHtml(link.favicon)}" onerror="this.src='../assets/icon48.png'">
        </div>
        <div class="link-details">
          <div class="link-title" title="${escapeHtml(link.title)}">${escapeHtml(link.title || link.url)}</div>
          <div class="link-url">${escapeHtml(link.url)}</div>
          ${link.notes ? `<div class="link-note">${escapeHtml(link.notes)}</div>` : ''}
          <div class="link-meta">
            ${folderName ? `<span class="tag" style="background: rgba(139,92,246,0.2); color: var(--accent);">${escapeHtml(folderName)}</span>` : ''}
            ${link.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
        <button class="edit-btn" title="Edit Link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button class="delete-btn" title="Delete Link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        </button>
      `;

            card.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-btn') && !e.target.closest('.edit-btn') && !e.target.closest('.tag')) {
                    chrome.tabs.create({ url: link.url });
                }
            });

            card.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openEditModal(link);
            });

            card.querySelector('.delete-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                await Storage.deleteLink(link.id);
                links = links.filter(l => l.id !== link.id);
                renderLinks();
            });

            container.appendChild(card);
        });
    }
}

function setupEventListeners() {
    const saveBtn = document.getElementById('save-current-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs[0]) {
                    const urlParams = new URLSearchParams({
                        url: tabs[0].url,
                        title: tabs[0].title
                    }).toString();
                    chrome.windows.create({
                        url: `save/save.html?${urlParams}`,
                        type: "popup",
                        width: 400,
                        height: 600
                    });
                }
            });
        });
    }

    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        renderLinks();
    });

    document.querySelector('[data-filter="all"]').addEventListener('click', () => {
        setFilter('all', null);
    });

    document.getElementById('settings-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("options/options.html") });
    });

    // ─── Edit Modal Listeners ────────────────────────────────────────
    document.getElementById('edit-modal-close').addEventListener('click', closeEditModal);
    document.getElementById('edit-cancel-btn').addEventListener('click', closeEditModal);
    document.getElementById('edit-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeEditModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeEditModal();
    });
    document.getElementById('edit-form').addEventListener('submit', handleEditSubmit);

    const shareBtn = document.getElementById('share-folder-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            if (currentFilter.type !== 'folder' || !currentFilter.value) return;
            
            shareBtn.disabled = true;
            shareBtn.style.opacity = '0.5';
            
            try {
                // Get folder details and links
                const folder = folders.find(f => f.id === currentFilter.value);
                const folderLinks = links.filter(l => l.folderId === currentFilter.value);
                
                if (!folder) throw new Error("Folder not found");
                
                // We'd typically import db from firebase-config here, but since popup.html doesn't load it natively like options does right now,
                // we will send a message to the background script to handle the actual Firestore write, ensuring we don't break popup JS execution.
                chrome.runtime.sendMessage({
                    action: "shareFolder",
                    folderName: folder.name,
                    links: folderLinks
                }, (response) => {
                    if (response && response.success) {
                        const shareUrl = `https://link-stach.web.app/share/${response.shareId}`;
                        navigator.clipboard.writeText(shareUrl).then(() => {
                            alert(`Shared! Link copied to clipboard:\n${shareUrl}`);
                        });
                    } else {
                        alert("Failed to share folder. Make sure you are logged in.");
                    }
                    shareBtn.disabled = false;
                    shareBtn.style.opacity = '1';
                });
            } catch (e) {
                console.error("Sharing error:", e);
                shareBtn.disabled = false;
                shareBtn.style.opacity = '1';
                alert("Error preparing share link.");
            }
        });
    }
}

// ─── Edit Modal Logic ───────────────────────────────────────────────────────
function openEditModal(link) {
    const modal = document.getElementById('edit-modal');
    document.getElementById('edit-link-id').value = link.id;
    document.getElementById('edit-title').value = link.title || '';
    document.getElementById('edit-tags').value = (link.tags || []).join(', ');
    document.getElementById('edit-notes').value = link.notes || '';

    // Set the folder name (not ID) for display
    const folder = folders.find(f => f.id === link.folderId);
    document.getElementById('edit-folder').value = folder ? folder.name : '';

    // Populate folder datalist
    const datalist = document.getElementById('edit-folder-options');
    datalist.innerHTML = '';
    folders.forEach(f => {
        const option = document.createElement('option');
        option.value = f.name;
        datalist.appendChild(option);
    });

    modal.classList.remove('hidden');
    // Focus title input after animation
    setTimeout(() => document.getElementById('edit-title').focus(), 100);
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
}

async function handleEditSubmit(e) {
    e.preventDefault();

    const saveBtn = document.getElementById('edit-save-btn');
    saveBtn.disabled = true;

    const linkId = document.getElementById('edit-link-id').value;
    const newTitle = document.getElementById('edit-title').value.trim();
    const folderName = document.getElementById('edit-folder').value.trim();
    const tagsString = document.getElementById('edit-tags').value.trim();
    const newNotes = document.getElementById('edit-notes').value.trim();

    try {
        // Resolve folder: find existing or create new
        let folderId = null;
        if (folderName) {
            const folder = await Storage.saveFolder(folderName);
            folderId = folder ? folder.id : null;
        }

        const newTags = tagsString
            .split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0);

        const updates = {
            title: newTitle,
            folderId: folderId,
            tags: newTags,
            notes: newNotes
        };

        await Storage.updateLink(linkId, updates);

        // Refresh data and close modal
        await loadData();
        closeEditModal();
        showToast('✓ Link updated successfully');
    } catch (err) {
        console.error('Error updating link:', err);
        showToast('✗ Failed to update link');
    } finally {
        saveBtn.disabled = false;
    }
}

// ─── Toast Notification ─────────────────────────────────────────────────────
function showToast(message) {
    // Remove any existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto-dismiss after 2.5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 2500);
}

// Utility to prevent XSS
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
