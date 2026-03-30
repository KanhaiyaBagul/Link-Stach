import Storage from '../js/storage.js';

let links = [];
let folders = [];
let tags = [];
let currentFilter = { type: 'all', value: null };
let searchQuery = '';
let isSelectMode = false;
let selectedLinkIds = new Set();

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    setupEventListeners();
    setupStorageListener();
});

let _reloadTimer = null;

function setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && (changes.links || changes.folders || changes.tags)) {
            clearTimeout(_reloadTimer);
            _reloadTimer = setTimeout(() => {
                loadData();
            }, 300);
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
    document.querySelectorAll('.nav-item').forEach(el => {
        if (el.dataset.type === type && el.dataset.value === value) el.classList.add('active');
        else if (type === 'all' && el.dataset.filter === 'all') el.classList.add('active');
        else el.classList.remove('active');
    });
    document.querySelectorAll('.tag').forEach(el => {
        if (type === 'tag' && el.textContent === value) el.classList.add('active');
        else el.classList.remove('active');
    });
    const shareBtn = document.getElementById('share-folder-btn');
    if (shareBtn) shareBtn.style.display = type === 'folder' ? 'block' : 'none';
    renderLinks();
}

function renderLinks() {
    const container = document.getElementById('link-list');
    const emptyState = document.getElementById('empty-state');
    container.innerHTML = '';

    let filtered = links.filter(link => {
        if (currentFilter.type === 'folder' && link.folderId !== currentFilter.value) return false;
        if (currentFilter.type === 'tag' && !link.tags.includes(currentFilter.value)) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const matchTitle = (link.title || '').toLowerCase().includes(q);
            const matchUrl = (link.url || '').toLowerCase().includes(q);
            const matchNote = (link.notes || '').toLowerCase().includes(q);
            const matchTag = link.tags.some(t => t.toLowerCase().includes(q));
            let folderName = folders.find(f => f.id === link.folderId)?.name.toLowerCase() || "";
            if (!matchTitle && !matchUrl && !matchNote && !matchTag && !folderName.includes(q)) return false;
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
            card.className = `link-card ${selectedLinkIds.has(link.id) ? 'selected' : ''} ${isSelectMode ? 'selectable' : ''}`;
            const folderName = folders.find(f => f.id === link.folderId)?.name || '';
            card.innerHTML = `
        <div class="link-preview ${link.screenshot ? '' : 'no-screenshot'}">
          ${link.screenshot ? `<img src="${link.screenshot}" class="screenshot-thumb">` : ''}
          <div class="favicon">
            <img src="${escapeHtml(link.favicon)}" onerror="this.src='../assets/icon48.png'">
          </div>
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
        <button class="delete-btn" title="Delete Link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        </button>
      `;
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-btn') && !e.target.closest('.tag')) {
                    if (isSelectMode) toggleSelection(link.id, card);
                    else chrome.tabs.create({ url: link.url });
                }
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
                    const urlParams = new URLSearchParams({ url: tabs[0].url, title: tabs[0].title }).toString();
                    chrome.windows.create({ url: `save/save.html?${urlParams}`, type: "popup", width: 400, height: 600 });
                }
            });
        });
    }

    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => { searchQuery = e.target.value.trim(); renderLinks(); });

    document.querySelector('[data-filter="all"]').addEventListener('click', () => setFilter('all', null));
    document.getElementById('settings-btn').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL("options/options.html") }));

    const selectToggleBtn = document.getElementById('select-toggle-btn');
    if (selectToggleBtn) {
        selectToggleBtn.addEventListener('click', () => {
            isSelectMode = !isSelectMode;
            selectToggleBtn.classList.toggle('active', isSelectMode);
            if (!isSelectMode) {
                selectedLinkIds.clear();
                const bdb = document.getElementById('batch-delete-btn');
                if (bdb) bdb.style.display = 'none';
            }
            renderLinks();
        });
    }

    const batchDeleteBtn = document.getElementById('batch-delete-btn');
    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener('click', async () => {
            if (selectedLinkIds.size === 0) return;
            if (confirm(`Delete ${selectedLinkIds.size} selected links?`)) {
                for (const id of selectedLinkIds) await Storage.deleteLink(id);
                selectedLinkIds.clear();
                isSelectMode = false;
                if (selectToggleBtn) selectToggleBtn.classList.remove('active');
                batchDeleteBtn.style.display = 'none';
                loadData();
            }
        });
    }

    const shareBtn = document.getElementById('share-folder-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            if (currentFilter.type !== 'folder' || !currentFilter.value) return;
            shareBtn.disabled = true; shareBtn.style.opacity = '0.5';
            try {
                const folder = folders.find(f => f.id === currentFilter.value);
                const folderLinks = links.filter(l => l.folderId === currentFilter.value);
                if (!folder) throw new Error("Folder not found");
                chrome.runtime.sendMessage({ action: "shareFolder", folderName: folder.name, links: folderLinks }, (response) => {
                    if (response && response.success) {
                        const shareUrl = `https://link-stach.web.app/share/${response.shareId}`;
                        navigator.clipboard.writeText(shareUrl).then(() => alert(`Shared! Link copied to clipboard:\n${shareUrl}`));
                    } else alert("Failed to share folder. Make sure you are logged in.");
                    shareBtn.disabled = false; shareBtn.style.opacity = '1';
                });
            } catch (e) {
                console.error("Sharing error:", e);
                shareBtn.disabled = false; shareBtn.style.opacity = '1';
            }
        });
    }
}

function toggleSelection(id, cardEl) {
    if (selectedLinkIds.has(id)) {
        selectedLinkIds.delete(id);
        cardEl.classList.remove('selected');
    } else {
        selectedLinkIds.add(id);
        cardEl.classList.add('selected');
    }
    const batchDeleteBtn = document.getElementById('batch-delete-btn');
    if (batchDeleteBtn) {
        batchDeleteBtn.style.display = selectedLinkIds.size > 0 ? 'flex' : 'none';
        const span = batchDeleteBtn.querySelector('span'); if (span) span.remove();
        if (selectedLinkIds.size > 0) {
            const count = document.createElement('span');
            count.textContent = selectedLinkIds.size;
            count.style.cssText = 'font-size: 12px; margin-left: 4px; font-weight: 700;';
            batchDeleteBtn.appendChild(count);
        }
    }
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
