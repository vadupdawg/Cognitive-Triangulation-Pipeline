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

        let response = rawResponse.trim();

        // Attempt to extract JSON from markdown code blocks (e.g., ```json ... ```)
        const markdownMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (markdownMatch && markdownMatch[1]) {
            response = markdownMatch[1].trim();
        }

        // Attempt to find the start and end of the JSON object if not in a markdown block
        const firstBracket = response.indexOf('{');
        const firstSquare = response.indexOf('[');
        const lastBracket = response.lastIndexOf('}');
        const lastSquare = response.lastIndexOf(']');

        let startIndex = -1;
        if (firstBracket !== -1 && firstSquare !== -1) {
            startIndex = Math.min(firstBracket, firstSquare);
        } else if (firstBracket !== -1) {
            startIndex = firstBracket;
        } else {
            startIndex = firstSquare;
        }

        let endIndex = -1;
        if (lastBracket !== -1 && lastSquare !== -1) {
            endIndex = Math.max(lastBracket, lastSquare);
        } else if (lastBracket !== -1) {
            endIndex = lastBracket;
        } else {
            endIndex = lastSquare;
        }


        if (startIndex > -1 && endIndex > -1 && endIndex > startIndex) {
            response = response.substring(startIndex, endIndex + 1);
        }

        // Chain of repair functions
        response = LLMResponseSanitizer._fixTrailingCommas(response);

        return response;
    }

    /**
     * Removes trailing commas from JSON objects and arrays using a regular expression.
     * A trailing comma is a comma that appears after the last element in an object or array,
     * which is invalid in some JSON parsers.
     *
     * @private
     * @param {string} jsonString - The JSON string to clean.
     * @returns {string} The JSON string with trailing commas removed.
     */
    static _fixTrailingCommas(jsonString) {
        // This regex finds commas that are followed by only whitespace and then a closing brace or bracket.
        // The (?=\s*[}\]]) is a positive lookahead to ensure the character is there without consuming it.
        const regex = /,\s*(?=[}\]])/g;
        return jsonString.replace(regex, '');
    }
}

module.exports = LLMResponseSanitizer;