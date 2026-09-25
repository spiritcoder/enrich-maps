import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { projects, user } from '../services/api';
import EnrichmentModal from '../components/EnrichmentModal';
import ExcelUpload from '../components/ExcelUpload';
import DataEnricher from '../components/DataEnricher';

const Dashboard = () => {
  const [projectList, setProjectList] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enrichmentModal, setEnrichmentModal] = useState({ show: false, project: null });
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [showDataEnricher, setShowDataEnricher] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [projectsRes, usageRes] = await Promise.all([
        projects.list(),
        user.getUsage()
      ]);
      
      setProjectList(projectsRes.data.projects);
      setUsage(usageRes.data.usage);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (projectId) => {
    if (!window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return;
    }

    try {
      await projects.delete(projectId);
      setProjectList(prev => prev.filter(p => p._id !== projectId));
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('Failed to delete project. Please try again.');
    }
  };

  const handleEnrichProject = (project) => {
    setEnrichmentModal({ show: true, project });
  };

  const closeEnrichmentModal = () => {
    setEnrichmentModal({ show: false, project: null });
  };

  const handleExcelProjectCreated = (project) => {
    setProjectList(prev => [project, ...prev]);
    loadData(); // Refresh to get updated usage
  };



  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return '✅';
      case 'processing': return '⏳';
      case 'failed': return '❌';
      default: return '⏸️';
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading dashboard...</div>
      </div>
    );
  }

  const containerStyle = {
    padding: '2rem',
    maxWidth: '1200px',
    margin: '0 auto'
  };

  const cardStyle = {
    background: 'white',
    padding: '1.5rem',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    marginBottom: '2rem'
  };

  const usageBarStyle = {
    width: '100%',
    height: '8px',
    background: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden'
  };

  const usageProgressStyle = {
    height: '100%',
    background: usage?.percentage > 80 ? '#ef4444' : '#10b981',
    width: `${Math.min(usage?.percentage || 0, 100)}%`,
    transition: 'width 0.3s ease'
  };

  const projectCardStyle = {
    background: 'white',
    padding: '1rem',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    marginBottom: '1rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  };

  const buttonStyle = {
    background: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '0.75rem 1.5rem',
    borderRadius: '6px',
    textDecoration: 'none',
    display: 'inline-block',
    cursor: 'pointer'
  };

  return (
    <div style={containerStyle}>
      <h1 style={{ marginBottom: '2rem' }}>📊 Dashboard</h1>

      {/* Enhanced Usage Card */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3>📈 Usage & Credits</h3>
          <Link to="/billing" style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.9rem' }}>
            Manage Billing →
          </Link>
        </div>
        {usage && (
          <>
            {/* Subscription Usage */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span>Subscription: {usage.currentMonth} / {usage.subscription?.monthlyLimit || usage.limit}</span>
                <span>{Math.round((usage.currentMonth / (usage.subscription?.monthlyLimit || usage.limit)) * 100)}%</span>
              </div>
              <div style={usageBarStyle}>
                <div style={{
                  ...usageProgressStyle,
                  width: `${Math.min((usage.currentMonth / (usage.subscription?.monthlyLimit || usage.limit)) * 100, 100)}%`
                }}></div>
              </div>
            </div>
            
            {/* Credits Display */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              padding: '0.75rem',
              background: '#f8fafc',
              borderRadius: '6px',
              marginBottom: '1rem'
            }}>
              <div>
                <span style={{ fontWeight: 'bold' }}>💳 {usage.credits?.balance || 0} Credits</span>
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Available for overages</div>
              </div>
              <Link 
                to="/credits" 
                style={{
                  background: '#2563eb',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  textDecoration: 'none',
                  fontSize: '0.9rem'
                }}
              >
                Buy Credits
              </Link>
            </div>
            
            {/* Plan Info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                Current Plan: <strong>{usage.subscription?.plan || 'Free'}</strong>
              </span>
              {usage.subscription?.plan === 'free' && (
                <Link 
                  to="/plans"
                  style={{
                    background: '#10b981',
                    color: 'white',
                    padding: '0.5rem 1rem',
                    borderRadius: '4px',
                    textDecoration: 'none',
                    fontSize: '0.9rem'
                  }}
                >
                  Upgrade
                </Link>
              )}
            </div>
          </>
        )}
      </div>

      {/* Projects Section */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3>🚀 Your Projects</h3>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              onClick={() => setShowDataEnricher(true)}
              style={{ ...buttonStyle, background: '#8b5cf6' }}
            >
              🤖 Data Enricher
            </button>
            <button 
              onClick={() => setShowExcelUpload(true)}
              style={{ ...buttonStyle, background: '#10b981' }}
            >
              📊 Excel Lookup
            </button>
            <Link to="/create-project" style={buttonStyle}>
              + New Project
            </Link>
          </div>
        </div>

        {projectList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
            <p>No projects yet. Create your first scraping project!</p>
            <Link to="/create-project" style={{ ...buttonStyle, marginTop: '1rem' }}>
              Get Started
            </Link>
          </div>
        ) : (
          projectList.map((project) => (
            <div key={project._id} style={projectCardStyle}>
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0' }}>
                  {getStatusIcon(project.status)} {project.name}
                </h4>
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#6b7280' }}>
                  Search: {project.searchTerm || project.niche || project.keyword} • 
                  {project.locations?.length || project.countries?.length || 0} locations • 
                  {project.results?.processed || 0} businesses found • 
                  Created {new Date(project.createdAt).toLocaleDateString()}
                </p>
                {project.progress && project.status === 'processing' && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      Progress: {project.progress.percentage}%
                    </div>
                    <div style={{ ...usageBarStyle, height: '4px', marginTop: '0.25rem' }}>
                      <div style={{ 
                        ...usageProgressStyle, 
                        width: `${project.progress.percentage}%`,
                        background: '#f59e0b'
                      }}></div>
                    </div>
                  </div>
                )}
              </div>
              <ProjectActions 
                project={project} 
                onDelete={() => handleDeleteProject(project._id)}
                onEnrich={() => handleEnrichProject(project)}
              />
            </div>
          ))
        )}
      </div>

      {/* Enrichment Modal */}
      {enrichmentModal.show && (
        <EnrichmentModal 
          project={enrichmentModal.project}
          onClose={closeEnrichmentModal}
          onSuccess={() => {
            closeEnrichmentModal();
            loadData(); // Refresh data
          }}
        />
      )}

      {/* Data Enricher Modal */}
      {showDataEnricher && (
        <DataEnricher 
          onProjectCreated={handleExcelProjectCreated}
          onClose={() => setShowDataEnricher(false)}
        />
      )}

      {/* Excel Upload Modal */}
      {showExcelUpload && (
        <ExcelUpload 
          onProjectCreated={handleExcelProjectCreated}
          onClose={() => setShowExcelUpload(false)}
        />
      )}
    </div>
  );
};

// Project Actions Dropdown Component
const ProjectActions = ({ project, onDelete, onEnrich }) => {
  const [showDropdown, setShowDropdown] = useState(false);

  const dropdownStyle = {
    position: 'relative',
    display: 'inline-block'
  };

  const buttonStyle = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0.5rem',
    borderRadius: '4px',
    color: '#6b7280'
  };

  const menuStyle = {
    position: 'absolute',
    right: 0,
    top: '100%',
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    zIndex: 10,
    minWidth: '150px'
  };

  const menuItemStyle = {
    display: 'block',
    width: '100%',
    padding: '0.75rem 1rem',
    border: 'none',
    background: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    textDecoration: 'none',
    color: '#374151'
  };

  const deleteItemStyle = {
    ...menuItemStyle,
    color: '#dc2626'
  };

  return (
    <div style={dropdownStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ 
          color: getStatusColor(project.status),
          fontWeight: 'bold'
        }}>
          {project.status.toUpperCase()}
        </span>
        <button 
          style={buttonStyle}
          onClick={() => setShowDropdown(!showDropdown)}
        >
          ⋮
        </button>
      </div>
      
      {showDropdown && (
        <>
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 5
            }}
            onClick={() => setShowDropdown(false)}
          />
          <div style={menuStyle}>
            <Link 
              to={`/project/${project._id}`}
              style={menuItemStyle}
              onClick={() => setShowDropdown(false)}
            >
              👁️ View Details
            </Link>
            {project.status === 'completed' && project.results?.processed > 0 && (
              <button 
                style={menuItemStyle}
                onClick={() => {
                  setShowDropdown(false);
                  onEnrich();
                }}
              >
                🤖 Enrich Data
              </button>
            )}
            {project.status === 'completed' && project.excelFile && (
              <RetryFailedButton 
                project={project}
                onRetryStart={() => {
                  setShowDropdown(false);
                  window.location.reload(); // Refresh to show processing status
                }}
              />
            )}
            {project.status === 'completed' && project.type === 'data-enricher' && (
              <RetryEnrichmentButton 
                project={project}
                onRetryStart={() => {
                  setShowDropdown(false);
                  window.location.reload(); // Refresh to show processing status
                }}
              />
            )}
            <button 
              style={deleteItemStyle}
              onClick={() => {
                setShowDropdown(false);
                onDelete();
              }}
            >
              🗑️ Delete Project
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// Retry Failed Button Component
const RetryFailedButton = ({ project, onRetryStart }) => {
  const [loading, setLoading] = useState(false);
  const [failedCount, setFailedCount] = useState(null);

  useEffect(() => {
    // Check if there are failed records
    const checkFailedRecords = async () => {
      try {
        const response = await fetch(`/api/projects/${project._id}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          // This would need backend support to return failed count
          // For now, show button for all Excel projects
          setFailedCount(1); // Placeholder
        }
      } catch (error) {
        console.error('Error checking failed records:', error);
      }
    };

    if (project.excelFile) {
      checkFailedRecords();
    }
  }, [project._id, project.excelFile]);

  const handleRetryFailed = async () => {
    if (!window.confirm('Retry failed records with improved search queries?')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${project._id}/retry-failed`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Retry started for ${data.failedCount} failed records`);
        onRetryStart();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to start retry');
      }
    } catch (error) {
      console.error('Retry failed error:', error);
      alert('Failed to start retry. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!failedCount) return null;

  return (
    <button 
      style={{
        display: 'block',
        width: '100%',
        padding: '0.75rem 1rem',
        border: 'none',
        background: 'none',
        textAlign: 'left',
        cursor: loading ? 'not-allowed' : 'pointer',
        textDecoration: 'none',
        color: '#f59e0b',
        opacity: loading ? 0.6 : 1
      }}
      onClick={handleRetryFailed}
      disabled={loading}
    >
      {loading ? '⏳ Starting Retry...' : '🔄 Retry Failed Records'}
    </button>
  );
};

// Retry Enrichment Button Component for Data Enricher projects
const RetryEnrichmentButton = ({ project, onRetryStart }) => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    // Get enrichment statistics
    const getStats = async () => {
      try {
        const { dataEnricher } = await import('../services/api');
        const response = await dataEnricher.getStats(project._id);
        setStats(response.data.stats);
      } catch (error) {
        console.error('Error getting enrichment stats:', error);
      }
    };

    getStats();
  }, [project._id]);

  const handleRetryEnrichment = async () => {
    if (!stats?.canRetry) {
      alert('No failed enrichments found to retry');
      return;
    }

    if (!window.confirm(`Retry ${stats.failed + stats.partial} failed/partial enrichments?`)) {
      return;
    }

    setLoading(true);
    try {
      const { dataEnricher } = await import('../services/api');
      const response = await dataEnricher.retryEnrichment(project._id);
      const data = response.data;
      alert(`Retry completed: ${data.successCount}/${data.retriedCount} locations improved`);
      onRetryStart();
    } catch (error) {
      console.error('Retry enrichment error:', error);
      const message = error.response?.data?.error || 'Failed to retry enrichments';
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  if (!stats?.canRetry) return null;

  return (
    <button 
      style={{
        display: 'block',
        width: '100%',
        padding: '0.75rem 1rem',
        border: 'none',
        background: 'none',
        textAlign: 'left',
        cursor: loading ? 'not-allowed' : 'pointer',
        textDecoration: 'none',
        color: '#8b5cf6',
        opacity: loading ? 0.6 : 1
      }}
      onClick={handleRetryEnrichment}
      disabled={loading}
    >
      {loading ? '⏳ Retrying...' : `🤖 Retry ${stats.failed + stats.partial} Failed Enrichments`}
    </button>
  );
};

const getStatusColor = (status) => {
  switch (status) {
    case 'completed': return '#10b981';
    case 'processing': return '#f59e0b';
    case 'failed': return '#ef4444';
    default: return '#6b7280';
  }
};

export default Dashboard;