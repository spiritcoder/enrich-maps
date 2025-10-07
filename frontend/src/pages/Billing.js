import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { user, payments } from '../services/api';

const Billing = ({ onUserUpdate }) => {
  const [usage, setUsage] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  // Refresh data when component receives focus
  useEffect(() => {
    const handleFocus = () => loadData();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const loadData = async () => {
    try {
      const [usageRes, transactionsRes] = await Promise.all([
        user.getUsage(),
        payments.getTransactions()
      ]);
      
      setUsage(usageRes.data.usage);
      setTransactions(transactionsRes.data.transactions);
    } catch (error) {
      console.error('Error loading billing data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading billing information...</div>
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

  const buttonStyle = {
    background: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '0.75rem 1.5rem',
    borderRadius: '6px',
    textDecoration: 'none',
    display: 'inline-block',
    cursor: 'pointer',
    marginRight: '1rem'
  };

  const upgradeButtonStyle = {
    ...buttonStyle,
    background: '#10b981'
  };

  return (
    <div style={containerStyle}>
      <div style={{ marginBottom: '2rem' }}>
        <Link to="/dashboard" style={{ color: '#2563eb', textDecoration: 'none' }}>
          ← Back to Dashboard
        </Link>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0 }}>💳 Billing & Usage</h1>
        <button 
          onClick={() => { loadData(); if (onUserUpdate) onUserUpdate(); }}
          style={{
            background: '#f3f4f6',
            border: '1px solid #d1d5db',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {/* Current Plan */}
      <div style={cardStyle}>
        <h3 style={{ marginBottom: '1rem' }}>📋 Current Plan</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'center' }}>
          <div>
            <h4 style={{ margin: '0 0 0.5rem 0', textTransform: 'capitalize' }}>
              {usage?.subscription?.plan || 'Free'} Plan
            </h4>
            <p style={{ margin: '0 0 1rem 0', color: '#6b7280' }}>
              {usage?.subscription?.monthlyLimit || 50} businesses per month
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <Link to="/plans" style={upgradeButtonStyle}>
                {usage?.subscription?.plan === 'free' ? 'Upgrade Plan' : 'Change Plan'}
              </Link>
              <Link to="/credits" style={buttonStyle}>
                Buy Credits
              </Link>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2563eb' }}>
              {usage?.subscription?.monthlyLimit || 50}
            </div>
            <div style={{ color: '#6b7280' }}>Monthly Limit</div>
          </div>
        </div>
      </div>

      {/* Usage Overview */}
      <div style={cardStyle}>
        <h3 style={{ marginBottom: '1rem' }}>📊 Usage Overview</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div style={{ textAlign: 'center', padding: '1rem', background: '#f8fafc', borderRadius: '6px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2563eb' }}>
              {usage?.currentMonth || 0}
            </div>
            <div style={{ color: '#6b7280' }}>Used This Month</div>
          </div>
          <div style={{ textAlign: 'center', padding: '1rem', background: '#f8fafc', borderRadius: '6px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>
              {usage?.credits?.balance || 0}
            </div>
            <div style={{ color: '#6b7280' }}>Available Credits</div>
          </div>
          <div style={{ textAlign: 'center', padding: '1rem', background: '#f8fafc', borderRadius: '6px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>
              {(usage?.subscription?.monthlyLimit || 50) - (usage?.currentMonth || 0) + (usage?.credits?.balance || 0)}
            </div>
            <div style={{ color: '#6b7280' }}>Total Available</div>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div style={cardStyle}>
        <h3 style={{ marginBottom: '1rem' }}>📜 Transaction History</h3>
        {transactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
            <p>No transactions yet.</p>
            <Link to="/credits" style={buttonStyle}>
              Purchase Your First Credits
            </Link>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem', color: '#6b7280' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem', color: '#6b7280' }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem', color: '#6b7280' }}>Description</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem', color: '#6b7280' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction._id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem' }}>
                      {new Date(transaction.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{
                        background: transaction.type === 'purchase' ? '#dcfce7' : '#fee2e2',
                        color: transaction.type === 'purchase' ? '#166534' : '#dc2626',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        textTransform: 'capitalize'
                      }}>
                        {transaction.type}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem' }}>{transaction.description}</td>
                    <td style={{ 
                      padding: '0.75rem', 
                      textAlign: 'right',
                      color: transaction.type === 'purchase' ? '#10b981' : '#ef4444',
                      fontWeight: 'bold'
                    }}>
                      {transaction.type === 'purchase' ? '+' : '-'}{transaction.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Billing;