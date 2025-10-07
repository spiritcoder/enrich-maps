import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../services/api';

const Login = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await auth.login(formData);
      onLogin(response.data.user, response.data.token);
    } catch (error) {
      setError(error.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const containerStyle = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  };

  const formStyle = {
    background: 'white',
    padding: '2rem',
    borderRadius: '8px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
    width: '100%',
    maxWidth: '400px'
  };

  const inputStyle = {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid #ddd',
    borderRadius: '4px',
    marginBottom: '1rem',
    fontSize: '1rem'
  };

  const buttonStyle = {
    width: '100%',
    padding: '0.75rem',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    opacity: loading ? 0.7 : 1
  };

  return (
    <div style={containerStyle}>
      <form style={formStyle} onSubmit={handleSubmit}>
        <h2 style={{ textAlign: 'center', marginBottom: '2rem', color: '#333' }}>
          🚀 Business Scraper
        </h2>
        
        {error && (
          <div style={{ 
            background: '#fee', 
            color: '#c33', 
            padding: '0.75rem', 
            borderRadius: '4px', 
            marginBottom: '1rem' 
          }}>
            {error}
          </div>
        )}

        <input
          type="email"
          name="email"
          placeholder="Email"
          value={formData.email}
          onChange={handleChange}
          style={inputStyle}
          required
        />

        <input
          type="password"
          name="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          style={inputStyle}
          required
        />

        <button type="submit" style={buttonStyle} disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>

        <p style={{ textAlign: 'center', marginTop: '1rem' }}>
          Don't have an account? <Link to="/register">Sign up</Link>
        </p>
      </form>
    </div>
  );
};

export default Login;