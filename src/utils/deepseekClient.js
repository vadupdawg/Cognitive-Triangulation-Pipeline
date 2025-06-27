const https = require('https');
require('dotenv').config();
const config = require('../config');

/**
 * Pure DeepSeek LLM Client
 * Native implementation using HTTPS requests to DeepSeek API
 * No OpenAI SDK dependencies
 */
class DeepSeekClient {
    constructor() {
        this.baseURL = 'https://api.deepseek.com';
        this.timeout = 600000; // 10 minutes timeout for complex analysis
        this.agent = new https.Agent({ keepAlive: true, maxSockets: 100 });
        
        // Lazy load API key to ensure config is loaded
        this._apiKey = null;
    }

    get apiKey() {
        if (!this._apiKey) {
            this._apiKey = config.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;
            if (!this._apiKey) {
                throw new Error('DEEPSEEK_API_KEY environment variable is required');
            }
            console.log('✅ DeepSeek Client initialized successfully');
        }
        return this._apiKey;
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

            const requestBody = JSON.stringify({
                model: 'deepseek-chat',
                messages: messages,
                temperature: 0.0,
                max_tokens: 8000,
                stream: false,
                response_format: { type: 'json_object' }
            });

            const response = await this._makeRequest('/chat/completions', 'POST', requestBody);
            
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
     * Query method for compatibility with EntityScout
     * @param {string} promptString - The user prompt
     * @returns {Promise<string>} - The response content
     */
    async query(promptString) {
        const prompt = {
            system: 'You are an expert software engineer specializing in code analysis.',
            user: promptString
        };
        
        const response = await this.call(prompt);
        return response.body;
    }

    /**
     * Alternative interface for compatibility with tests and other code
     * @param {Object} options - Chat completion options
     * @returns {Promise<Object>} - The response in OpenAI-compatible format
     */
    async createChatCompletion(options) {
        try {
            const requestBody = JSON.stringify({
                model: options.model || 'deepseek-chat',
                messages: options.messages,
                temperature: options.temperature || 0.0,
                max_tokens: options.max_tokens || 8000,
                response_format: options.response_format || { type: 'json_object' },
                stream: false
            });

            const response = await this._makeRequest('/chat/completions', 'POST', requestBody);
            return response;
        } catch (error) {
            console.error('DeepSeek createChatCompletion failed:', error.message);
            throw error;
        }
    }

    /**
     * Make HTTP request to DeepSeek API
     * @private
     */
    async _makeRequest(endpoint, method, body) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.baseURL + endpoint);
            const options = {
                hostname: url.hostname,
                port: url.port || 443,
                path: url.pathname,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Length': Buffer.byteLength(body)
                },
                agent: this.agent,
                timeout: this.timeout
            };

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(data);
                        
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(parsedData);
                        } else {
                            const error = new Error(parsedData.error?.message || `HTTP ${res.statusCode}`);
                            error.status = res.statusCode;
                            reject(error);
                        }
                    } catch (parseError) {
                        reject(new Error(`Failed to parse response: ${parseError.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(body);
            req.end();
        });
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