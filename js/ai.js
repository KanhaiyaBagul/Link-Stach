import Storage from './storage.js';

const AI_MODEL = 'google/gemini-flash-1.5';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function suggestCategorization(title, url) {
   // 1. Get the API Key
   const { openRouterKey } = await chrome.storage.local.get("openRouterKey");
   if (!openRouterKey) {
      console.warn("No OpenRouter API key found. AI categorization skipped.");
      return null;
   }

   // 2. Getting Context (existing folders)
   const folders = await Storage.getFolders();
   const folderNames = folders.map(f => f.name).join(', ');

   // 3. Constructing the Prompt
   const systemPrompt = `
You are an intelligent link categorization AI. 
Analyze the provided webpage Title and URL.
Return a single JSON object (nothing else, no markdown formatting) with exactly two properties:
1. "folder": Suggest the absolute best folder name for this link. If it clearly fits into one of these existing folders [${folderNames}], use it exactly. If not, invent a short, logical new folder name (1-2 words).
2. "tags": An array of exactly 3 relevant, highly specific short lowercase tags.

Example Response format:
{
  "folder": "Tech News",
  "tags": ["ai", "startup", "funding"]
}
`;

   const userPrompt = `Title: ${title}\nURL: ${url}`;

   // 4. API Call
   try {
      const response = await fetch(OPENROUTER_API_URL, {
         method: 'POST',
         headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'HTTP-Referer': 'chrome-extension://nkihpjnngpiinanbccdojchoclbcldib',
            'X-Title': 'LinkStash Extension',
            'Content-Type': 'application/json'
         },
         body: JSON.stringify({
            model: AI_MODEL,
            messages: [
               { role: 'system', content: systemPrompt },
               { role: 'user', content: userPrompt }
            ]
         })
      });

      if (!response.ok) {
         throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content.trim();

      // Clean the string if Gemini returned markdown block
      let cleanJson = content;
      if (cleanJson.startsWith('```json')) {
         cleanJson = cleanJson.replace(/^```json\n/, '').replace(/\n```$/, '');
      }

      const parsed = JSON.parse(cleanJson);
      return {
         folder: parsed.folder || "",
         tags: parsed.tags || []
      };

   } catch (error) {
       console.error("AI Categorization Error:", error);
       return null; 
   }
}
