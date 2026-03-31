/**
 * AI Service: Direct OpenRouter Integration (Client-Side)
 * This service calls OpenRouter directly from the browser extension.
 * Key is retrieved from chrome.storage.local (set in Options page).
 */
const AIService = {
  /**
   * Fetches AI suggestions (tags and summary) for a given link.
   * @param {string} url - The URL of the page.
   * @param {string} title - The title of the page.
   * @param {string} [snippet] - Optional meta description or page snippet.
   * @returns {Promise<{tags: string[], summary: string}|null>}
   */
  async getSuggestions(url, title, snippet = '') {
    try {
      // 1. Retrieve the API Key from local storage
      const settings = await chrome.storage.local.get('ai_settings');
      const apiKey = settings.ai_settings?.apiKey;

      if (!apiKey) {
        console.warn('No AI API Key found. Please configure it in Settings.');
        return null;
      }

      // 2. Prepare the prompt
      const prompt = `Analyze this webpage and return a JSON object with:
      - "tags": Array of 3-5 relevant lowercase keywords.
      - "summary": A 1-2 sentence description.

      Title: ${title}
      URL: ${url}
      Snippet: ${snippet || 'No additional content provided.'}

      Return ONLY valid JSON.`;

      // 3. Call OpenRouter directly
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/KanhaiyaBagul/Link-Stach", // Required for OpenRouter rankings
          "X-Title": "LinkStash Extension"
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          messages: [
            {
              role: "system",
              content: "You are a specialized link librarian that categorizes and summarizes web content perfectly."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('OpenRouter Error:', response.status, errorBody);
        return null;
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) return null;

      // 4. Parse and return the JSON
      return JSON.parse(content);

    } catch (error) {
      console.error('AIService Error:', error);
      return null;
    }
  }
};

export default AIService;
