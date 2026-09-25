import React, { useState, useEffect } from 'react';
import api from '../services/api';

const AIEnrichment = () => {
  const [file, setFile] = useState(null);
  const [selectedFields, setSelectedFields] = useState([]);
  const [aiProvider, setAiProvider] = useState('deepseek');
  const [projectName, setProjectName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState('');
  const [config, setConfig] = useState({ aiProviders: {}, enrichmentFields: {} });
  const [progress, setProgress] = useState(null);
  const [projectId, setProjectId] = useState(null);

  const styles = {
    container: {
      maxWidth: '800px',
      margin: '2rem auto',
      padding: '2rem',
      backgroundColor: '#fff',
      borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
    },
    header: {
      textAlign: 'center',
      marginBottom: '2rem'
    },
    form: {
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem'
    },
    formGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem'
    },
    label: {
      fontWeight: 'bold',
      color: '#374151'
    },
    input: {
      padding: '0.75rem',
      border: '1px solid #d1d5db',
      borderRadius: '4px',
      fontSize: '1rem'
    },
    select: {
      padding: '0.75rem',
      border: '1px solid #d1d5db',
      borderRadius: '4px',
      fontSize: '1rem',
      backgroundColor: 'white'
    },
    fieldsContainer: {
      border: '1px solid #d1d5db',
      borderRadius: '4px',
      padding: '1rem',
      maxHeight: '300px',
      overflowY: 'auto'
    },
    fieldCategory: {
      marginBottom: '1rem'
    },
    fieldCheckbox: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.5rem',
      padding: '0.5rem',
      cursor: 'pointer',
      borderRadius: '4px'
    },
    fieldName: {
      fontWeight: '500',
      minWidth: '150px'
    },
    fieldDescription: {
      color: '#6b7280',
      fontSize: '0.9rem'
    },
    button: {
      padding: '0.75rem 1.5rem',
      backgroundColor: '#2563eb',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      fontSize: '1rem',
      cursor: 'pointer'
    },
    buttonDisabled: {
      backgroundColor: '#9ca3af',
      cursor: 'not-allowed'
    },
    error: {
      color: '#dc2626',
      backgroundColor: '#fef2f2',
      padding: '0.75rem',
      borderRadius: '4px',
      border: '1px solid #fecaca'
    },
    success: {
      backgroundColor: '#f0fdf4',
      border: '1px solid #bbf7d0',
      borderRadius: '8px',
      padding: '1.5rem'
    },
    progressBar: {
      width: '100%',
      height: '20px',
      backgroundColor: '#e5e7eb',
      borderRadius: '10px',
      overflow: 'hidden',
      margin: '1rem 0'
    },
    progressFill: {
      height: '100%',
      backgroundColor: '#10b981'
    },
    progressStats: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: '0.9rem',
      color: '#6b7280'
    },
    actionButtons: {
      display: 'flex',
      gap: '1rem',
      marginTop: '1rem'
    },
    fileInfo: {
      padding: '0.5rem',
      backgroundColor: '#f3f4f6',
      borderRadius: '4px',
      fontSize: '0.9rem',
      color: '#374151'
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    let interval;
    if (projectId && uploadResult) {
      interval = setInterval(checkProgress, 3000);
    }
    return () => clearInterval(interval);
  }, [projectId, uploadResult]);

  const fetchConfig = async () => {
    try {
      const [fieldsResponse, providersResponse] = await Promise.all([
        api.get('/api/enrichment/fields'),
        api.get('/api/enrichment/providers')
      ]);
      
      setConfig({
        enrichmentFields: fieldsResponse.data.fields,
        aiProviders: providersResponse.data.providers,
        fieldCategories: fieldsResponse.data.categories
      });
      
      if (providersResponse.data.providers && Object.keys(providersResponse.data.providers).length > 0) {
        const firstProvider = Object.keys(providersResponse.data.providers)[0];
        setAiProvider(firstProvider);
      }
    } catch (error) {
      console.error('Failed to fetch config:', error);
      setError(`Failed to load configuration: ${error.response?.data?.error || error.message}`);
    }
  };

  const checkProgress = async () => {
    if (!projectId) return;
    
    try {
      const response = await api.get(`/api/ai-enrichment/progress/${projectId}`);
      setProgress(response.data.progress);
      
      if (response.data.project.status === 'completed') {
        setProgress(prev => ({ ...prev, status: 'completed' }));
      }
    } catch (error) {
      console.error('Failed to check progress:', error);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const fileExt = selectedFile.name.toLowerCase();
      if (fileExt.endsWith('.xlsx') || fileExt.endsWith('.xls')) {
        setFile(selectedFile);
        setError('');
      } else {
        setError('Please select an Excel file (.xlsx or .xls)');
        setFile(null);
      }
    }
  };

  const handleFieldToggle = (fieldKey) => {
    setSelectedFields(prev => 
      prev.includes(fieldKey) 
        ? prev.filter(f => f !== fieldKey)
        : [...prev, fieldKey]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select an Excel file');
      return;
    }
    
    if (selectedFields.length === 0) {
      setError('Please select at least one enrichment field');
      return;
    }

    setIsUploading(true);
    setError('');
    setUploadResult(null);

    const formData = new FormData();
    formData.append('excelFile', file);
    formData.append('selectedFields', JSON.stringify(selectedFields));
    formData.append('aiProvider', aiProvider);
    formData.append('projectName', projectName || `AI Enrichment - ${new Date().toLocaleDateString()}`);

    try {
      const response = await api.post('/api/ai-enrichment/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setUploadResult(response.data);
      setProjectId(response.data.projectId);
      setProgress({ exists: true, processed_rows: 0, total_rows: response.data.businessCount, percentage: 0 });
    } catch (error) {
      setError(error.response?.data?.error || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleResume = async () => {
    if (!projectId) return;
    
    try {
      await api.post(`/api/ai-enrichment/resume/${projectId}`);
      setProgress(prev => ({ ...prev, status: 'processing' }));
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to resume');
    }
  };

  const handleRetryFailed = async () => {
    if (!projectId) return;
    
    try {
      await api.post(`/api/ai-enrichment/retry-failed/${projectId}`);
      setProgress(prev => ({ ...prev, status: 'processing' }));
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to retry');
    }
  };

  const groupedFields = config.fieldCategories ? 
    Object.entries(config.fieldCategories).reduce((acc, [categoryKey, category]) => {
      acc[categoryKey] = {
        ...category,
        fields: Object.entries(config.enrichmentFields || {})
          .filter(([_, field]) => field.category === categoryKey)
          .map(([key, field]) => ({ key, ...field }))
      };
      return acc;
    }, {}) : {};

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2>🤖 AI Enrichment</h2>
        <p>Upload your Excel file and enrich it with AI-generated business data</p>
      </div>

      {!uploadResult ? (
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Project Name (Optional)</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="AI Enrichment Project"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Excel File *</label>
            <input
              type="file"
              onChange={handleFileChange}
              accept=".xlsx,.xls"
              style={styles.input}
              required
            />
            {file && (
              <div style={styles.fileInfo}>
                📄 {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </div>
            )}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>AI Provider *</label>
            <select
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value)}
              style={styles.select}
              required
            >
              {Object.keys(config.aiProviders || {}).length === 0 ? (
                <option>Loading providers...</option>
              ) : (
                Object.entries(config.aiProviders).map(([key, provider]) => (
                  <option key={key} value={key}>
                    {provider.icon} {provider.name} - {provider.costPerBusiness} credits/business
                  </option>
                ))
              )}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Enrichment Fields * (Select fields to generate with AI)</label>
            <div style={styles.fieldsContainer}>
              {Object.keys(config.enrichmentFields || {}).length === 0 ? (
                <div>Loading fields...</div>
              ) : (
                Object.entries(groupedFields).map(([categoryKey, category]) => (
                  <div key={categoryKey} style={styles.fieldCategory}>
                    <h4>{category.name}</h4>
                    <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>{category.description}</p>
                    {category.fields.map((field) => (
                      <label key={field.key} style={styles.fieldCheckbox}>
                        <input
                          type="checkbox"
                          checked={selectedFields.includes(field.key)}
                          onChange={() => handleFieldToggle(field.key)}
                        />
                        <span style={styles.fieldName}>{field.name}</span>
                        <span style={styles.fieldDescription}>{field.description}</span>
                      </label>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button
            type="submit"
            disabled={isUploading || !file || selectedFields.length === 0}
            style={{...styles.button, ...(isUploading || !file || selectedFields.length === 0 ? styles.buttonDisabled : {})}}
          >
            {isUploading ? '🔄 Processing...' : '🚀 Start AI Enrichment'}
          </button>
        </form>
      ) : (
        <div style={styles.success}>
          <h3>✅ AI Enrichment Started</h3>
          <div>
            <p><strong>Project ID:</strong> {uploadResult.projectId}</p>
            <p><strong>Businesses to Enrich:</strong> {uploadResult.businessCount}</p>
            <p><strong>Estimated Cost:</strong> {uploadResult.estimatedCost} credits</p>
          </div>

          {progress && (
            <div>
              <h4>📊 Progress</h4>
              {progress.exists ? (
                <div>
                  <div style={styles.progressBar}>
                    <div 
                      style={{...styles.progressFill, width: `${progress.percentage || 0}%`}}
                    ></div>
                  </div>
                  <div style={styles.progressStats}>
                    <span>Processed: {progress.processed_rows || 0}/{progress.total_rows || 0}</span>
                    <span>Enriched: {progress.enriched_count || 0}</span>
                    <span>Failed: {progress.failed_count || 0}</span>
                    <span>{progress.percentage || 0}%</span>
                  </div>
                  
                  {progress.status === 'completed' && (
                    <div style={{...styles.success, marginTop: '1rem'}}>
                      🎉 AI enrichment completed! Check your project dashboard to download results.
                    </div>
                  )}
                  
                  {progress.can_resume && (
                    <div style={styles.actionButtons}>
                      <button onClick={handleResume} style={styles.button}>
                        ▶️ Resume Processing
                      </button>
                      {progress.failed_count > 0 && (
                        <button onClick={handleRetryFailed} style={{...styles.button, backgroundColor: '#f59e0b'}}>
                          🔄 Retry Failed ({progress.failed_count})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p>Initializing...</p>
              )}
            </div>
          )}

          <button
            onClick={() => {
              setUploadResult(null);
              setFile(null);
              setSelectedFields([]);
              setProjectName('');
              setProgress(null);
              setProjectId(null);
            }}
            style={{...styles.button, backgroundColor: '#6b7280', marginTop: '1rem'}}
          >
            📤 Start New Enrichment
          </button>
        </div>
      )}
    </div>
  );
};

export default AIEnrichment;