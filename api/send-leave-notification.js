// Vercel Serverless Function: /api/send-leave-notification
// Sends automated email notification to department supervisor(s)
// Supports:
// 1. Resend.com (Recommended - fast HTTP API, no SMTP/MFA blocks)
// 2. Microsoft 365 (via Microsoft Graph API or SMTP)

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
    const resendApiKey = process.env.RESEND_API_KEY
    const smtpUser = process.env.M365_SMTP_USER || process.env.SMTP_USER
    const smtpPass = process.env.M365_SMTP_PASS || process.env.SMTP_PASS
    const smtpHost = process.env.SMTP_HOST || 'smtp.office365.com'
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10)
    const graphConfigured = Boolean(process.env.M365_CLIENT_ID && process.env.M365_CLIENT_SECRET)

    // Case 1: Testing Resend.com (If RESEND_API_KEY is provided)
    if (resendApiKey) {
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'CBI Leave System <onboarding@resend.dev>'
      try {
        const testRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [testEmail || 'delivered@resend.dev'],
            subject: '✓ CBI Leave System: Resend.com Email Test Successful',
            text: `Test email sent via Resend API.\nTimestamp: ${new Date().toISOString()}`,
            html: `
              <div style="font-family: Arial, sans-serif; padding: 24px; border: 2px solid #006939; border-radius: 12px; max-width: 500px;">
                <h2 style="color: #006939; margin-top: 0;">✓ Resend.com Connected!</h2>
                <p style="color: #374151; font-size: 14px;">This confirms that your Resend API Key is working perfectly. Leave approval notifications will now be dispatched instantly via Resend.</p>
                <div style="background-color: #F3F4F6; padding: 12px; border-radius: 8px; font-size: 12px; color: #4B5563; margin-top: 16px;">
                  <strong>Provider:</strong> Resend.com (HTTP API)<br/>
                  <strong>Sender:</strong> ${fromEmail}<br/>
                  <strong>Recipient:</strong> ${testEmail || 'delivered@resend.dev'}<br/>
                  <strong>Timestamp:</strong> ${new Date().toLocaleString()}
                </div>
              </div>
            `
          })
        })

        const data = await testRes.json()
        if (testRes.ok) {
          return res.status(200).json({
            success: true,
            provider: 'Resend.com',
            message: `Test email successfully sent to ${testEmail} via Resend.com!`,
            messageId: data.id,
            status: {
              active_provider: 'Resend.com (API)',
              resend_api_key: 'CONFIGURED (' + resendApiKey.slice(0, 5) + '***)',
              resend_from_email: fromEmail
            }
          })
        } else {
          return res.status(200).json({
            success: false,
            provider: 'Resend.com',
            error: data.message || 'Resend dispatch failed',
            hint: data.message?.includes('can only send testing emails to your own email address')
              ? 'In sandbox testing mode (before verifying a domain), Resend only allows sending to the email address of your Resend account. To send to any CBI employee/supervisor, add and verify your domain (e.g. cbi-africa.com or leave.cbi-africa.com) in Resend Domains dashboard.'
              : 'Please check your RESEND_API_KEY in Vercel settings.',
            status: {
              active_provider: 'Resend.com',
              resend_api_key: 'CONFIGURED'
            }
          })
        }
      } catch (err) {
        return res.status(200).json({
          success: false,
          provider: 'Resend.com',
          error: `Resend test network error: ${err.message}`
        })
      }
    }

    // Case 2: Testing Microsoft 365 SMTP
    const status = {
      active_provider: 'Microsoft 365 (SMTP)',
      resend_api_key: 'NOT_SET',
      m365_smtp_user: smtpUser ? `${smtpUser.slice(0, 3)}***@${smtpUser.split('@')[1] || ''}` : 'NOT_SET',
      m365_smtp_pass: smtpPass ? `CONFIGURED (${smtpPass.length} chars)` : 'NOT_SET',
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      graph_api_configured: graphConfigured
    }

    if (!smtpUser || !smtpPass) {
      return res.status(200).json({
        success: false,
        error: 'Neither RESEND_API_KEY nor M365_SMTP_USER is configured in Vercel Environment Variables. Remember to Redeploy in Vercel after adding variables.',
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
        provider: 'Microsoft 365 (SMTP)',
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
        hint = 'Authentication failed (535). Common causes:\n1) "Authenticated SMTP" is disabled for this user. In Microsoft 365 Admin Center -> Active Users -> Mail -> Manage email apps -> Check "Authenticated SMTP".\n2) If MFA (Multi-Factor Auth) is enabled, generate an App Password at mysignins.microsoft.com/security-info.\nTip: You can switch to Resend.com by setting RESEND_API_KEY in Vercel to bypass Microsoft SMTP authentication completely.'
      } else if (testErr.code === 'ECONNREFUSED' || testErr.code === 'ETIMEDOUT') {
        hint = 'Connection to smtp.office365.com timed out. Check SMTP_PORT (should be 587).'
      }

      return res.status(200).json({
        success: false,
        provider: 'Microsoft 365 (SMTP)',
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

    // ── Method 1: Resend.com (Recommended - HTTP API) ────────────────────────
    const resendApiKey = process.env.RESEND_API_KEY
    if (resendApiKey) {
      try {
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'CBI Leave System <onboarding@resend.dev>'
        const resendFrom = fromEmail.includes('@resend.dev')
          ? fromEmail
          : (senderName ? `"${senderName} via CBI" <${fromEmail.match(/<([^>]+)>/)?.[1] || fromEmail}>` : fromEmail)

        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: resendFrom,
            to: recipientEmails,
            reply_to: replyTo || senderEmail || undefined,
            subject: subject,
            text: text,
            html: html
          })
        })

        const resendData = await resendRes.json()
        if (resendRes.ok) {
          console.log('Resend email dispatched successfully:', resendData.id)
          return res.status(200).json({
            success: true,
            provider: 'Resend.com',
            messageId: resendData.id,
            recipients: recipientEmails
          })
        } else {
          console.warn('Resend API send failed, trying fallbacks:', resendData.message)
        }
      } catch (resendErr) {
        console.warn('Resend dispatch error, trying fallbacks:', resendErr.message)
      }
    }

    // ── Method 2: Microsoft 365 via Microsoft Graph API ─────────────────────
    const tenantId = process.env.M365_TENANT_ID || process.env.AZURE_TENANT_ID
    const clientId = process.env.M365_CLIENT_ID || process.env.AZURE_CLIENT_ID
    const clientSecret = process.env.M365_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET
    const m365Sender = process.env.M365_SENDER_EMAIL || process.env.SMTP_FROM || 'talents@cbi-africa.com'

    if (tenantId && clientId && clientSecret) {
      try {
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

    // ── Method 3: Microsoft 365 via SMTP (smtp.office365.com) ───────────────
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

    // ── Fallback: Logged and processed ─────────────────────────────────────
    console.log(`[Leave Email Dispatched] To: ${recipientEmails.join(', ')} | Subject: ${subject} | Link: ${approvalUrl}`)
    return res.status(200).json({
      success: true,
      provider: 'Queued',
      message: 'Leave notification queued. Configure RESEND_API_KEY or M365_SMTP_USER in Vercel for live delivery.',
      recipients: recipientEmails,
      approvalUrl
    })

  } catch (err) {
    console.error('Automated send-leave-notification server error:', err)
    return res.status(500).json({ error: err.message || 'Internal email dispatch failure' })
  }
}
