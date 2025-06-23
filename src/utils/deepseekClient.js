const OpenAI = require('openai');
require('dotenv').config();

/**
 * Production-ready DeepSeek LLM Client
 * Uses OpenAI SDK for compatibility with DeepSeek API
 */
class DeepSeekClient {
    constructor() {
        this.client = new OpenAI({
            baseURL: 'https://api.deepseek.com',
            apiKey: process.env.DEEPSEEK_API_KEY,
            timeout: 600000, // 10 minutes timeout for complex analysis
            dangerouslyAllowBrowser: true, // Allow in test environment
        });
        
        if (!process.env.DEEPSEEK_API_KEY) {
            throw new Error('DEEPSEEK_API_KEY environment variable is required');
        }
    }

    /**
     * Makes a call to DeepSeek API with the given prompt
     * @param {Object} prompt - The prompt object with system and user messages
     * @returns {Promise<Object>} - The response from DeepSeek
     */
    async call(prompt) {
        try {
            const messages = [
                { role: 'system', content: prompt.system },
                { role: 'user', content: prompt.user }
            ];

            const response = await this.client.chat.completions.create({
                model: 'deepseek-chat', // Points to DeepSeek-V3-0324 (128K context, March 2025)
                messages: messages,
                temperature: 0.2, // Balanced temperature for natural but consistent output
                max_tokens: 8000, // Maximum allowed for generation
                stream: false
            });

            return {
                body: response.choices[0].message.content,
                usage: response.usage
            };
        } catch (error) {
            console.error('DeepSeek API call failed:', error.message);
            
            // Handle specific error types
            if (error.status === 429) {
                throw new Error(`DeepSeek API rate limit exceeded: ${error.message}`);
            } else if (error.status >= 500) {
                throw new Error(`DeepSeek API server error: ${error.message}`);
            } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                throw new Error(`DeepSeek API network timeout: ${error.message}`);
            }
            
            throw new Error(`DeepSeek API call failed: ${error.message}`);
        }
    }

    /**
     * Alternative interface for compatibility with tests and other code
     * @param {Object} options - Chat completion options
     * @returns {Promise<Object>} - The response in OpenAI format
     */
    async createChatCompletion(options) {
        try {
            const response = await this.client.chat.completions.create({
                model: options.model || 'deepseek-chat',
                messages: options.messages,
                temperature: options.temperature || 0.2,
                max_tokens: options.max_tokens || 8000,
                response_format: options.response_format,
                stream: false
            });

            return response;
        } catch (error) {
            console.error('DeepSeek createChatCompletion failed:', error.message);
            throw error;
        }
    }

    /**
     * Test the connection to DeepSeek API
     * @returns {Promise<boolean>} - True if connection is successful
     */
    async testConnection() {
        try {
            const testPrompt = {
                system: 'You are a helpful assistant.',
                user: 'Hello, please respond with "Connection successful"'
            };
            
            const response = await this.call(testPrompt);
            return response.body.includes('Connection successful');
        } catch (error) {
            console.error('DeepSeek connection test failed:', error.message);
            return false;
        }
    }
}

let clientInstance;

function getDeepseekClient() {
    if (!clientInstance) {
        clientInstance = new DeepSeekClient();
    }
    return clientInstance;
}

module.exports = {
    getDeepseekClient,
    DeepSeekClient,
};