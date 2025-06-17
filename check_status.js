const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function checkStatus() {
    const db = await open({
        filename: 'db.sqlite',
        driver: sqlite3.Database
    });

    console.log('=== PIPELINE STATUS CHECK ===\n');

    // Check work queue status
    const queue = await db.all('SELECT status, COUNT(*) as count FROM work_queue GROUP BY status');
    console.log('Work Queue Status:');
    queue.forEach(item => {
        console.log(`  ${item.status}: ${item.count} files`);
    });

    // Check analysis results
    const results = await db.all('SELECT COUNT(*) as count FROM analysis_results');
    console.log(`\nAnalysis Results: ${results[0].count} files processed`);

    // Check failed work
    const failed = await db.all('SELECT COUNT(*) as count FROM failed_work');
    console.log(`Failed Work: ${failed[0].count} files failed`);

    // If there are recent failed files, show a few examples
    if (failed[0].count > 0) {
        const recentFailed = await db.all(`
            SELECT fw.error_message, wq.file_path 
            FROM failed_work fw 
            JOIN work_queue wq ON fw.work_item_id = wq.id 
            ORDER BY fw.id DESC 
            LIMIT 3
        `);
        console.log('\nRecent Failed Files:');
        recentFailed.forEach((item, index) => {
            console.log(`  ${index + 1}. ${item.file_path}: ${item.error_message}`);
        });
    }

    await db.close();
}

checkStatus().catch(console.error); 