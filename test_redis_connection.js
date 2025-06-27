const { Redis } = require('ioredis');
const config = require('./src/config');

async function testRedisConnection() {
    console.log(`Attempting to connect to Redis at: ${config.REDIS_URL}`);
    const redis = new Redis(config.REDIS_URL, {
        password: config.REDIS_PASSWORD,
        // Optional: Add a connection timeout to prevent hanging
        connectTimeout: 5000,
    });

    redis.on('connect', () => {
        console.log('Successfully connected to Redis.');
    });

    redis.on('error', (err) => {
        console.error('Redis connection error:', err);
        // Exit with an error code if connection fails
        process.exit(1);
    });

    try {
        const reply = await redis.ping();
        console.log(`Received PONG from Redis: ${reply}`);
        console.log('Redis connection is healthy.');
    } catch (err) {
        console.error('Failed to PING Redis:', err);
        process.exit(1);
    } finally {
        // Disconnect cleanly
        await redis.quit();
        console.log('Disconnected from Redis.');
    }
}

testRedisConnection();