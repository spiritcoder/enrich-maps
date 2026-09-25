const express = require('express');
const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get subscription plans
router.get('/plans', async (req, res) => {
  const plans = {
    free: {
      name: 'Free',
      price: 0,
      monthlyLimit: 50,
      features: ['50 businesses/month', 'Basic support']
    },
    starter: {
      name: 'Starter',
      price: 29,
      monthlyLimit: 500,
      features: ['500 businesses/month', 'Email support', 'Export to Excel']
    },
    professional: {
      name: 'Professional',
      price: 79,
      monthlyLimit: 2000,
      features: ['2,000 businesses/month', 'Priority support', 'Advanced filters']
    },
    business: {
      name: 'Business',
      price: 199,
      monthlyLimit: 10000,
      features: ['10,000 businesses/month', 'Phone support', 'Custom fields']
    }
  };

  res.json({ plans });
});

// Get credit packages
router.get('/credit-packages', async (req, res) => {
  const packages = {
    small: {
      name: '100 Credits',
      credits: 100,
      price: 9.99,
      pricePerCredit: 0.0999
    },
    medium: {
      name: '500 Credits',
      credits: 500,
      price: 39.99,
      pricePerCredit: 0.0800
    },
    large: {
      name: '1000 Credits',
      credits: 1000,
      price: 69.99,
      pricePerCredit: 0.0700
    }
  };

  res.json({ packages });
});

// Purchase credits
router.post('/purchase-credits', async (req, res) => {
  try {
    const { packageId, paymentMethodId } = req.body;

    const packages = {
      small: { credits: 100, price: 9.99 },
      medium: { credits: 500, price: 39.99 },
      large: { credits: 1000, price: 69.99 }
    };

    const selectedPackage = packages[packageId];
    if (!selectedPackage) {
      return res.status(400).json({ error: 'Invalid package' });
    }

    // TODO: Process payment with Stripe
    // For now, simulate successful payment
    const paymentSuccessful = true;

    if (paymentSuccessful) {
      const userModel = new User();
      await userModel.init();
      
      await userModel.addCredits(
        req.user._id,
        selectedPackage.credits,
        `Credit package purchase: ${selectedPackage.credits} credits`
      );

      await userModel.close();

      res.json({
        success: true,
        message: `Successfully purchased ${selectedPackage.credits} credits`,
        credits: selectedPackage.credits
      });
    } else {
      res.status(400).json({ error: 'Payment failed' });
    }

  } catch (error) {
    console.error('Credit purchase error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's credit transactions
router.get('/transactions', async (req, res) => {
  try {
    const transactionModel = new CreditTransaction();
    await transactionModel.init();

    const transactions = await transactionModel.findByUserId(req.user._id);
    await transactionModel.close();

    res.json({ transactions });

  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update subscription plan
router.post('/update-subscription', async (req, res) => {
  try {
    const { plan } = req.body;

    const planLimits = {
      free: 50,
      starter: 500,
      professional: 2000,
      business: 10000
    };

    if (!planLimits[plan]) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // TODO: Process subscription with Stripe
    // For now, simulate successful subscription
    const subscriptionSuccessful = true;

    if (subscriptionSuccessful) {
      const userModel = new User();
      await userModel.init();

      await userModel.collection.updateOne(
        { _id: new (require('mongodb').ObjectId)(req.user._id) },
        {
          $set: {
            'subscription.plan': plan,
            'subscription.monthlyLimit': planLimits[plan],
            'usage.limit': planLimits[plan],
            updatedAt: new Date()
          }
        }
      );

      await userModel.close();

      res.json({
        success: true,
        message: `Successfully updated to ${plan} plan`,
        plan,
        monthlyLimit: planLimits[plan]
      });
    } else {
      res.status(400).json({ error: 'Subscription update failed' });
    }

  } catch (error) {
    console.error('Subscription update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;