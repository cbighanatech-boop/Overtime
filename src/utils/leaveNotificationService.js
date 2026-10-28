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

    const subject = `[CBI Leave Action Required] Leave Request: ${employeeName} - ${leaveCategory} (${totalDays} Days)`
    
    // Construct rich email body
    const emailBody = `
Dear Supervisor,

A new employee leave application has been submitted by Representative ${repProfile?.full_name || 'Department Rep'} and requires your review:

--------------------------------------------------
EMPLOYEE DETAILS:
• Employee Name: ${employeeName}
• Staff ID: ${staffId}
• Department: ${departmentName || 'General Operations'}

LEAVE DETAILS:
• Leave Category: ${leaveCategory}
• Leave Period: ${startFormatted} to ${endFormatted} (${totalDays} Working Days)
• Current Outstanding Leave Balance: ${balanceDays}
• Reason: "${leaveRequest.reason || 'Not specified'}"
• Relief / Cover Staff: ${leaveRequest.relief_staff_name || 'None specified'}
• Contact Phone: ${leaveRequest.contact_phone || 'None specified'}
--------------------------------------------------

Please log in to the CBI Portal to approve or decline this application:
${window.location.origin}/leave/requests/${leaveRequest.id}

Thank you,
CBI Enterprise Portal System
`.trim()

    // 2. Attempt Edge Function invocation (Supabase serverless mailer)
    let emailDispatched = false
    try {
      const { error: fnError } = await supabase.functions.invoke('send-leave-notification', {
        body: {
          recipients: recipients.map(s => ({ name: s.full_name, email: s.email })),
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
      // Edge function might not be deployed yet; we continue gracefully with audit logging
      console.warn('Edge Function send-leave-notification not reachable:', invokeErr.message)
    }

    // 3. Save in-app notification / audit record in database
    for (const sup of recipients) {
      try {
        await supabase.from('leave_notifications').insert({
          leave_request_id: leaveRequest.id,
          recipient_email: sup.email,
          recipient_name: sup.full_name,
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
      subject,
      emailBody,
      emailDispatched
    }

  } catch (err) {
    console.error('Leave notification error:', err)
    return { success: false, error: err.message }
  }
}
