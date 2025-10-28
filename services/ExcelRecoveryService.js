const Project = require('../api/models/Project');
const { MongoClient } = require('mongodb');

class ExcelRecoveryService {
  constructor() {
    this.projectModel = null;
  }

  async init() {
    this.projectModel = new Project();
    await this.projectModel.init();
  }

  async recoverStuckJobs() {
    try {
      console.log('🔍 Checking for stuck Excel lookup jobs...');
      
      const recoverableProjects = await this.projectModel.findRecoverableProjects();
      
      if (recoverableProjects.length === 0) {
        console.log('✅ No stuck jobs found');
        return [];
      }

      console.log(`🔄 Found ${recoverableProjects.length} recoverable projects`);
      
      const recoveredJobs = [];
      
      for (const project of recoverableProjects) {
        try {
          const recovered = await this.recoverProject(project);
          if (recovered) {
            recoveredJobs.push(project._id);
          }
        } catch (error) {
          console.error(`❌ Failed to recover project ${project._id}:`, error.message);
        }
      }
      
      console.log(`✅ Recovered ${recoveredJobs.length} jobs`);
      return recoveredJobs;
      
    } catch (error) {
      console.error('❌ Recovery service error:', error);
      return [];
    }
  }

  async recoverProject(project) {
    const projectId = project._id.toString();
    const checkpoint = project.checkpoint;
    
    if (!checkpoint) {
      console.log(`⚠️ No checkpoint found for project ${projectId}`);
      return false;
    }

    console.log(`🔄 Recovering project ${projectId} from row ${checkpoint.last_processed_row + 1}`);
    
    // Reset project status to pending for re-processing
    await this.projectModel.updateStatus(projectId, 'pending', {
      recovery_attempted: true,
      recovery_at: new Date(),
      recovery_from_row: checkpoint.last_processed_row + 1
    });
    
    // Re-queue the job
    const { createScrapingJob } = require('./JobQueue');
    await createScrapingJob(projectId, {
      jobType: 'excel-lookup',
      projectId: projectId,
      excelFile: project.excelFile?.path,
      businessCount: project.businessLimit,
      enrichment: project.enrichment,
      isRecovery: true
    });
    
    console.log(`✅ Re-queued project ${projectId} for recovery`);
    return true;
  }

  async validateProjectIntegrity(projectId) {
    try {
      const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
      await client.connect();
      
      const db = client.db(`saas_${projectId}`);
      const businessCollection = db.collection('businesses');
      
      // Count businesses in database
      const dbCount = await businessCollection.countDocuments({ project_id: projectId });
      
      // Get project info
      const project = await this.projectModel.findById(projectId);
      const reportedCount = project?.results?.found || 0;
      
      await client.close();
      
      const isValid = dbCount === reportedCount;
      
      console.log(`🔍 Project ${projectId} integrity: DB=${dbCount}, Reported=${reportedCount}, Valid=${isValid}`);
      
      return {
        projectId,
        dbCount,
        reportedCount,
        isValid,
        discrepancy: Math.abs(dbCount - reportedCount)
      };
      
    } catch (error) {
      console.error(`❌ Failed to validate project ${projectId}:`, error.message);
      return { projectId, isValid: false, error: error.message };
    }
  }

  async repairProject(projectId) {
    try {
      console.log(`🔧 Repairing project ${projectId}...`);
      
      const integrity = await this.validateProjectIntegrity(projectId);
      
      if (integrity.isValid) {
        console.log(`✅ Project ${projectId} is already valid`);
        return true;
      }
      
      // Update project with correct counts
      await this.projectModel.updateResults(projectId, {
        found: integrity.dbCount,
        processed: integrity.dbCount
      });
      
      console.log(`✅ Repaired project ${projectId}: updated count to ${integrity.dbCount}`);
      return true;
      
    } catch (error) {
      console.error(`❌ Failed to repair project ${projectId}:`, error.message);
      return false;
    }
  }

  async cleanupFailedJobs() {
    try {
      console.log('🧹 Cleaning up failed Excel lookup jobs...');
      
      // Find projects that have been failed for more than 1 hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const failedProjects = await this.projectModel.collection.find({
        status: 'failed',
        updatedAt: { $lt: oneHourAgo },
        checkpoint: { $exists: true }
      }).toArray();
      
      if (failedProjects.length === 0) {
        console.log('✅ No failed jobs to clean up');
        return 0;
      }
      
      let cleanedCount = 0;
      
      for (const project of failedProjects) {
        try {
          // Clear checkpoint and update status
          await this.projectModel.clearCheckpoint(project._id.toString());
          await this.projectModel.updateStatus(project._id.toString(), 'failed', {
            cleaned_up: true,
            cleaned_at: new Date()
          });
          
          cleanedCount++;
        } catch (error) {
          console.error(`❌ Failed to clean project ${project._id}:`, error.message);
        }
      }
      
      console.log(`✅ Cleaned up ${cleanedCount} failed jobs`);
      return cleanedCount;
      
    } catch (error) {
      console.error('❌ Cleanup service error:', error);
      return 0;
    }
  }

  async getRecoveryStats() {
    try {
      const stats = await this.projectModel.collection.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            withCheckpoint: {
              $sum: { $cond: [{ $exists: ['$checkpoint', true] }, 1, 0] }
            }
          }
        }
      ]).toArray();
      
      const recoverable = await this.projectModel.findRecoverableProjects();
      
      return {
        byStatus: stats,
        recoverableCount: recoverable.length,
        timestamp: new Date()
      };
      
    } catch (error) {
      console.error('❌ Failed to get recovery stats:', error);
      return null;
    }
  }

  async close() {
    if (this.projectModel) {
      await this.projectModel.close();
    }
  }
}

module.exports = ExcelRecoveryService;