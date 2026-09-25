import React, { useState } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, DollarSign } from 'lucide-react';
import { createExcelLookupProject } from '../services/api';
import './ExcelUpload.css';

const ExcelUpload = ({ onProjectCreated, onClose }) => {
  const [file, setFile] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [validation, setValidation] = useState(null);
  const [enrichment, setEnrichment] = useState({
    enabled: false,
    aiProvider: 'deepseek',
    fields: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const defaultFields = [
    'business_description', 'target_audience', 'unique_selling_points',
    'customer_demographics', 'service_areas', 'business_highlights',
    'competitive_advantages', 'market_positioning', 'growth_opportunities'
  ];

  const handleFileSelect = async (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    if (!selectedFile.name.match(/\.(xlsx|xls)$/)) {
      setError('Please select an Excel file (.xlsx or .xls)');
      return;
    }

    setFile(selectedFile);
    setError('');
    setLoading(true);

    try {
      // Validate file on frontend (basic check)
      const formData = new FormData();
      formData.append('excelFile', selectedFile);
      
      // For now, just show file info - validation will happen on backend
      setValidation({
        valid: true,
        fileName: selectedFile.name,
        fileSize: (selectedFile.size / 1024 / 1024).toFixed(2) + ' MB'
      });
      
    } catch (err) {
      setError('Failed to validate Excel file');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('excelFile', file);
      formData.append('projectName', projectName);
      formData.append('enrichment', JSON.stringify(enrichment));

      const response = await createExcelLookupProject(formData);
      
      if (response.success) {
        onProjectCreated(response.project);
        onClose();
      } else {
        setError(response.error || 'Failed to create project');
      }
      
    } catch (err) {
      setError(err.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const toggleField = (field) => {
    setEnrichment(prev => ({
      ...prev,
      fields: prev.fields.includes(field)
        ? prev.fields.filter(f => f !== field)
        : [...prev.fields, field]
    }));
  };

  const selectAllFields = () => {
    setEnrichment(prev => ({
      ...prev,
      fields: defaultFields
    }));
  };

  const clearAllFields = () => {
    setEnrichment(prev => ({
      ...prev,
      fields: []
    }));
  };

  return (
    <div className="excel-upload-overlay">
      <div className="excel-upload-modal">
        <div className="excel-upload-header">
          <h2 className="excel-upload-title">Excel Business Lookup</h2>
          <button
            onClick={onClose}
            className="excel-upload-close"
            type="button"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="excel-upload-form">
          {/* File Upload */}
          <div className="excel-upload-field">
            <label className="excel-upload-label">
              Excel File
            </label>
            <div className="excel-upload-dropzone">
              {!file ? (
                <div>
                  <Upload className="excel-upload-icon" />
                  <div className="excel-upload-text">
                    Upload Excel file with business names
                  </div>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    id="excel-upload"
                  />
                  <label
                    htmlFor="excel-upload"
                    className="excel-upload-button"
                  >
                    Choose File
                  </label>
                </div>
              ) : (
                <div className="excel-upload-file-info">
                  <FileText className="excel-upload-file-icon" />
                  <div className="excel-upload-file-details">
                    <div className="excel-upload-filename">{validation?.fileName}</div>
                    <div className="excel-upload-filesize">{validation?.fileSize}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setValidation(null);
                    }}
                    className="excel-upload-remove"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
            <div className="excel-upload-hint">
              <strong>Required:</strong> Business names in first column or named 'name', 'business_name', etc.<br/>
              <strong>Recommended:</strong> Add 'Subdivision' (Lagos, Abuja, etc.) and 'Country' columns for best results.<br/>
              <strong>Example:</strong> Business Name | Subdivision | Country
            </div>
          </div>

          {/* Project Name */}
          <div className="excel-upload-field">
            <label className="excel-upload-label">
              Project Name (Optional)
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="excel-upload-input"
              placeholder="Auto-generated if left blank"
            />
          </div>

          {/* AI Enrichment */}
          <div className="excel-upload-field">
            <div className="excel-upload-checkbox-group">
              <input
                type="checkbox"
                id="enable-enrichment"
                checked={enrichment.enabled}
                onChange={(e) => setEnrichment(prev => ({ ...prev, enabled: e.target.checked }))}
                className="excel-upload-checkbox"
              />
              <label htmlFor="enable-enrichment" className="excel-upload-label">
                Enable AI Enrichment
              </label>
              <div className="excel-upload-cost-indicator">
                <DollarSign className="excel-upload-cost-icon" />
                <span>Additional cost per business</span>
              </div>
            </div>

            {enrichment.enabled && (
              <div className="excel-upload-enrichment-section">
                <div className="excel-upload-field">
                  <label className="excel-upload-label">
                    AI Provider
                  </label>
                  <select
                    value={enrichment.aiProvider}
                    onChange={(e) => setEnrichment(prev => ({ ...prev, aiProvider: e.target.value }))}
                    className="excel-upload-select"
                  >
                    <option value="deepseek">DeepSeek (Cheapest)</option>
                    <option value="gpt4">GPT-4 (Balanced)</option>
                    <option value="claude">Claude (Premium)</option>
                  </select>
                </div>

                <div className="excel-upload-field">
                  <div className="excel-upload-fields-header">
                    <label className="excel-upload-label">
                      Enrichment Fields
                    </label>
                    <div className="excel-upload-fields-actions">
                      <button
                        type="button"
                        onClick={selectAllFields}
                        className="excel-upload-link-button"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={clearAllFields}
                        className="excel-upload-link-button"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  
                  <div className="excel-upload-fields-grid">
                    {defaultFields.map(field => (
                      <label key={field} className="excel-upload-field-item">
                        <input
                          type="checkbox"
                          checked={enrichment.fields.includes(field)}
                          onChange={() => toggleField(field)}
                          className="excel-upload-field-checkbox"
                        />
                        <span className="excel-upload-field-label">
                          {field.replace(/_/g, ' ')}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="excel-upload-error">
              <AlertCircle className="excel-upload-error-icon" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit Button */}
          <div className="excel-upload-actions">
            <button
              type="button"
              onClick={onClose}
              className="excel-upload-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || loading}
              className="excel-upload-submit"
            >
              {loading ? (
                <>
                  <div className="excel-upload-spinner"></div>
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CheckCircle style={{ height: '16px', width: '16px' }} />
                  <span>Start Lookup</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExcelUpload;