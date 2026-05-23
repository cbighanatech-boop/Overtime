/**
 * Permission helpers for Role-Based Access Control (RBAC)
 */

export const isAdmin = (profile) => {
  return profile?.role?.toLowerCase() === 'admin'
}

export const isRep = (profile) => {
  return profile?.role?.toLowerCase() === 'rep'
}

export const isSupervisor = (profile) => {
  return profile?.role?.toLowerCase() === 'supervisor'
}

/**
 * Checks if a user has access to capture/create overtime entries
 */
export const canCapture = (profile) => {
  return isAdmin(profile) || isRep(profile)
}

/**
 * Checks if a user can review (approve/decline) overtime entries
 */
export const canReview = (profile) => {
  return isAdmin(profile) || isSupervisor(profile)
}

/**
 * Determines if a user can edit a specific overtime record
 * - Admin: Can edit ANY record, regardless of status or department
 * - Rep: Can edit ONLY if record is 'Pending' AND belongs to their department
 * - Supervisor: Cannot edit records at all
 */
export const canEditRecord = (profile, record) => {
  if (!profile || !record) return false
  if (isAdmin(profile)) return true
  if (isRep(profile)) {
    return record.status === 'Pending' && record.department_id === profile.department_id
  }
  return false
}

/**
 * Determines if a user can delete a specific overtime record
 * - Admin: Can delete ANY record
 * - Rep / Supervisor: Cannot delete records
 */
export const canDeleteRecord = (profile) => {
  return isAdmin(profile)
}

export const canDeleteUser = (profile) => {
  return isAdmin(profile)
}

/**
 * Determines if a user can approve/decline a specific record
 * - Admin: Can review ANY record (including reversing previous reviews)
 * - Supervisor: Can review ONLY 'Pending' records in their department
 * - Rep: Cannot review records
 */
export const canReviewRecord = (profile, record) => {
  if (!profile || !record) return false
  if (isAdmin(profile)) return true
  if (isSupervisor(profile)) {
    return record.status === 'Pending' && record.department_id === profile.department_id
  }
  return false
}

/**
 * Determines if a user can select a record for bulk actions
 * - Admin: can select any
 * - Supervisor: can select any (they can review any pending records, but for bulk we allow same as review)
 * - Rep: can select records that are pending and within their department
 */
export const canSelectRecord = (profile, record) => {
  if (!profile || !record) return false
  if (isAdmin(profile) || isSupervisor(profile)) return true
  if (isRep(profile)) {
    return record.status === 'Pending' && record.department_id === profile.department_id
  }
  return false
}
