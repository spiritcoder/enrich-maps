import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { projects } from '../services/api';

const ProjectDetail = () => {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProject();
    
    // Auto-refresh for processing projects
    const interval = setInterval(() => {
      if (project?.status === 'processing') {
        loadProject();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [id, project?.status]);

  const loadProject = async () => {
    try {
      const response = await projects.get(id);
      setProject(response.data.project);
    } catch (error) {
      console.error('Error loading project:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/downloads/${project._id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Download failed');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.searchTerm || project.keyword}_results.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download file. Please try again.');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Project not found</div>
        <Link to="/dashboard">← Back to Dashboard</Link>
      </div>
    );
  }

  const containerStyle = {
    padding: '2rem',
    maxWidth: '1000px',
    margin: '0 auto'
  };

  const cardStyle = {
    background: 'white',
    padding: '1.5rem',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    marginBottom: '2rem'
  };

  const statusColors = {
    pending: '#6b7280',
    processing: '#f59e0b',
    completed: '#10b981',
    failed: '#ef4444'
  };

  const statusIcons = {
    pending: '⏸️',
    processing: '⏳',
    completed: '✅',
    failed: '❌'
  };

  const progressBarStyle = {
    width: '100%',
    height: '12px',
    background: '#e5e7eb',
    borderRadius: '6px',
    overflow: 'hidden'
  };

  const progressFillStyle = {
    height: '100%',
    background: project.status === 'completed' ? '#10b981' : '#f59e0b',
    width: `${project.progress?.percentage || 0}%`,
    transition: 'width 0.3s ease'
  };

  const downloadButtonStyle = {
    background: '#10b981',
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
      <div style={{ marginBottom: '2rem' }}>
        <Link to="/dashboard" style={{ color: '#2563eb', textDecoration: 'none' }}>
          ← Back to Dashboard
        </Link>
      </div>

      <h1 style={{ marginBottom: '2rem' }}>
        {statusIcons[project.status]} {project.searchTerm || project.keyword}
      </h1>

      {/* Status Card */}
      <div style={cardStyle}>
        <h3 style={{ marginBottom: '1rem' }}>📊 Project Status</h3>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ 
            color: statusColors[project.status],
            fontWeight: 'bold',
            fontSize: '1.1rem',
            marginRight: '1rem'
          }}>
            {project.status.toUpperCase()}
          </span>
          {project.status === 'processing' && (
            <span style={{ color: '#6b7280' }}>
              {project.progress?.current || 0} / {project.progress?.total || 0} locations processed
            </span>
          )}
        </div>

        {project.progress && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span>Progress</span>
              <span>{project.progress.percentage}%</span>
            </div>
            <div style={progressBarStyle}>
              <div style={progressFillStyle}></div>
            </div>
          </div>
        )}

        {project.status === 'completed' && project.results?.processed > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <button 
              onClick={handleDownload}
              style={downloadButtonStyle}
            >
              📥 Download Results
            </button>
          </div>
        )}
      </div>

      {/* Configuration Card */}
      <div style={cardStyle}>
        <h3 style={{ marginBottom: '1rem' }}>⚙️ Configuration</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div>
            <h4 style={{ marginBottom: '0.5rem' }}>🔍 Search Details</h4>
            <p><strong>Search Term:</strong> {project.searchTerm || project.keyword}</p>
            <p><strong>Business Limit:</strong> {project.businessLimit?.toLocaleString()}</p>
            {project.businessesPerLocation && (
              <p><strong>Per Location:</strong> {project.businessesPerLocation?.toLocaleString()}</p>
            )}
            <p><strong>Locations:</strong> {project.locations?.map(l => l.label || l).join(', ') || project.countries?.join(', ')}</p>
            <p><strong>Created:</strong> {new Date(project.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <h4 style={{ marginBottom: '0.5rem' }}>📋 Data Fields</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {project.fields?.map(field => (
                <span key={field} style={{
                  background: '#eff6ff',
                  color: '#2563eb',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.9rem'
                }}>
                  {field}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Results Card */}
      <div style={cardStyle}>
        <h3 style={{ marginBottom: '1rem' }}>📈 Results</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div style={{ textAlign: 'center', padding: '1rem', background: '#f8fafc', borderRadius: '6px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2563eb' }}>
              {project.results?.found || 0}
            </div>
            <div style={{ color: '#6b7280' }}>Businesses Found</div>
          </div>
          <div style={{ textAlign: 'center', padding: '1rem', background: '#f8fafc', borderRadius: '6px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>
              {project.results?.processed || 0}
            </div>
            <div style={{ color: '#6b7280' }}>Successfully Processed</div>
          </div>
          <div style={{ textAlign: 'center', padding: '1rem', background: '#f8fafc', borderRadius: '6px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>
              {project.estimatedCount || 0}
            </div>
            <div style={{ color: '#6b7280' }}>Estimated Total</div>
          </div>
        </div>

        {project.status === 'failed' && project.error && (
          <div style={{ 
            marginTop: '1rem',
            background: '#fee', 
            color: '#c33', 
            padding: '1rem', 
            borderRadius: '4px' 
          }}>
            <strong>Error:</strong> {project.error}
          </div>
        )}
      </div>

      {/* Auto-refresh notice */}
      {project.status === 'processing' && (
        <div style={{ 
          textAlign: 'center', 
          color: '#6b7280', 
          fontSize: '0.9rem',
          fontStyle: 'italic'
        }}>
          This page auto-refreshes every 5 seconds while processing...
        </div>
      )}
    </div>
  );
};

export default ProjectDetail;