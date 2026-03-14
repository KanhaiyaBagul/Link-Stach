const Storage = {
    async getLinks() {
        const data = await chrome.storage.local.get("links");
        // Sort links by createdAt descending (newest first)
        return (data.links || []).sort((a, b) => b.createdAt - a.createdAt);
    },

    async saveLink(link) {
        const links = await this.getLinks();
        link.id = link.id || crypto.randomUUID();
        link.createdAt = link.createdAt || Date.now();

        // Default empty arrays and strings if not provided
        link.tags = link.tags || [];
        link.notes = link.notes || "";
        link.folderId = link.folderId || null;
        link.favicon = `https://www.google.com/s2/favicons?domain=${new URL(link.url).hostname}&sz=32`;

        links.push(link);
        await chrome.storage.local.set({ links });

        // Save tags automatically
        if (link.tags && link.tags.length > 0) {
            await this.addTags(link.tags);
        }
        return link;
    },

    async updateLink(id, updates) {
        const links = await this.getLinks();
        const index = links.findIndex(l => l.id === id);
        if (index !== -1) {
            links[index] = { ...links[index], ...updates, updatedAt: Date.now() };

            // Update favicon just in case url changed (unlikely but possible)
            if (updates.url) {
                try {
                    links[index].favicon = `https://www.google.com/s2/favicons?domain=${new URL(updates.url).hostname}&sz=32`;
                } catch (e) { }
            }

            await chrome.storage.local.set({ links });
            if (updates.tags && updates.tags.length > 0) {
                await this.addTags(updates.tags);
            }
            return links[index];
        }
        return null;
    },

    async deleteLink(id) {
        const links = await this.getLinks();
        const filtered = links.filter(l => l.id !== id);
        await chrome.storage.local.set({ links: filtered });
    },

    async getFolders() {
        const data = await chrome.storage.local.get("folders");
        return data.folders || [];
    },

    async saveFolder(folderName) {
        if (!folderName.trim()) return null;
        const folders = await this.getFolders();
        const existing = folders.find(f => f.name.toLowerCase() === folderName.trim().toLowerCase());

        if (!existing) {
            const newFolder = { id: crypto.randomUUID(), name: folderName.trim(), createdAt: Date.now() };
            folders.push(newFolder);
            await chrome.storage.local.set({ folders });
            return newFolder;
        }
        return existing;
    },

    async deleteFolder(id) {
        const folders = await this.getFolders();
        const filtered = folders.filter(f => f.id !== id);
        await chrome.storage.local.set({ folders: filtered });

        // When deleting a folder, we might want to unset folderId on its links,
        // but we can leave them orphaned in local view, or update them.
        const links = await this.getLinks();
        let updatedLinks = false;
        for (const link of links) {
            if (link.folderId === id) {
                link.folderId = null;
                updatedLinks = true;
            }
        }
        if (updatedLinks) {
            await chrome.storage.local.set({ links });
        }
    },

    async getTags() {
        const data = await chrome.storage.local.get("tags");
        return data.tags || [];
    },

    async addTags(newTags) {
        let tags = await this.getTags();
        let updated = false;
        for (const tag of newTags) {
            const t = tag.trim().toLowerCase();
            if (t && !tags.includes(t)) {
                tags.push(t);
                updated = true;
            }
        }
        if (updated) {
            await chrome.storage.local.set({ tags: tags.sort() });
        }
    }
};

export default Storage;
