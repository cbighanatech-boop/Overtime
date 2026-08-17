/**
 * Helper to calculate the overtime rate multiplier based on company, shift category, date, and reason rules.
 * 
 * Rules checklist:
 * 1. CBI + Straight Day + Weekday => 1.5
 * 2. CBI + Straight Day + Weekend => 2.0 (Updated from 1.5 per feedback)
 * 3. CBI + Shift or Straight Day + Holiday => 2.0
 * 4. CBI + Shift + Reason = "Replacement - Day_Off (Shift Only)" => 2.0
 * 5. CBI + Shift + Reason = "Replacement - Extended Hours (Shift Only)" => 1.5
 * 6. Abanach + Straight Day + Weekday => 1.0
 * 7. Abanach + Straight Day + Weekend => 1.5
 * 8. Abanach + Shift or Straight Day + Holiday => 1.5
 * 9. Abanach + Shift + Reason = "Replacement - Day_Off (Shift Only)" => 1.5
 * 10. Abanach + Shift + Reason = "Replacement - Extended Hours (Shift Only)" => 1.0
 */
export const getRateMultiplier = ({ company, category, date, isHoliday, reason }) => {
  if (!date) return '1.5' // safe default

  const comp = company?.toUpperCase()
  const cat = category // 'Straight Day' or 'Shift'

  // Determine weekday vs weekend in local browser time to avoid timezone shift bugs
  const [year, month, day] = date.split('-').map(Number)
  const dateObj = new Date(year, month - 1, day)
  const dayOfWeek = dateObj.getDay() // 0 = Sunday, 6 = Saturday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  if (comp === 'CBI') {
    // Rule 3: CBI, Shift or Straight Day, Holiday => 2.0
    if (isHoliday) return '2'

    if (cat === 'Straight Day') {
      // Rule 1: CBI, Straight Day, weekday => 1.5
      // Rule 2: CBI, Straight Day, weekend => 2.0
      return isWeekend ? '2' : '1.5'
    }

    if (cat === 'Shift') {
      // Rule 4: CBI, Shift, Replacement - Day_Off => 2.0
      if (reason === 'Replacement - Day_Off (Shift Only)') return '2'
      // Rule 5: CBI, Shift, Replacement - Extended Hours => 1.5
      if (reason === 'Replacement - Extended Hours (Shift Only)') return '1.5'
      
      // Default Shift cases (PM, Others, etc.) follow the standard weekend/weekday pattern:
      return isWeekend ? '2' : '1.5'
    }
    return '1.5' // Default fallback
  }

  if (comp === 'ABANACH') {
    // Rule 8: Abanach, Shift or Straight Day, Holiday => 1.5
    if (isHoliday) return '1.5'

    if (cat === 'Straight Day') {
      // Rule 6: Abanach, Straight Day, weekday => 1.0
      // Rule 7: Abanach, Straight Day, weekend => 1.5
      return isWeekend ? '1.5' : '1'
    }

    if (cat === 'Shift') {
      // Rule 9: Abanach, Shift, Replacement - Day_Off => 1.5
      if (reason === 'Replacement - Day_Off (Shift Only)') return '1.5'
      // Rule 10: Abanach, Shift, Replacement - Extended Hours => 1.0
      if (reason === 'Replacement - Extended Hours (Shift Only)') return '1'

      // Default Shift cases follow the standard weekend/weekday pattern:
      return isWeekend ? '1.5' : '1'
    }
    return '1.5' // Default fallback
  }

  return '1.5' // Fallback
}
