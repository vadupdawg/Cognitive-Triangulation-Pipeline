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
        this.timeout = 1800000; // 30 minutes timeout for very complex analysis
        this.agent = new https.Agent({ keepAlive: false, maxSockets: 100 });
        this.maxConcurrentRequests = 4; // Global limit for concurrent requests
        this.activeRequests = 0;
        this.requestQueue = [];
        
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

    async call(prompt) {
        const requestBody = JSON.stringify({
            model: 'deepseek-chat',
            messages: [
                { role: 'system', content: prompt.system },
                { role: 'user', content: prompt.user }
            ],
            temperature: 0.0,
            max_tokens: 8000,
            stream: false,
            response_format: { type: 'json_object' }
        });

        try {
            const response = await this._scheduleRequest('/chat/completions', 'POST', requestBody);
            return {
                body: response.choices[0].message.content,
                usage: response.usage
            };
        } catch (error) {
            console.error('DeepSeek API call failed after retries:', error.message);
            throw new Error(`DeepSeek API call failed: ${error.message}`);
        }
    }

    async query(promptString) {
        const prompt = {
            system: 'You are an expert software engineer specializing in code analysis.',
            user: promptString
        };
        const response = await this.call(prompt);
        return response.body;
    }

    async createChatCompletion(options) {
        const requestBody = JSON.stringify({
            model: options.model || 'deepseek-chat',
            messages: options.messages,
            temperature: options.temperature || 0.0,
            max_tokens: options.max_tokens || 8000,
            response_format: options.response_format || { type: 'json_object' },
            stream: false
        });
 
        try {
            return await this._scheduleRequest('/chat/completions', 'POST', requestBody);
        } catch (error) {
            console.error('[DeepSeekClient] createChatCompletion failed after all retries:', error.message);
            throw error;
        }
    }

    _scheduleRequest(endpoint, method, body) {
        return new Promise((resolve, reject) => {
            console.log(`[DeepSeekClient] Scheduling request. Active: ${this.activeRequests}, Queued: ${this.requestQueue.length}`);
            this.requestQueue.push({ endpoint, method, body, resolve, reject });
            this._processQueue();
        });
    }

    _processQueue() {
        if (this.activeRequests >= this.maxConcurrentRequests || this.requestQueue.length === 0) {
            return;
        }

        this.activeRequests++;
        const { endpoint, method, body, resolve, reject } = this.requestQueue.shift();
        
        console.log(`[DeepSeekClient] Starting request. Active: ${this.activeRequests}`);

        this._makeRequestWithRetry(endpoint, method, body)
            .then(resolve)
            .catch(reject)
            .finally(() => {
                this.activeRequests--;
                console.log(`[DeepSeekClient] Finished request. Active: ${this.activeRequests}`);
                this._processQueue();
            });
    }

    _isRetryableError(error) {
        return error.status >= 500 || ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(error.code);
    }

    async _makeRequestWithRetry(endpoint, method, body, retries = 5, delay = 2000) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await this._makeRequest(endpoint, method, body);
                return response;
            } catch (error) {
                console.error(`[DeepSeekClient] Request attempt ${i + 1} FAILED. Error: ${error.message}`, { code: error.code, status: error.status });
                if (this._isRetryableError(error) && i < retries - 1) {
                    const backoffDelay = delay * Math.pow(2, i);
                    console.warn(`[DeepSeekClient] Retrying in ${backoffDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, backoffDelay));
                } else {
                    console.error(`[DeepSeekClient] FINAL request failure after ${i + 1} attempts.`, { endpoint, error: error.message });
                    throw error;
                }
            }
        }
    }

    _makeRequest(endpoint, method, body) {
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
                res.on('data', (chunk) => data += chunk);
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

            req.on('error', (error) => reject(error));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(body);
            req.end();
        });
    }

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