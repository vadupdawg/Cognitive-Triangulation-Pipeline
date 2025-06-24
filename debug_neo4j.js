const neo4j = require('neo4j-driver');
const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE } = require('./config');

async function checkNeo4jContents() {
    const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    const session = driver.session({ database: NEO4J_DATABASE });
    
    try {
        // Check node count
        const nodeResult = await session.run('MATCH (n) RETURN count(n) AS count');
        const nodeCount = nodeResult.records[0].get('count').low;
        console.log(`Total nodes in Neo4j: ${nodeCount}`);
        
        // Check relationship count
        const relResult = await session.run('MATCH ()-[r]->() RETURN count(r) AS count');
        const relCount = relResult.records[0].get('count').low;
        console.log(`Total relationships in Neo4j: ${relCount}`);
        
        // Check node types
        const nodeTypesResult = await session.run('MATCH (n) RETURN labels(n) as labels, count(n) as count');
        console.log('\nNode types:');
        nodeTypesResult.records.forEach(record => {
            const labels = record.get('labels');
            const count = record.get('count').low;
            console.log(`  ${labels.join(', ')}: ${count}`);
        });
        
        // Check relationship types
        const relTypesResult = await session.run('MATCH ()-[r]->() RETURN type(r) as type, count(r) as count');
        console.log('\nRelationship types:');
        relTypesResult.records.forEach(record => {
            const type = record.get('type');
            const count = record.get('count').low;
            console.log(`  ${type}: ${count}`);
        });
        
    } finally {
        await session.close();
        await driver.close();
    }
}

checkNeo4jContents().catch(console.error);