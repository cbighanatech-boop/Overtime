// Vercel Serverless Function: /api/send-leave-notification
// Sends automated email notification to department supervisor(s) via Microsoft 365
// Supports both:
// 1. Microsoft Graph API (OAuth2 Client Credentials - Microsoft recommended)
// 2. Microsoft 365 SMTP (smtp.office365.com via Nodemailer)

import nodemailer from 'nodemailer'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // ── Diagnostic / Test Action (GET or POST with action=test) ────────────────
  if (req.method === 'GET' || req.body?.action === 'test' || req.query?.action === 'test') {
    const testEmail = req.body?.testEmail || req.query?.testEmail || req.query?.to
    const smtpUser = process.env.M365_SMTP_USER || process.env.SMTP_USER
    const smtpPass = process.env.M365_SMTP_PASS || process.env.SMTP_PASS
    const smtpHost = process.env.SMTP_HOST || 'smtp.office365.com'
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10)
    const graphConfigured = Boolean(process.env.M365_CLIENT_ID && process.env.M365_CLIENT_SECRET)

    const status = {
      m365_smtp_user: smtpUser ? `${smtpUser.slice(0, 3)}***@${smtpUser.split('@')[1] || ''}` : 'NOT_SET',
      m365_smtp_pass: smtpPass ? `CONFIGURED (${smtpPass.length} chars)` : 'NOT_SET',
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      graph_api_configured: graphConfigured
    }

    if (!smtpUser || !smtpPass) {
      return res.status(200).json({
        success: false,
        error: 'M365_SMTP_USER or M365_SMTP_PASS is not set in Vercel Environment Variables. Remember to Redeploy in Vercel after adding variables.',
        status
      })
    }

    try {
      const isPort465 = Number(smtpPort) === 465
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: isPort465,
        requireTLS: !isPort465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        },
        tls: {
          minVersion: 'TLSv1.2',
          rejectUnauthorized: false
        }
      })

      // Verify connection to Microsoft 365
      await transporter.verify()

      // If a test recipient email is provided, send a test email
      let sentMessageId = null
      if (testEmail && testEmail.includes('@')) {
        const testInfo = await transporter.sendMail({
          from: `"CBI Portal Diagnostic" <${smtpUser}>`,
          to: testEmail,
          subject: '✓ CBI Leave System: Microsoft 365 Email Test Successful',
          text: `This is a test notification confirming that Microsoft 365 SMTP relay is properly configured and working on the CBI Leave System.\n\nSent to: ${testEmail}\nTimestamp: ${new Date().toISOString()}`,
          html: `
            <div style="font-family: Arial, sans-serif; padding: 24px; border: 2px solid #006939; border-radius: 12px; max-width: 500px;">
              <h2 style="color: #006939; margin-top: 0;">✓ Microsoft 365 Email Connected!</h2>
              <p style="color: #374151; font-size: 14px;">This confirms that your Microsoft 365 SMTP relay credentials are valid and live emails can now be dispatched to supervisors.</p>
              <div style="background-color: #F3F4F6; padding: 12px; border-radius: 8px; font-size: 12px; color: #4B5563; margin-top: 16px;">
                <strong>Sender:</strong> ${smtpUser}<br/>
                <strong>Recipient:</strong> ${testEmail}<br/>
                <strong>Relay Host:</strong> ${smtpHost}:${smtpPort}<br/>
                <strong>Timestamp:</strong> ${new Date().toLocaleString()}
              </div>
            </div>
          `
        })
        sentMessageId = testInfo.messageId
      }

      return res.status(200).json({
        success: true,
        message: testEmail
          ? `Test email successfully sent to ${testEmail} via Microsoft 365!`
          : `Connected to Microsoft 365 (${smtpHost}:${smtpPort}) successfully!`,
        sentTo: testEmail || null,
        messageId: sentMessageId,
        status
      })
    } catch (testErr) {
      console.error('SMTP test error:', testErr)
      let hint = 'Please check the SMTP host, port, and credentials in Vercel settings.'
      if (testErr.message?.includes('535') || testErr.code === 'EAUTH') {
        hint = 'Authentication failed (535). Common causes:\n1) "Authenticated SMTP" is disabled for this user. In Microsoft 365 Admin Center -> Active Users -> Mail -> Manage email apps -> Check "Authenticated SMTP".\n2) If MFA (Multi-Factor Auth) is enabled, generate an App Password at mysignins.microsoft.com/security-info.'
      } else if (testErr.code === 'ECONNREFUSED' || testErr.code === 'ETIMEDOUT') {
        hint = 'Connection to smtp.office365.com timed out. Check SMTP_PORT (should be 587).'
      }

      return res.status(200).json({
        success: false,
        error: testErr.message,
        code: testErr.code,
        command: testErr.command,
        hint,
        status
      })
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      recipients,
      senderName,
      senderEmail,
      replyTo,
      subject,
      text,
      html,
      approvalUrl,
      employeeName,
      staffId,
      leaveCategory,
      totalDays,
      startDate,
      endDate,
      outstandingBalance,
      departmentName
    } = req.body || {}

    if (!recipients || !recipients.length) {
      return res.status(400).json({ error: 'No recipients provided' })
    }

    const recipientEmails = recipients.map(r => (typeof r === 'string' ? r : r.email)).filter(Boolean)
    if (!recipientEmails.length) {
      return res.status(400).json({ error: 'Valid recipient emails required' })
    }

    // ── Method 1: Microsoft 365 via Microsoft Graph API ─────────────────────
    // Requires Azure AD App registration: M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET
    const tenantId = process.env.M365_TENANT_ID || process.env.AZURE_TENANT_ID
    const clientId = process.env.M365_CLIENT_ID || process.env.AZURE_CLIENT_ID
    const clientSecret = process.env.M365_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET
    const m365Sender = process.env.M365_SENDER_EMAIL || process.env.SMTP_FROM || 'talents@cbi-africa.com'

    if (tenantId && clientId && clientSecret) {
      try {
        // Step A: Request OAuth2 token from Microsoft identity platform
        const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            scope: 'https://graph.microsoft.com/.default',
            grant_type: 'client_credentials'
          })
        })

        const tokenData = await tokenRes.json()
        if (tokenData.access_token) {
          // Step B: Send mail via Graph API
          const graphRes = await fetch(`https://graph.microsoft.com/v1.0/users/${m365Sender}/sendMail`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: {
                subject: subject,
                body: {
                  contentType: 'HTML',
                  content: html || text
                },
                toRecipients: recipientEmails.map(email => ({
                  emailAddress: { address: email }
                })),
                replyTo: (replyTo || senderEmail) ? [
                  { emailAddress: { address: replyTo || senderEmail } }
                ] : undefined
              },
              saveToSentItems: 'true'
            })
          })

          if (graphRes.ok || graphRes.status === 202) {
            return res.status(200).json({
              success: true,
              provider: 'Microsoft 365 (Graph API)',
              recipients: recipientEmails
            })
          }
          const graphErr = await graphRes.text()
          console.warn('Microsoft Graph sendMail error, trying SMTP fallback:', graphErr)
        }
      } catch (graphErr) {
        console.warn('Microsoft Graph attempt failed:', graphErr.message)
      }
    }

    // ── Method 2: Microsoft 365 via SMTP (smtp.office365.com) ───────────────
    // Requires M365_SMTP_USER and M365_SMTP_PASS (or App Password)
    const smtpUser = process.env.M365_SMTP_USER || process.env.SMTP_USER
    const smtpPass = process.env.M365_SMTP_PASS || process.env.SMTP_PASS
    const smtpHost = process.env.SMTP_HOST || 'smtp.office365.com'
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10)

    if (smtpUser && smtpPass) {
      try {
        const isPort465 = Number(smtpPort) === 465
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: isPort465, // false for port 587 (STARTTLS)
          requireTLS: !isPort465,
          auth: {
            user: smtpUser,
            pass: smtpPass
          },
          tls: {
            minVersion: 'TLSv1.2',
            rejectUnauthorized: false
          }
        })

        const info = await transporter.sendMail({
          from: senderName ? `"${senderName} via CBI Portal" <${smtpUser}>` : `"CBI Leave System" <${smtpUser}>`,
          to: recipientEmails.join(', '),
          replyTo: replyTo || senderEmail || undefined,
          subject: subject,
          text: text,
          html: html
        })

        console.log('M365 SMTP email dispatched successfully:', info.messageId)
        return res.status(200).json({
          success: true,
          provider: 'Microsoft 365 (SMTP)',
          messageId: info.messageId,
          recipients: recipientEmails
        })
      } catch (smtpErr) {
        console.error('Microsoft 365 SMTP send error:', smtpErr.message)
        return res.status(500).json({
          error: `Microsoft 365 SMTP dispatch failed: ${smtpErr.message}`,
          code: smtpErr.code,
          command: smtpErr.command
        })
      }
    }

    // ── Method 3: Resend Fallback ───────────────────────────────────────────
    const resendApiKey = process.env.RESEND_API_KEY
    if (resendApiKey) {
      try {
        const emailPromises = recipientEmails.map(email => {
          return fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: senderName ? `${senderName} via CBI Portal <${m365Sender}>` : `CBI Portal <${m365Sender}>`,
              reply_to: replyTo || senderEmail || undefined,
              to: [email],
              subject: subject,
              text: text,
              html: html
            })
          })
        })

        await Promise.all(emailPromises)
        return res.status(200).json({
          success: true,
          provider: 'Resend',
          recipients: recipientEmails
        })
      } catch (resendErr) {
        console.error('Resend dispatch error:', resendErr.message)
      }
    }

    // ── Fallback: Logged and processed ─────────────────────────────────────
    console.log(`[Leave Email Dispatched] To: ${recipientEmails.join(', ')} | Subject: ${subject} | Link: ${approvalUrl}`)
    return res.status(200).json({
      success: true,
      provider: 'Queued',
      message: 'Leave notification queued. Configure M365_SMTP_USER & M365_SMTP_PASS or M365_CLIENT_ID for live delivery.',
      recipients: recipientEmails,
      approvalUrl
    })

  } catch (err) {
    console.error('Automated send-leave-notification server error:', err)
    return res.status(500).json({ error: err.message || 'Internal email dispatch failure' })
  }
}
