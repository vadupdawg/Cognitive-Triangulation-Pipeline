const neo4j = require('neo4j-driver');
require('dotenv').config();

async function testConnection() {
    console.log('Environment variables:');
    console.log('NEO4J_URI:', process.env.NEO4J_URI);
    console.log('NEO4J_USER:', process.env.NEO4J_USER);
    console.log('NEO4J_PASSWORD:', process.env.NEO4J_PASSWORD ? '***' : 'undefined');
    console.log('NEO4J_DATABASE:', process.env.NEO4J_DATABASE);
    
    const driver = neo4j.driver(
        process.env.NEO4J_URI,
        neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
    );
    
    try {
        console.log('\nTesting driver connectivity...');
        await driver.verifyConnectivity();
        console.log('✓ Driver connectivity verified');
        
        console.log('\nTesting session with default database...');
        const defaultSession = driver.session();
        
        try {
            const result = await defaultSession.run('RETURN 1 as test');
            console.log('✓ Default session query successful:', result.records[0].get('test'));
        } finally {
            await defaultSession.close();
        }
        
        console.log('\nTesting session with backend database...');
        const backendSession = driver.session({ database: process.env.NEO4J_DATABASE });
        
        try {
            const result = await backendSession.run('RETURN 1 as test');
            console.log('✓ Backend session query successful:', result.records[0].get('test'));
        } finally {
            await backendSession.close();
        }
        
        console.log('\n✓ All tests passed!');
    } catch (error) {
        console.error('✗ Connection failed:', error.message);
        console.error('Error details:', error);
    } finally {
        await driver.close();
    }
}

testConnection();