import { supabase } from '../supabase/client'
import { format, parseISO } from 'date-fns'

/**
 * Service to notify department supervisor(s) via email and in-app alert
 * when a Leave request is placed by a Representative.
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

    // If no direct supervisor assigned to this department, look for system Admins
    let recipients = supervisors || []
    if (recipients.length === 0) {
      const { data: adminFallbacks } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('is_active', true)
        .eq('role', 'admin')

      recipients = adminFallbacks || []
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

    const subject = `[Leave Application] ${employeeName} (${staffId}) - ${leaveCategory} (${totalDays} Days)`
    
    // Construct email body sent from the Rep User to the Supervisor
    const emailBody = `
Dear Supervisor,

Please be informed that I have submitted a leave application for ${employeeName} (Staff ID: ${staffId}) in the CBI Leave App, and it requires your review and approval.

--------------------------------------------------
APPLICATION DETAILS:
• Employee Name: ${employeeName}
• Staff ID: ${staffId}
• Department: ${departmentName || 'Department'}
• Leave Category: ${leaveCategory}
• Leave Period: ${startFormatted} to ${endFormatted} (${totalDays} Working Days)
• Current Outstanding Leave Balance: ${balanceDays}
• Reason / Purpose: "${leaveRequest.reason || 'None specified'}"
• Relief / Cover Staff: ${leaveRequest.relief_staff_name || 'None specified'}
• Emergency Phone: ${leaveRequest.contact_phone || 'None specified'}
--------------------------------------------------

Please log in to the CBI Portal to approve or decline this application:
${window.location.origin}/leave/requests/${leaveRequest.id}

Warm regards,
${repName}
${repEmail ? `Email: ${repEmail}` : ''}
Representative, ${departmentName || 'CBI Ghana'}
`.trim()

    // 2. Generate direct mailto link so Rep can send from their own Outlook / mail client
    const recipientEmails = recipients.map(s => s.email).filter(Boolean).join(',')
    const mailtoLink = recipientEmails
      ? `mailto:${encodeURIComponent(recipientEmails)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`
      : null

    // 3. Attempt Edge Function invocation (serverless mailer with reply-to as Rep User)
    let emailDispatched = false
    try {
      const { error: fnError } = await supabase.functions.invoke('send-leave-notification', {
        body: {
          recipients: recipients.map(s => ({ name: s.full_name, email: s.email })),
          senderName: repName,
          senderEmail: repEmail,
          replyTo: repEmail,
          subject,
          text: emailBody,
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
      })
      if (!fnError) {
        emailDispatched = true
      }
    } catch (invokeErr) {
      console.warn('Edge Function send-leave-notification not reachable:', invokeErr.message)
    }

    // 4. Save in-app notification / audit record in database
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
          status: emailDispatched ? 'Sent' : 'Queued'
        })
      } catch (_) {
        // Table may be optional
      }
    }

    return {
      success: true,
      recipients: recipients.map(s => `${s.full_name} (${s.email})`),
      recipientEmails,
      mailtoLink,
      repName,
      repEmail,
      subject,
      emailBody,
      emailDispatched
    }

  } catch (err) {
    console.error('Leave notification error:', err)
    return { success: false, error: err.message }
  }
}

