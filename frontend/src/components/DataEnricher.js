import React, { useState } from 'react';
import { validation, createDataEnricherProject } from '../services/api';

const DataEnricher = ({ onProjectCreated, onClose }) => {
  const [file, setFile] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [selectedFields, setSelectedFields] = useState([]);
  const [aiProvider, setAiProvider] = useState('deepseek');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [cost, setCost] = useState(0);

  // Location enrichment fields organized by category
  const enrichmentFields = {
    'Location Intelligence': [
      { key: 'ai_description', name: 'Detailed Description', description: 'Comprehensive overview of the location' },
      { key: 'ai_location_type', name: 'Location Type', description: 'Classification of location type' },
      { key: 'ai_key_features', name: 'Key Features', description: 'Notable amenities and characteristics' },
      { key: 'ai_historical_background', name: 'Historical Background', description: 'Development history and timeline' },
      { key: 'ai_accessibility_info', name: 'Accessibility Info', description: 'Transportation and access details' }
    ],
    'Real Estate & Development': [
      { key: 'ai_property_types', name: 'Property Types', description: 'Available property types' },
      { key: 'ai_price_range', name: 'Price Range', description: 'Estimated property values' },
      { key: 'ai_developer_info', name: 'Developer Information', description: 'Developer details and reputation' },
      { key: 'ai_development_status', name: 'Development Status', description: 'Current phase and future plans' }
    ],
    'Area Context': [
      { key: 'ai_neighborhood_profile', name: 'Neighborhood Profile', description: 'Area character and vibe' },
      { key: 'ai_nearby_landmarks', name: 'Nearby Landmarks', description: 'Surrounding facilities and POIs' },
      { key: 'ai_infrastructure_quality', name: 'Infrastructure Quality', description: 'Roads, utilities, services quality' },
      { key: 'ai_growth_potential', name: 'Growth Potential', description: 'Future development prospects' }
    ],
    'Demographics & Lifestyle': [
      { key: 'ai_target_residents', name: 'Target Residents', description: 'Typical resident profile' },
      { key: 'ai_lifestyle_benefits', name: 'Lifestyle Benefits', description: 'Quality of life factors' },
      { key: 'ai_community_features', name: 'Community Features', description: 'Social amenities and facilities' }
    ]
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('excelFile', selectedFile);

      const response = await validation.validateExcel(formData);
      setPreview(response.data.validation);
      calculateCost(response.data.validation.rowCount, selectedFields.length);
    } catch (error) {
      console.error('File validation error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldToggle = (fieldKey) => {
    const newFields = selectedFields.includes(fieldKey)
      ? selectedFields.filter(f => f !== fieldKey)
      : [...selectedFields, fieldKey];
    
    setSelectedFields(newFields);
    if (preview) {
      calculateCost(preview.rowCount, newFields.length);
    }
  };

  const calculateCost = (rowCount, fieldCount) => {
    const costPerLocation = 0.10; // $0.10 per location
    const totalCost = rowCount * costPerLocation;
    setCost(totalCost);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || selectedFields.length === 0) return;

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('excelFile', file);
      formData.append('projectName', projectName);
      formData.append('selectedFields', JSON.stringify(selectedFields));
      formData.append('aiProvider', aiProvider);

      const response = await createDataEnricherProject(formData);
      onProjectCreated(response.project);
      onClose();
    } catch (error) {
      console.error('Submit error:', error);
      alert('Failed to create project. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const modalStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  };

  const contentStyle = {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '2rem',
    maxWidth: '800px',
    maxHeight: '90vh',
    overflow: 'auto',
    width: '90%'
  };

  return (
    <div style={modalStyle} onClick={onClose}>
      <div style={contentStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2>📊 Data Enricher</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* File Upload */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Upload Excel File
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              required
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
              Excel file with location data (Name column required)
            </p>
          </div>

          {/* Preview */}
          {preview && (
            <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
              <h4>📋 File Preview</h4>
              <p><strong>Rows:</strong> {preview.rowCount}</p>
              <p><strong>Columns:</strong> {preview.columns.join(', ')}</p>
              <div>
                <strong>Sample Data:</strong>
                {preview.sampleData.map((sample, index) => (
                  <div key={index} style={{ fontSize: '0.9rem', marginLeft: '1rem' }}>
                    • {sample.locationName} - {sample.address}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Project Name */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Project Name (Optional)
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Data Enricher - Auto-generated"
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
            />
          </div>

          {/* Field Selection */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Select Enrichment Fields ({selectedFields.length} selected)
            </label>
            
            {Object.entries(enrichmentFields).map(([category, fields]) => (
              <div key={category} style={{ marginBottom: '1rem' }}>
                <h4 style={{ color: '#2563eb', marginBottom: '0.5rem' }}>{category}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.5rem' }}>
                  {fields.map(field => (
                    <label key={field.key} style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer', padding: '0.5rem', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
                      <input
                        type="checkbox"
                        checked={selectedFields.includes(field.key)}
                        onChange={() => handleFieldToggle(field.key)}
                        style={{ marginRight: '0.5rem', marginTop: '0.2rem' }}
                      />
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{field.name}</div>
                        <div style={{ fontSize: '0.8rem', color: '#666' }}>{field.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Cost Display */}
          {cost > 0 && (
            <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#eff6ff', borderRadius: '4px' }}>
              <h4 style={{ color: '#2563eb' }}>💰 Cost Calculation</h4>
              <p><strong>Locations:</strong> {preview?.rowCount || 0}</p>
              <p><strong>Fields:</strong> {selectedFields.length}</p>
              <p><strong>Cost per location:</strong> $0.10</p>
              <p style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#2563eb' }}>
                <strong>Total Cost: ${cost.toFixed(2)}</strong>
              </p>
            </div>
          )}

          {/* Submit */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '0.75rem 1.5rem', border: '1px solid #ddd', borderRadius: '4px', background: 'white', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !file || selectedFields.length === 0}
              style={{ 
                padding: '0.75rem 1.5rem', 
                backgroundColor: '#2563eb', 
                color: 'white', 
                border: 'none', 
                borderRadius: '4px', 
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading || !file || selectedFields.length === 0 ? 0.6 : 1
              }}
            >
              {loading ? 'Creating...' : 'Start Enrichment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DataEnricher;