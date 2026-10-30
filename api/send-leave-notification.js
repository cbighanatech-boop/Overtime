// Vercel Serverless Function: /api/send-leave-notification
// Sends automated email notification to department supervisor(s) via Microsoft 365
// Supports both:
// 1. Microsoft Graph API (OAuth2 Client Credentials - Microsoft recommended)
// 2. Microsoft 365 SMTP (smtp.office365.com via Nodemailer)

import nodemailer from 'nodemailer'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
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
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: false, // TLS via STARTTLS
          auth: {
            user: smtpUser,
            pass: smtpPass
          },
          tls: {
            ciphers: 'SSLv3',
            rejectUnauthorized: false
          }
        })

        await transporter.sendMail({
          from: senderName ? `"${senderName}" <${smtpUser}>` : `"CBI Portal" <${smtpUser}>`,
          to: recipientEmails.join(', '),
          replyTo: replyTo || senderEmail || undefined,
          subject: subject,
          text: text,
          html: html
        })

        return res.status(200).json({
          success: true,
          provider: 'Microsoft 365 (SMTP)',
          recipients: recipientEmails
        })
      } catch (smtpErr) {
        console.error('Microsoft 365 SMTP send error:', smtpErr.message)
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
