const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.init();
  }

  init() {
    if (process.env.EMAIL_SERVICE === 'sendgrid') {
      this.transporter = nodemailer.createTransport({
        service: 'SendGrid',
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY
        }
      });
    } else {
      // Default SMTP configuration
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'localhost',
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }
  }

  async sendCompletionEmail(userEmail, data) {
    try {
      const { projectName, totalFound, totalProcessed, downloadUrl } = data;
      
      const mailOptions = {
        from: process.env.FROM_EMAIL || 'noreply@scraper.com',
        to: userEmail,
        subject: `✅ Your ${projectName} is ready!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">🎉 Scraping Complete!</h2>
            
            <p>Great news! Your <strong>${projectName}</strong> has finished processing.</p>
            
            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #374151;">📊 Results Summary</h3>
              <ul style="list-style: none; padding: 0;">
                <li style="margin: 8px 0;">🔍 <strong>Businesses Found:</strong> ${totalFound}</li>
                <li style="margin: 8px 0;">✅ <strong>Successfully Processed:</strong> ${totalProcessed}</li>
                <li style="margin: 8px 0;">📁 <strong>Export Format:</strong> Excel (.xlsx)</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${downloadUrl}" 
                 style="background: #2563eb; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 6px; font-weight: bold;">
                📥 Download Your Data
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px;">
              <strong>Note:</strong> Your download link will expire in 7 days. 
              Make sure to save your data before then.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #6b7280; font-size: 12px;">
              Need help? Reply to this email or contact our support team.<br>
              Happy scraping! 🚀
            </p>
          </div>
        `
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`📧 Completion email sent to ${userEmail}`);
      
    } catch (error) {
      console.error('Error sending completion email:', error);
      // Don't throw - email failure shouldn't fail the job
    }
  }

  async sendWelcomeEmail(userEmail, userName) {
    try {
      const mailOptions = {
        from: process.env.FROM_EMAIL || 'noreply@scraper.com',
        to: userEmail,
        subject: '🎉 Welcome to Business Scraper!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Welcome ${userName}! 🎉</h2>
            
            <p>Thanks for joining Business Scraper! You're all set to start collecting business data from Google Maps.</p>
            
            <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #0369a1;">🆓 Your Free Plan Includes:</h3>
              <ul>
                <li>✅ 100 businesses per month</li>
                <li>✅ All data fields (name, phone, website, etc.)</li>
                <li>✅ Excel export</li>
                <li>✅ Email delivery</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" 
                 style="background: #2563eb; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 6px; font-weight: bold;">
                🚀 Start Your First Project
              </a>
            </div>
            
            <p>Ready to scale up? Check out our paid plans for higher limits and priority processing.</p>
            
            <p style="color: #6b7280; font-size: 12px;">
              Questions? Just reply to this email - we're here to help! 💪
            </p>
          </div>
        `
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`📧 Welcome email sent to ${userEmail}`);
      
    } catch (error) {
      console.error('Error sending welcome email:', error);
    }
  }
}

const emailService = new EmailService();

module.exports = {
  sendCompletionEmail: (email, data) => emailService.sendCompletionEmail(email, data),
  sendWelcomeEmail: (email, name) => emailService.sendWelcomeEmail(email, name)
};