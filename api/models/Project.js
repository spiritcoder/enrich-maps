const { MongoClient, ObjectId } = require('mongodb');

class Project {
  constructor() {
    this.client = null;
    this.db = null;
    this.collection = null;
  }

  async init() {
    this.client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
    await this.client.connect();
    this.db = this.client.db('scraper_saas');
    this.collection = this.db.collection('projects');
    
    // Create indexes
    await this.collection.createIndex({ userId: 1 });
    await this.collection.createIndex({ status: 1 });
    await this.collection.createIndex({ createdAt: -1 });
  }

  async create(projectData) {
    const project = {
      ...projectData,
      status: 'pending',
      progress: {
        current: 0,
        total: 0,
        percentage: 0,
        enrichedBusinesses: 0
      },
      results: {
        found: 0,
        processed: 0,
        fileUrl: null
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await this.collection.insertOne(project);
    return { ...project, _id: result.insertedId };
  }

  async findByUserId(userId, limit = 20) {
    return await this.collection
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  async findById(id) {
    return await this.collection.findOne({ _id: new ObjectId(id) });
  }

  async updateStatus(id, status, updateData = {}) {
    return await this.collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status,
          ...updateData,
          updatedAt: new Date()
        }
      }
    );
  }

  async updateProgress(id, current, total, enriched = 0) {
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    
    return await this.collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          'progress.current': current,
          'progress.total': total,
          'progress.percentage': percentage,
          'progress.enrichedBusinesses': enriched,
          updatedAt: new Date()
        }
      }
    );
  }

  async updateResults(id, results) {
    const updateFields = {
      updatedAt: new Date()
    };
    
    if (results.found !== undefined) {
      updateFields['results.found'] = results.found;
    }
    if (results.processed !== undefined) {
      updateFields['results.processed'] = results.processed;
    }
    if (results.fileUrl !== undefined) {
      updateFields['results.fileUrl'] = results.fileUrl;
    }
    
    return await this.collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );
  }

  // PHASE 2: Checkpoint management for recovery
  async updateCheckpoint(id, checkpoint) {
    return await this.collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          'checkpoint': checkpoint,
          updatedAt: new Date()
        }
      }
    );
  }

  async getCheckpoint(id) {
    const project = await this.findById(id);
    return project?.checkpoint || null;
  }

  async clearCheckpoint(id) {
    return await this.collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $unset: { checkpoint: 1 },
        $set: { updatedAt: new Date() }
      }
    );
  }

  async findRecoverableProjects() {
    // Find projects with checkpoints that can be resumed
    return await this.collection.find({
      status: { $in: ['processing', 'failed'] },
      checkpoint: { $exists: true }
    }).toArray();
  }

  async findStuckProjects() {
    // Find projects that have been 'processing' for more than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    return await this.collection.find({
      status: 'processing',
      updatedAt: { $lt: tenMinutesAgo }
    }).toArray();
  }

  async resetStuckProjects() {
    const stuckProjects = await this.findStuckProjects();
    
    if (stuckProjects.length > 0) {
      console.log(`🔄 Resetting ${stuckProjects.length} stuck projects`);
      
      await this.collection.updateMany(
        {
          status: 'processing',
          updatedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) }
        },
        {
          $set: {
            status: 'pending',
            updatedAt: new Date()
          }
        }
      );
    }
    
    return stuckProjects.length;
  }

  async delete(id) {
    const project = await this.findById(id);
    if (!project) return false;
    
    // Delete project record
    await this.collection.deleteOne({ _id: new ObjectId(id) });
    
    // Clean up project database
    try {
      const projectDb = this.client.db(`saas_${id}`);
      await projectDb.dropDatabase();
      console.log(`🗑️ Dropped database saas_${id}`);
    } catch (error) {
      console.log(`⚠️ Could not drop database saas_${id}:`, error.message);
    }
    
    return true;
  }

  async close() {
    if (this.client) {
      await this.client.close();
    }
  }
}

module.exports = Project;