import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { payments, user } from '../services/api';

const Credits = ({ onUserUpdate }) => {
  const [packages, setPackages] = useState({});
  const [currentCredits, setCurrentCredits] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [packagesRes, usageRes] = await Promise.all([
        payments.getCreditPackages(),
        user.getUsage()
      ]);
      
      setPackages(packagesRes.data.packages);
      setCurrentCredits(usageRes.data.usage.credits?.balance || 0);
    } catch (error) {
      console.error('Error loading credit packages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (packageId) => {
    try {
      await payments.purchaseCredits({ packageId });
      alert('Credits purchased successfully!');
      await loadData(); // Refresh local data
      if (onUserUpdate) onUserUpdate(); // Refresh global user data
    } catch (error) {
      console.error('Error purchasing credits:', error);
      alert('Failed to purchase credits. Please try again.');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading credit packages...</div>
      </div>
    );
  }

  const containerStyle = {
    padding: '2rem',
    maxWidth: '1200px',
    margin: '0 auto'
  };

  const packageCardStyle = {
    background: 'white',
    padding: '2rem',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    border: '1px solid #e5e7eb',
    textAlign: 'center',
    position: 'relative'
  };

  const buttonStyle = {
    background: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '0.75rem 2rem',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 'bold',
    width: '100%',
    marginTop: '1rem'
  };

  return (
    <div style={containerStyle}>
      <div style={{ marginBottom: '2rem' }}>
        <Link to="/billing" style={{ color: '#2563eb', textDecoration: 'none' }}>
          ← Back to Billing
        </Link>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{ marginBottom: '1rem' }}>💳 Buy Credits</h1>
        <p style={{ color: '#6b7280', fontSize: '1.1rem', marginBottom: '1rem' }}>
          Perfect for occasional overages or one-time projects
        </p>
        <div style={{
          display: 'inline-block',
          background: '#eff6ff',
          color: '#2563eb',
          padding: '0.75rem 1.5rem',
          borderRadius: '8px',
          fontWeight: 'bold'
        }}>
          Current Balance: {currentCredits} Credits
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
        {Object.entries(packages).map(([packageId, pkg]) => (
          <div key={packageId} style={packageCardStyle}>
            {packageId === 'medium' && (
              <div style={{
                position: 'absolute',
                top: '-10px',
                right: '-10px',
                background: '#10b981',
                color: 'white',
                padding: '0.25rem 0.75rem',
                borderRadius: '12px',
                fontSize: '0.8rem',
                fontWeight: 'bold'
              }}>
                BEST VALUE
              </div>
            )}

            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem' }}>{pkg.name}</h3>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <span style={{ fontSize: '3rem', fontWeight: 'bold', color: '#2563eb' }}>
                ${pkg.price}
              </span>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                {pkg.credits} Credits
              </div>
              <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                ${pkg.pricePerCredit.toFixed(4)} per credit
              </div>
            </div>

            <div style={{ 
              background: '#f8fafc', 
              padding: '1rem', 
              borderRadius: '8px', 
              marginBottom: '1.5rem' 
            }}>
              <div style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                Perfect for:
              </div>
              <div style={{ fontSize: '0.9rem' }}>
                {packageId === 'small' && '• Small overages\n• Testing new markets'}
                {packageId === 'medium' && '• Regular overages\n• Medium projects'}
                {packageId === 'large' && '• Large projects\n• Bulk scraping'}
              </div>
            </div>

            <button
              onClick={() => handlePurchase(packageId)}
              style={buttonStyle}
            >
              Purchase Credits
            </button>
          </div>
        ))}
      </div>

      {/* Usage Examples */}
      <div style={{ 
        background: 'white',
        padding: '2rem',
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>💡 How Credits Work</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎯</div>
            <h4 style={{ marginBottom: '0.5rem' }}>Automatic Usage</h4>
            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
              Credits are automatically used when you exceed your monthly subscription limit
            </p>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>♾️</div>
            <h4 style={{ marginBottom: '0.5rem' }}>Never Expire</h4>
            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
              Credits never expire and roll over month to month
            </p>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📊</div>
            <h4 style={{ marginBottom: '0.5rem' }}>Full Transparency</h4>
            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
              Track all credit usage in your billing dashboard
            </p>
          </div>
        </div>
      </div>

      {/* Subscription Suggestion */}
      <div style={{ 
        textAlign: 'center', 
        marginTop: '3rem',
        padding: '2rem',
        background: '#f8fafc',
        borderRadius: '12px'
      }}>
        <h3 style={{ marginBottom: '1rem' }}>🚀 Need More Regular Usage?</h3>
        <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
          Save money with a subscription plan for consistent monthly usage
        </p>
        <Link 
          to="/plans"
          style={{
            background: '#10b981',
            color: 'white',
            padding: '0.75rem 2rem',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 'bold'
          }}
        >
          View Subscription Plans
        </Link>
      </div>
    </div>
  );
};

export default Credits;