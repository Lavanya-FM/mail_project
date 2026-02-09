
/**
 * A simple service to generate email summaries.
 * In a real application, this would call an LLM API (OpenAI, Gemini, etc.).
 * For now, it performs a local heuristic summary.
 */

export const summaryService = {
    /**
     * Generates a summary for the given email body.
     * @param body The email body text (HTML or plain)
     * @returns A promise that resolves to the summary string
     */
    async generateSummary(body: string): Promise<string> {
        // Simulate network delay for "AI" feel
        await new Promise(resolve => setTimeout(resolve, 1500));

        try {
            // 1. Strip HTML tags
            const div = document.createElement('div');
            div.innerHTML = body;
            const text = div.textContent || div.innerText || '';

            // 2. Clean up whitespace
            const cleanText = text.replace(/\s+/g, ' ').trim();

            if (cleanText.length < 50) {
                return "This email is short enough to read quickly.";
            }

            // 3. Extract first few sentences as a heuristic summary
            // Split by . ! or ? followed by a space
            const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];

            // Take up to 3 sentences or 300 chars
            let summary = '';
            for (const sentence of sentences) {
                if ((summary + sentence).length > 300) break;
                summary += sentence + ' ';
                if (summary.split('.').length > 3) break;
            }

            return summary.trim() || cleanText.substring(0, 300) + '...';
        } catch (error) {
            console.error("Summary generation failed:", error);
            return "Could not generate summary.";
        }
    }
};
