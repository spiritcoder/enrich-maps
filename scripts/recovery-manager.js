const ExcelRecoveryService = require('../services/ExcelRecoveryService');

async function runRecoveryManager() {
  const recovery = new ExcelRecoveryService();
  
  try {
    await recovery.init();
    
    console.log('🚀 Starting Excel Lookup Recovery Manager\n');
    
    // Get current stats
    const stats = await recovery.getRecoveryStats();
    if (stats) {
      console.log('📊 Current Project Status:');
      stats.byStatus.forEach(stat => {
        console.log(`  ${stat._id}: ${stat.count} projects (${stat.withCheckpoint} with checkpoints)`);
      });
      console.log(`  Recoverable: ${stats.recoverableCount} projects\n`);
    }
    
    // Recover stuck jobs
    const recoveredJobs = await recovery.recoverStuckJobs();
    
    // Clean up old failed jobs
    const cleanedJobs = await recovery.cleanupFailedJobs();
    
    // Validate project integrity
    console.log('\n🔍 Validating project integrity...');
    const projects = await recovery.projectModel.collection.find({
      status: 'completed',
      'results.found': { $gt: 0 }
    }).limit(10).toArray();
    
    let validProjects = 0;
    let invalidProjects = 0;
    
    for (const project of projects) {
      const integrity = await recovery.validateProjectIntegrity(project._id.toString());
      if (integrity.isValid) {
        validProjects++;
      } else {
        invalidProjects++;
        console.log(`⚠️ Project ${project._id} has integrity issues: DB=${integrity.dbCount}, Reported=${integrity.reportedCount}`);
        
        // Auto-repair if discrepancy is small
        if (integrity.discrepancy <= 5) {
          await recovery.repairProject(project._id.toString());
        }
      }
    }
    
    console.log(`\n📈 Integrity Check Results:`);
    console.log(`  ✅ Valid: ${validProjects} projects`);
    console.log(`  ⚠️ Invalid: ${invalidProjects} projects`);
    
    console.log('\n✅ Recovery manager completed successfully');
    
  } catch (error) {
    console.error('❌ Recovery manager failed:', error);
  } finally {
    await recovery.close();
  }
}

// Run recovery manager
if (require.main === module) {
  runRecoveryManager().catch(console.error);
}

// Export for scheduled runs
module.exports = { runRecoveryManager };