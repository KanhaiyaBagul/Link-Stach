import Storage from '../js/storage.js';
import { suggestCategorization } from '../js/ai.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Populate initial data (folder datalist)
    const folders = await Storage.getFolders();
    const datalist = document.getElementById('folder-options');
    folders.forEach(f => {
        const option = document.createElement('option');
        option.value = f.name;
        datalist.appendChild(option);
    });

    // 2. Extract tab info
    const urlInput = document.getElementById('url');
    const titleInput = document.getElementById('title');

    const params = new URLSearchParams(window.location.search);
    if (params.has('url')) {
        // Opened from background right-click
        urlInput.value = params.get('url');
        titleInput.value = params.get('title');
        await triggerAI(urlInput.value, titleInput.value);
    } else {
        // Opened via toolbar popup (if we set it to default_popup or change behavior)
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs && tabs[0]) {
                const url = tabs[0].url || '';
                const title = tabs[0].title || '';
                urlInput.value = url;
                titleInput.value = title;
                await triggerAI(title, url);
            }
        });
    }

    // 3. Handle Form Submission
    const form = document.getElementById('save-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const saveBtn = document.getElementById('save-btn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        const rawUrl = urlInput.value.trim();
        const title = titleInput.value.trim();
        const folderName = document.getElementById('folder').value.trim();
        const tagsString = document.getElementById('tags').value.trim();
        const note = document.getElementById('note').value.trim();

        try {
            let folderId = null;
            if (folderName) {
                const folder = await Storage.saveFolder(folderName);
                folderId = folder ? folder.id : null;
            }

            const tags = tagsString
                .split(',')
                .map(t => t.trim())
                .filter(t => t.length > 0);

            const linkObj = {
                url: rawUrl,
                title: title,
                notes: note,
                folderId: folderId,
                tags: tags
            };

            await Storage.saveLink(linkObj);

            // Show success
            document.getElementById('success-overlay').classList.remove('hidden');
            setTimeout(() => {
                window.close(); // Close the popup/window after success
            }, 1200);

        } catch (err) {
            console.error('Error saving link:', err);
            alert('Failed to save link. Please try again.');
            saveBtn.disabled = false;
            saveBtn.innerHTML = `Save Link <svg viewBox="0 0 24 24" fill="none" class="btn-icon" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"></path></svg>`;
        }
    });

    // 4. Handle Cancel
    document.getElementById('cancel-btn').addEventListener('click', () => {
        window.close();
    });
});

async function triggerAI(title, url) {
   if (!title || !url) return;
   
   const folderLabel = document.getElementById('ai-status-folder');
   const tagsLabel = document.getElementById('ai-status-tags');
   const folderInput = document.getElementById('folder');
   const tagsInput = document.getElementById('tags');
   
   // Show loading
   folderLabel.style.display = 'inline-block';
   tagsLabel.style.display = 'inline-block';
   
   const aiResult = await suggestCategorization(title, url);
   
   // Hide loading
   if (aiResult) {
      if (!folderInput.value && aiResult.folder) {
         folderInput.value = aiResult.folder;
         folderLabel.innerHTML = '✨ AI Suggested';
      } else {
         folderLabel.style.display = 'none';
      }
      
      if (!tagsInput.value && aiResult.tags && aiResult.tags.length > 0) {
         tagsInput.value = aiResult.tags.join(', ');
         tagsLabel.innerHTML = '✨ AI Suggested';
      } else {
         tagsLabel.style.display = 'none';
      }
      
      // Clear badges after a few seconds
      setTimeout(() => {
         folderLabel.style.display = 'none';
         tagsLabel.style.display = 'none';
      }, 5000);
   } else {
      folderLabel.style.display = 'none';
      tagsLabel.style.display = 'none';
   }
}
