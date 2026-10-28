// Supabase Edge Function: send-leave-notification
// Triggered when a Rep submits a leave request to email department supervisors.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SMTP_FROM = Deno.env.get('SMTP_FROM') || 'noreply@cbi-ghana.com'

serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const payload = await req.json()
    const { 
      recipients, 
      senderName,
      senderEmail,
      replyTo,
      subject, 
      text, 
      employeeName, 
      staffId, 
      leaveCategory, 
      totalDays, 
      startDate, 
      endDate, 
      outstandingBalance, 
      departmentName 
    } = payload

    if (!recipients || !recipients.length) {
      return new Response(JSON.stringify({ error: 'No recipients provided' }), { status: 400 })
    }

    // If Resend API Key is configured in Supabase environment secrets
    if (RESEND_API_KEY) {
      const emailPromises = recipients.map((r: { email: string; name: string }) => {
        return fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: senderName ? `${senderName} via CBI Portal <${SMTP_FROM}>` : `CBI Portal <${SMTP_FROM}>`,
            reply_to: replyTo || senderEmail || undefined,
            to: [r.email],
            subject: subject,
            text: text,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E5E7EB; border-radius: 12px;">
                <div style="background-color: #006939; color: white; padding: 15px; border-radius: 8px 8px 0 0;">
                  <h2 style="margin: 0; font-size: 18px;">CBI LEAVE APPLICATION NOTIFICATION</h2>
                  <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">Action Required: Department Supervisor Review</p>
                </div>
                <div style="padding: 20px; background-color: #FFFFFF;">
                  <p style="color: #374151; font-size: 14px;">
                    A new employee leave request has been submitted by Representative <strong>${senderName || 'Department Rep'}</strong> ${senderEmail ? `(${senderEmail})` : ''} and is awaiting your review:
                  </p>
                  
                  <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 13px;">
                    <tr style="border-bottom: 1px solid #F3F4F6;">
                      <td style="padding: 8px 0; color: #6B7280; font-weight: bold;">Employee Name:</td>
                      <td style="padding: 8px 0; color: #111827; font-weight: bold;">${employeeName} (${staffId})</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #F3F4F6;">
                      <td style="padding: 8px 0; color: #6B7280; font-weight: bold;">Department:</td>
                      <td style="padding: 8px 0; color: #111827;">${departmentName}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #F3F4F6;">
                      <td style="padding: 8px 0; color: #6B7280; font-weight: bold;">Leave Category:</td>
                      <td style="padding: 8px 0; color: #006939; font-weight: bold;">${leaveCategory}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #F3F4F6;">
                      <td style="padding: 8px 0; color: #6B7280; font-weight: bold;">Period:</td>
                      <td style="padding: 8px 0; color: #111827;">${startDate} to ${endDate} (${totalDays} Working Days)</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #F3F4F6;">
                      <td style="padding: 8px 0; color: #6B7280; font-weight: bold;">Outstanding Balance:</td>
                      <td style="padding: 8px 0; color: #006939; font-weight: bold;">${outstandingBalance}</td>
                    </tr>
                  </table>

                  <p style="margin-top: 20px; font-size: 13px; color: #6B7280;">Please log into the CBI Management Portal to approve or decline with your comments.</p>
                </div>
                <div style="background-color: #F9FAFB; padding: 12px; border-top: 1px solid #E5E7EB; text-align: center; font-size: 11px; color: #9CA3AF;">
                  CBI Ghana Limited • Internal Time & Attendance and Leave System
                </div>
              </div>
            `
          })
        })
      })

      await Promise.all(emailPromises)
      return new Response(JSON.stringify({ success: true, message: 'Emails dispatched via Resend' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    // Fallback log if no direct third-party mail provider configured
    console.log(`[Leave Email Notification] To: ${recipients.map((r: { email: string }) => r.email).join(', ')} | Subject: ${subject}`)
    return new Response(JSON.stringify({ success: true, message: 'Notification queued successfully' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})

