import React, { useState, useEffect } from 'react';
import { enrichment, projects } from '../services/api';

const EnrichmentModal = ({ project, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    aiProvider: 'deepseek',
    fields: ['business_description', 'specialties_services', 'price_range', 'target_audience', 'customer_reviews_summary', 'accessibility_features', 'best_times_to_visit', 'parking_availability', 'payment_methods']
  });
  const [aiProviders, setAiProviders] = useState({});
  const [enrichmentFields, setEnrichmentFields] = useState({});
  const [fieldCategories, setFieldCategories] = useState({});
  const [costBreakdown, setCostBreakdown] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadEnrichmentData();
  }, []);

  useEffect(() => {
    calculateCost();
  }, [formData.aiProvider, formData.fields, project]);

  const loadEnrichmentData = async () => {
    try {
      const [providersRes, fieldsRes] = await Promise.all([
        enrichment.getProviders(),
        enrichment.getFields()
      ]);
      setAiProviders(providersRes.data.providers);
      setEnrichmentFields(fieldsRes.data.fields);
      setFieldCategories(fieldsRes.data.categories);
    } catch (error) {
      console.error('Error loading enrichment data:', error);
    }
  };

  const calculateCost = async () => {
    const businessCount = project.results?.processed || 0;
    if (!businessCount || !formData.aiProvider) return;
    
    try {
      const response = await enrichment.calculateCost({
        businessCount,
        aiProvider: formData.aiProvider,
        fields: formData.fields
      });
      setCostBreakdown(response.data.breakdown);
    } catch (error) {
      console.error('Error calculating cost:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (formData.fields.length === 0) {
      setError('Please select at least one enrichment field');
      setLoading(false);
      return;
    }

    try {
      await projects.enrich(project._id, {
        aiProvider: formData.aiProvider,
        fields: formData.fields
      });
      
      onSuccess();
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to start enrichment');
    } finally {
      setLoading(false);
    }
  };

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  };

  const modalStyle = {
    background: 'white',
    borderRadius: '8px',
    padding: '2rem',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '80vh',
    overflowY: 'auto'
  };

  const checkboxGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '0.5rem',
    marginTop: '0.5rem'
  };

  const checkboxStyle = {
    display: 'flex',
    alignItems: 'center',
    padding: '0.5rem',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    cursor: 'pointer'
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>🤖 Enrich Project Data</h2>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '6px' }}>
          <h4 style={{ margin: '0 0 0.5rem 0' }}>📊 Project: {project.name}</h4>
          <p style={{ margin: 0, color: '#6b7280' }}>
            This will enrich all {project.results?.processed || 0} businesses with directory-friendly AI content. <strong>All 9 directory fields are selected by default.</strong>
          </p>
        </div>

        {error && (
          <div style={{ 
            background: '#fee', 
            color: '#c33', 
            padding: '1rem', 
            borderRadius: '4px', 
            marginBottom: '1rem' 
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* AI Provider Selection */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              AI Provider
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
              {Object.entries(aiProviders).map(([key, provider]) => (
                <label 
                  key={key}
                  style={{
                    ...checkboxStyle,
                    background: formData.aiProvider === key ? '#eff6ff' : 'white',
                    borderColor: formData.aiProvider === key ? '#2563eb' : '#e5e7eb'
                  }}
                >
                  <input
                    type="radio"
                    name="aiProvider"
                    value={key}
                    checked={formData.aiProvider === key}
                    onChange={(e) => setFormData(prev => ({ ...prev, aiProvider: e.target.value }))}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <div>
                    <div>{provider.icon} {provider.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>+{provider.costPerBusiness} credits/business</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          
          {/* Enrichment Fields */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Enrichment Fields
            </label>
            {Object.entries(fieldCategories).map(([categoryKey, category]) => (
              <div key={categoryKey} style={{ marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#374151' }}>{category.name}</h4>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>{category.description}</p>
                <div style={checkboxGridStyle}>
                  {Object.entries(enrichmentFields)
                    .filter(([_, field]) => field.category === categoryKey)
                    .map(([fieldKey, field]) => (
                      <label 
                        key={fieldKey}
                        style={{
                          ...checkboxStyle,
                          background: formData.fields.includes(fieldKey) ? '#eff6ff' : 'white',
                          borderColor: formData.fields.includes(fieldKey) ? '#2563eb' : '#e5e7eb'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={formData.fields.includes(fieldKey)}
                          onChange={(e) => {
                            const fields = e.target.checked 
                              ? [...formData.fields, fieldKey]
                              : formData.fields.filter(f => f !== fieldKey);
                            setFormData(prev => ({ ...prev, fields }));
                          }}
                          style={{ marginRight: '0.5rem' }}
                        />
                        <div>
                          <div style={{ fontSize: '0.9rem' }}>{field.name}</div>
                          <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{field.description}</div>
                        </div>
                      </label>
                    ))
                  }
                </div>
              </div>
            ))}
          </div>

          {/* Cost Breakdown */}
          {costBreakdown && (
            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#fef3c7', borderRadius: '6px' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>💰 Cost Breakdown</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{project.results?.processed || 0} businesses × {aiProviders[formData.aiProvider]?.costPerBusiness || 0} credits</span>
                <strong style={{ fontSize: '1.2rem', color: '#d97706' }}>{costBreakdown.enrichmentCost} credits</strong>
              </div>
            </div>
          )}

          {/* Submit Buttons */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button 
              type="button"
              onClick={onClose}
              style={{
                background: '#6b7280',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={loading || formData.fields.length === 0}
              style={{
                background: loading || formData.fields.length === 0 ? '#9ca3af' : '#2563eb',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                cursor: loading || formData.fields.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Starting Enrichment...' : 'Start Enrichment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EnrichmentModal;