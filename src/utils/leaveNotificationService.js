import { supabase } from '../supabase/client'
import { format, parseISO } from 'date-fns'

/**
 * Automated Service to notify department supervisor(s) via email and in-app alert
 * when a Leave request is placed.
 * Automatically constructs the direct one-click approval link for the supervisor.
 */

export const notifySupervisorsOfLeaveRequest = async ({
  leaveRequest,
  employee,
  leaveType,
  departmentName,
  outstandingBalance,
  repProfile
}) => {
  if (!leaveRequest || !employee) return { success: false, error: 'Missing request details' }

  try {
    const departmentId = employee.department_id || leaveRequest.department_id

    // 1. Fetch active supervisors for this department
    let supQuery = supabase
      .from('profiles')
      .select('id, full_name, email, role, department_id')
      .eq('is_active', true)
      .eq('role', 'supervisor')

    if (departmentId) {
      supQuery = supQuery.eq('department_id', departmentId)
    }

    const { data: supervisors, error: supError } = await supQuery
    if (supError) throw supError

    // If no direct supervisor with valid email assigned to this department, look for system Admins
    let recipients = (supervisors || []).filter(s => s.email && s.email.includes('@'))
    if (recipients.length === 0) {
      const { data: adminFallbacks } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('is_active', true)
        .eq('role', 'admin')

      recipients = (adminFallbacks || []).filter(s => s.email && s.email.includes('@'))
    }

    if (recipients.length === 0) {
      console.warn('No supervisor or admin found to notify for department:', departmentName)
      return { success: false, warning: 'No supervisor email found on file' }
    }

    // Format dates and details
    const startFormatted = leaveRequest.start_date
      ? format(parseISO(leaveRequest.start_date), 'dd MMM yyyy')
      : leaveRequest.start_date
    const endFormatted = leaveRequest.end_date
      ? format(parseISO(leaveRequest.end_date), 'dd MMM yyyy')
      : leaveRequest.end_date

    const employeeName = employee.full_name || leaveRequest.employee_name
    const staffId = employee.staff_id || leaveRequest.employee_id
    const leaveCategory = leaveType?.name || 'Leave'
    const totalDays = leaveRequest.total_days
    const balanceDays = outstandingBalance !== undefined && outstandingBalance !== null
      ? `${outstandingBalance} days remaining`
      : 'Calculated upon review'

    const repName = repProfile?.full_name || 'Department Representative'
    const repEmail = repProfile?.email || ''

    // 2. Direct Click-to-Approve URL for the Supervisor
    const origin = typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://cbi-overtime-app.vercel.app'

    const approvalUrl = `${origin}/leave/requests/${leaveRequest.id}?action=approve`

    const subject = `[Action Required: Leave Approval] ${employeeName} (${staffId}) - ${leaveCategory} (${totalDays} Working Day${Number(totalDays) === 1 ? '' : 's'})`

    // Plain text email body with direct clickable link
    const emailBody = `
Dear Supervisor,

A new employee leave application has been submitted by Representative ${repName} in the CBI Leave Management App and is awaiting your review and approval.

--------------------------------------------------
APPLICATION DETAILS:
• Employee Name: ${employeeName}
• Staff ID: ${staffId}
• Department: ${departmentName || 'Department'}
• Leave Category: ${leaveCategory}
• Leave Period: ${startFormatted} to ${endFormatted} (${totalDays} Working Day${Number(totalDays) === 1 ? '' : 's'})
• Current Outstanding Balance: ${balanceDays}
• Reason / Purpose: "${leaveRequest.reason || 'None specified'}"
• Relief Staff: ${leaveRequest.relief_staff_name || 'None specified'}
• Emergency Phone: ${leaveRequest.contact_phone || 'None specified'}
--------------------------------------------------

==================================================
ACTION REQUIRED: REVIEW & APPROVE
Click the link below to approve or decline this leave request:
${approvalUrl}
==================================================

Warm regards,
${repName}
CBI Ghana Limited • Leave & Attendance System
`.trim()

    // HTML email body with branded CBI Green CTA button
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E5E7EB; border-radius: 12px; background: #ffffff;">
        <div style="background-color: #006939; color: white; padding: 18px 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px; letter-spacing: 0.5px;">CBI LEAVE APPLICATION NOTIFICATION</h2>
          <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">Action Required: Department Supervisor Approval</p>
        </div>
        <div style="padding: 24px 20px; background-color: #FFFFFF;">
          <p style="color: #374151; font-size: 14px; margin-top: 0;">
            A new employee leave application has been submitted by Representative <strong>${repName}</strong> and requires your review and approval:
          </p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
            <tr style="border-bottom: 1px solid #F3F4F6;">
              <td style="padding: 10px 0; color: #6B7280; font-weight: bold; width: 40%;">Employee Name:</td>
              <td style="padding: 10px 0; color: #111827; font-weight: bold;">${employeeName} (${staffId})</td>
            </tr>
            <tr style="border-bottom: 1px solid #F3F4F6;">
              <td style="padding: 10px 0; color: #6B7280; font-weight: bold;">Department:</td>
              <td style="padding: 10px 0; color: #111827;">${departmentName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #F3F4F6;">
              <td style="padding: 10px 0; color: #6B7280; font-weight: bold;">Leave Category:</td>
              <td style="padding: 10px 0; color: #006939; font-weight: bold;">${leaveCategory}</td>
            </tr>
            <tr style="border-bottom: 1px solid #F3F4F6;">
              <td style="padding: 10px 0; color: #6B7280; font-weight: bold;">Duration:</td>
              <td style="padding: 10px 0; color: #111827;">${startFormatted} to ${endFormatted} (<strong>${totalDays} Working Day${Number(totalDays) === 1 ? '' : 's'}</strong>)</td>
            </tr>
            <tr style="border-bottom: 1px solid #F3F4F6;">
              <td style="padding: 10px 0; color: #6B7280; font-weight: bold;">Outstanding Balance:</td>
              <td style="padding: 10px 0; color: #006939; font-weight: bold;">${balanceDays}</td>
            </tr>
            <tr style="border-bottom: 1px solid #F3F4F6;">
              <td style="padding: 10px 0; color: #6B7280; font-weight: bold;">Reason:</td>
              <td style="padding: 10px 0; color: #374151;">${leaveRequest.reason || 'None specified'}</td>
            </tr>
          </table>

          <!-- Direct Click-to-Approve Button -->
          <div style="margin: 30px 0 20px 0; text-align: center;">
            <a href="${approvalUrl}" style="background-color: #006939; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              ✓ Click Here to Review &amp; Approve Leave
            </a>
          </div>

          <p style="text-align: center; font-size: 12px; color: #6B7280; margin: 15px 0 0 0;">
            Or copy and paste this link in your browser:<br/>
            <a href="${approvalUrl}" style="color: #006939; word-break: break-all;">${approvalUrl}</a>
          </p>
        </div>
        <div style="background-color: #F9FAFB; padding: 12px; border-top: 1px solid #E5E7EB; text-align: center; font-size: 11px; color: #9CA3AF;">
          CBI Ghana Limited • Internal Time &amp; Attendance and Leave System
        </div>
      </div>
    `.trim()

    // 3. Automated Dispatch via Edge Function or Serverless API
    let emailDispatched = false
    const payload = {
      recipients: recipients.map(s => ({ name: s.full_name, email: s.email })),
      senderName: repName,
      senderEmail: repEmail,
      replyTo: repEmail,
      subject,
      text: emailBody,
      html: emailHtml,
      approvalUrl,
      leaveRequestId: leaveRequest.id,
      employeeName,
      staffId,
      leaveCategory,
      totalDays,
      startDate: startFormatted,
      endDate: endFormatted,
      outstandingBalance: balanceDays,
      departmentName
    }

    // Try Supabase Edge Function
    try {
      const { error: fnError } = await supabase.functions.invoke('send-leave-notification', {
        body: payload
      })
      if (!fnError) {
        emailDispatched = true
      }
    } catch (invokeErr) {
      console.warn('Edge Function send-leave-notification not reachable:', invokeErr.message)
    }

    // Try serverless /api endpoint fallback if not yet dispatched
    if (!emailDispatched) {
      try {
        const apiRes = await fetch('/api/send-leave-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (apiRes.ok) {
          emailDispatched = true
        }
      } catch (apiErr) {
        // Fallback endpoint optional
      }
    }

    // 4. Save audit notification record in database
    for (const sup of recipients) {
      try {
        await supabase.from('leave_notifications').insert({
          leave_request_id: leaveRequest.id,
          recipient_email: sup.email,
          recipient_name: sup.full_name,
          sender_name: repName,
          sender_email: repEmail,
          subject,
          body: emailBody,
          status: 'Sent'
        })
      } catch (_) {
        // Table optional
      }
    }

    return {
      success: true,
      recipients: recipients.map(s => `${s.full_name} (${s.email})`),
      recipientEmails: recipients.map(s => s.email).filter(Boolean).join(', '),
      approvalUrl,
      emailDispatched
    }

  } catch (err) {
    console.error('Leave notification error:', err)
    return { success: false, error: err.message }
  }
}
