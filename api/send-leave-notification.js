// Vercel Serverless Function: /api/send-leave-notification
// Sends automated email notification to department supervisors with direct approval link.

export default async function handler(req, res) {
  // CORS
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

    const RESEND_API_KEY = process.env.RESEND_API_KEY
    const SMTP_FROM = process.env.SMTP_FROM || 'talents@cbi-africa.com'

    if (RESEND_API_KEY) {
      const emailPromises = recipients.map(r => {
        return fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: senderName ? `${senderName} via CBI Portal <${SMTP_FROM}>` : `CBI Portal <${SMTP_FROM}>`,
            reply_to: replyTo || senderEmail || undefined,
            to: [r.email],
            subject: subject,
            text: text,
            html: html
          })
        })
      })

      await Promise.all(emailPromises)
      return res.status(200).json({ success: true, message: 'Automated email dispatched via Resend' })
    }

    // Logging fallback
    console.log(`[Automated Leave Notification] Dispatched to ${recipients.map(r => r.email).join(', ')} with link: ${approvalUrl}`)
    return res.status(200).json({ success: true, message: 'Notification processed' })
  } catch (err) {
    console.error('Serverless send-leave-notification error:', err)
    return res.status(500).json({ error: err.message || 'Failed to dispatch email' })
  }
}
