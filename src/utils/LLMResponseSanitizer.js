/**
 * @fileoverview A static utility for cleaning and repairing raw LLM JSON output.
 * @module utils/LLMResponseSanitizer
 */

/**
 * A static utility class for cleaning common, non-destructive issues from LLM JSON output
 * before parsing. This acts as a defensive layer to increase the resilience of agents
 * that rely on structured data from LLMs.
 */
class LLMResponseSanitizer {
    /**
     * The main entry point for the sanitization process. It orchestrates a sequence of
     * cleaning operations to maximize the chance of producing a parsable JSON string.
     *
     * @param {string} rawResponse - The raw string output from the LLM.
     * @returns {string} A string that is more likely to be valid JSON.
     */
    static sanitize(rawResponse) {
        if (typeof rawResponse !== 'string') {
            return '';
        }

        let jsonString = rawResponse.trim();

        // Step 1: Extract content from markdown block if it exists.
        const markdownMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (markdownMatch && markdownMatch[1]) {
            jsonString = markdownMatch[1].trim();
        }

        // Step 2: Apply non-destructive cleaning.
        jsonString = LLMResponseSanitizer._fixTrailingCommas(jsonString);

        return jsonString;
    }

    /**
     * Removes trailing commas from JSON objects and arrays using a regular expression.
     * @private
     */
    static _fixTrailingCommas(jsonString) {
        const regex = /,\s*(?=[}\]])/g;
        return jsonString.replace(regex, '');
    }
}

module.exports = LLMResponseSanitizer;