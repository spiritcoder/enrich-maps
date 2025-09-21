const Database = require('../config/database');

async function checkJobs() {
  const db = new Database();
  await db.init();
  
  const totalJobs = await db.db.collection('scraping_jobs').countDocuments();
  const pendingJobs = await db.db.collection('scraping_jobs').countDocuments({ status: 'pending' });
  const processingJobs = await db.db.collection('scraping_jobs').countDocuments({ status: 'processing' });
  const completedJobs = await db.db.collection('scraping_jobs').countDocuments({ status: 'completed' });
  const failedJobs = await db.db.collection('scraping_jobs').countDocuments({ status: 'failed' });
  
  console.log(`Total jobs: ${totalJobs}`);
  console.log(`Pending: ${pendingJobs}`);
  console.log(`Processing: ${processingJobs}`);
  console.log(`Completed: ${completedJobs}`);
  console.log(`Failed: ${failedJobs}`);
  
  if (pendingJobs > 0) {
    const sampleJobs = await db.db.collection('scraping_jobs').find({ status: 'pending' }).limit(3).toArray();
    console.log('\nSample pending jobs:');
    sampleJobs.forEach(job => {
      console.log(`- ${job.query} (${job.country}, ${job.subdivision})`);
    });
  }
  
  await db.close();
}

checkJobs().catch(console.error);