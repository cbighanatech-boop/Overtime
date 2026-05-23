// ============================================================
// CBI OVERTIME UNIFIED MOCK CLIENT & DATABASE ENGINE
// ============================================================
// Supports full lazy evaluation and perfect promise chaining.

const SEEDED_KEY = 'cbi_mock_db_seeded'

// Initial Seeding Data
const DEFAULT_DEPARTMENTS = [
  { id: 'dept-001', name: 'Engineering', created_at: new Date('2026-01-01').toISOString() },
  { id: 'dept-002', name: 'Production', created_at: new Date('2026-01-01').toISOString() },
  { id: 'dept-003', name: 'Operations', created_at: new Date('2026-01-01').toISOString() },
  { id: 'dept-004', name: 'Finance', created_at: new Date('2026-01-01').toISOString() }
]

const DEFAULT_PROFILES = [
  { id: 'user-admin-001', email: 'admin@cbi-overtime.com', password: 'Password123', full_name: 'Richmond Appiah', role: 'admin', department_id: 'dept-001', is_active: true, staff_id: 'CBI-001', category: 'Straight Day', created_at: new Date('2026-01-01').toISOString() },
  { id: 'user-super-002', email: 'supervisor@cbi-overtime.com', password: 'Password123', full_name: 'David Mills', role: 'supervisor', department_id: 'dept-002', is_active: true, staff_id: 'CBI-002', category: 'Shift', created_at: new Date('2026-01-01').toISOString() },
  { id: 'user-rep-003', email: 'rep@cbi-overtime.com', password: 'Password123', full_name: 'Kofi Mensah', role: 'rep', department_id: 'dept-003', is_active: true, staff_id: 'CBI-003', category: 'Shift', created_at: new Date('2026-01-01').toISOString() },
  { id: 'user-rep-004', email: 'sarah.j@cbi-overtime.com', password: 'Password123', full_name: 'Sarah Jenkins', role: 'rep', department_id: 'dept-001', is_active: true, staff_id: 'CBI-004', category: 'Straight Day', created_at: new Date('2026-01-10').toISOString() },
  { id: 'user-rep-005', email: 'john.d@cbi-overtime.com', password: 'Password123', full_name: 'John Doe', role: 'rep', department_id: 'dept-002', is_active: true, staff_id: 'CBI-005', category: 'Shift', created_at: new Date('2026-01-15').toISOString() },
  { id: 'user-rep-006', email: 'amara.o@cbi-overtime.com', password: 'Password123', full_name: 'Amara Osei', role: 'rep', department_id: 'dept-003', is_active: true, staff_id: 'CBI-006', category: 'Shift', created_at: new Date('2026-01-20').toISOString() },
  { id: 'user-rep-007', email: 'kwame.b@cbi-overtime.com', password: 'Password123', full_name: 'Kwame Boateng', role: 'rep', department_id: 'dept-004', is_active: true, staff_id: 'CBI-007', category: 'Straight Day', created_at: new Date('2026-01-25').toISOString() }
]

const DEFAULT_RECORDS = [
  {
    id: 'rec-001',
    employee_id: 'user-rep-004',
    employee_name: 'Sarah Jenkins',
    department_id: 'dept-001',
    shift_type: 'Shift',
    reason: 'Emergency server migrations and security patch deployments for production storage clusters.',
    date: '2026-05-15',
    work_date: '2026-05-15',
    time_in: '22:00',
    time_out: '06:00',
    overtime_hours: 8.00,
    hourly_rate: 35.00,
    rate_multiplier: 1.5,
    estimated_payout: 420.00,
    status: 'Approved',
    captured_by: 'user-rep-004',
    captured_at: new Date('2026-05-15T06:15:00Z').toISOString(),
    reviewed_by: 'user-admin-001',
    reviewed_at: new Date('2026-05-15T09:00:00Z').toISOString(),
    comments: 'Critical updates deployed on schedule with zero customer-facing downtime. Outstanding work.',
    created_at: new Date('2026-05-15T06:15:00Z').toISOString(),
    updated_at: new Date('2026-05-15T09:00:00Z').toISOString()
  },
  {
    id: 'rec-002',
    employee_id: 'user-rep-005',
    employee_name: 'John Doe',
    department_id: 'dept-002',
    shift_type: 'Straight Day',
    reason: 'Extending assembly runs to catch up with high-priority manufacturing purchase order backlog.',
    date: '2026-05-14',
    work_date: '2026-05-14',
    time_in: '16:00',
    time_out: '21:30',
    overtime_hours: 5.50,
    hourly_rate: 28.00,
    rate_multiplier: 1.5,
    estimated_payout: 231.00,
    status: 'Pending',
    captured_by: 'user-rep-005',
    captured_at: new Date('2026-05-14T21:40:00Z').toISOString(),
    created_at: new Date('2026-05-14T21:40:00Z').toISOString(),
    updated_at: new Date('2026-05-14T21:40:00Z').toISOString()
  },
  {
    id: 'rec-003',
    employee_id: 'user-rep-003',
    employee_name: 'Kofi Mensah',
    department_id: 'dept-003',
    shift_type: 'Straight Day',
    reason: 'Unloading heavy ocean shipping containers arriving outside standard warehouse operational hours.',
    date: '2026-05-12',
    work_date: '2026-05-12',
    time_in: '17:00',
    time_out: '21:00',
    overtime_hours: 4.00,
    hourly_rate: 30.00,
    rate_multiplier: 1.5,
    estimated_payout: 180.00,
    status: 'Approved',
    captured_by: 'user-rep-003',
    captured_at: new Date('2026-05-12T21:10:00Z').toISOString(),
    reviewed_by: 'user-super-002',
    reviewed_at: new Date('2026-05-13T09:30:00Z').toISOString(),
    comments: 'Shipment container secured and items logged in good order.',
    created_at: new Date('2026-05-12T21:10:00Z').toISOString(),
    updated_at: new Date('2026-05-13T09:30:00Z').toISOString()
  },
  {
    id: 'rec-004',
    employee_id: 'user-rep-006',
    employee_name: 'Amara Osei',
    department_id: 'dept-003',
    shift_type: 'Shift',
    reason: 'Facility-wide health & safety check and late-night gate control audit.',
    date: '2026-05-11',
    work_date: '2026-05-11',
    time_in: '21:00',
    time_out: '03:00',
    overtime_hours: 6.00,
    hourly_rate: 26.50,
    rate_multiplier: 2.0,
    estimated_payout: 318.00,
    status: 'Declined',
    captured_by: 'user-rep-006',
    captured_at: new Date('2026-05-11T03:15:00Z').toISOString(),
    reviewed_by: 'user-super-002',
    reviewed_at: new Date('2026-05-12T08:20:00Z').toISOString(),
    comments: 'Work could have been done during normal hours. Denied.',
    created_at: new Date('2026-05-11T03:15:00Z').toISOString(),
    updated_at: new Date('2026-05-12T08:20:00Z').toISOString()
  },
  {
    id: 'rec-005',
    employee_id: 'user-rep-007',
    employee_name: 'Kwame Boateng',
    department_id: 'dept-004',
    shift_type: 'Straight Day',
    reason: 'Preparing mid-year financial statements and corporate taxation ledger reconcilement.',
    date: '2026-05-10',
    work_date: '2026-05-10',
    time_in: '08:00',
    time_out: '13:00',
    overtime_hours: 5.00,
    hourly_rate: 42.00,
    rate_multiplier: 1.5,
    estimated_payout: 315.00,
    status: 'Approved',
    captured_by: 'user-rep-007',
    captured_at: new Date('2026-05-10T13:10:00Z').toISOString(),
    reviewed_by: 'user-admin-001',
    reviewed_at: new Date('2026-05-11T11:00:00Z').toISOString(),
    comments: 'Reconciliation reports review complete. Highly structured and complete.',
    created_at: new Date('2026-05-10T13:10:00Z').toISOString(),
    updated_at: new Date('2026-05-11T11:00:00Z').toISOString()
  },
  {
    id: 'rec-006',
    employee_id: 'user-rep-004',
    employee_name: 'Sarah Jenkins',
    department_id: 'dept-001',
    shift_type: 'Straight Day',
    reason: 'Investigating core firewall connectivity and database replication latency issue.',
    date: '2026-05-08',
    work_date: '2026-05-08',
    time_in: '17:00',
    time_out: '22:00',
    overtime_hours: 5.00,
    hourly_rate: 35.00,
    rate_multiplier: 1.5,
    estimated_payout: 262.50,
    status: 'Pending',
    captured_by: 'user-rep-004',
    captured_at: new Date('2026-05-08T22:05:00Z').toISOString(),
    created_at: new Date('2026-05-08T22:05:00Z').toISOString(),
    updated_at: new Date('2026-05-08T22:05:00Z').toISOString()
  },
  {
    id: 'rec-007',
    employee_id: 'user-rep-005',
    employee_name: 'John Doe',
    department_id: 'dept-002',
    shift_type: 'Shift',
    reason: 'Assembly line tooling changeover, diagnostic runs, and factory machine calibration.',
    date: '2026-05-07',
    work_date: '2026-05-07',
    time_in: '15:00',
    time_out: '23:30',
    overtime_hours: 8.50,
    hourly_rate: 28.00,
    rate_multiplier: 1.5,
    estimated_payout: 357.00,
    status: 'Approved',
    captured_by: 'user-rep-005',
    captured_at: new Date('2026-05-07T23:45:00Z').toISOString(),
    reviewed_by: 'user-super-002',
    reviewed_at: new Date('2026-05-08T09:15:00Z').toISOString(),
    comments: 'Tooling recalibrated and production successfully running within tolerance levels.',
    created_at: new Date('2026-05-07T23:45:00Z').toISOString(),
    updated_at: new Date('2026-05-08T09:15:00Z').toISOString()
  }
]

// Database Helpers
function getTableData(table) {
  const data = localStorage.getItem(`cbi_mock_db_${table}`)
  return data ? JSON.parse(data) : []
}

function saveTableData(table, data) {
  localStorage.setItem(`cbi_mock_db_${table}`, JSON.stringify(data))
}

// Check and Run Initial Seed
function seedDatabaseIfNeeded() {
  if (!localStorage.getItem(SEEDED_KEY)) {
    saveTableData('departments', DEFAULT_DEPARTMENTS)
    saveTableData('profiles', DEFAULT_PROFILES)
    saveTableData('overtime_records', DEFAULT_RECORDS)
    localStorage.setItem(SEEDED_KEY, 'true')
    console.log('🌱 CBI Mock Database Engine Seeded Successfully!')
  }
}

seedDatabaseIfNeeded()

// Mock Query Chain Builder supporting full lazy execution
class MockQueryBuilder {
  constructor(table) {
    this.table = table
    this.filters = []
    this.orders = []
    this.offset = 0
    this.limit = 1000
    this.isSingle = false
    this.isMaybeSingle = false
    this.countOption = null
    this.mutationType = 'select' // default
    this.insertData = null
    this.updateData = null
  }

  select(columnsStr = '*', options = {}) {
    // Only set to select if not already in a mutation workflow
    if (this.mutationType !== 'insert' && this.mutationType !== 'update' && this.mutationType !== 'delete') {
      this.mutationType = 'select'
    }
    if (options.count) {
      this.countOption = options.count
    }
    return this
  }

  eq(column, value) {
    this.filters.push({ type: 'eq', column, value })
    return this
  }

  ilike(column, pattern) {
    this.filters.push({ type: 'ilike', column, pattern })
    return this
  }

  gte(column, value) {
    this.filters.push({ type: 'gte', column, value })
    return this
  }

  lte(column, value) {
    this.filters.push({ type: 'lte', column, value })
    return this
  }

  order(column, options = {}) {
    const ascending = options.ascending !== false
    this.orders.push({ column, ascending })
    return this
  }

  range(fromIndex, toIndex) {
    this.offset = fromIndex
    this.limit = toIndex - fromIndex + 1
    return this
  }

  single() {
    this.isSingle = true
    return this
  }

  maybeSingle() {
    this.isMaybeSingle = true
    return this
  }

  insert(insertData) {
    this.mutationType = 'insert'
    this.insertData = insertData
    return this
  }

  update(updateData) {
    this.mutationType = 'update'
    this.updateData = updateData
    return this
  }

  delete() {
    this.mutationType = 'delete'
    return this
  }

  // Thenable interface to allow direct awaiting on query builder instance
  async then(onfulfilled, onrejected) {
    try {
      const res = await this.execute()
      return onfulfilled(res)
    } catch (err) {
      if (onrejected) return onrejected(err)
      throw err
    }
  }

  async execute() {
    // Latency simulation (80ms)
    await new Promise(r => setTimeout(r, 80))

    let data = getTableData(this.table)

    // ============================================================
    // INSERT OPERATION
    // ============================================================
    if (this.mutationType === 'insert') {
      const arrayToInsert = Array.isArray(this.insertData) ? this.insertData : [this.insertData]
      const insertedRows = []

      for (const row of arrayToInsert) {
        const newRow = {
          id: row.id || `mock-${this.table}-${Math.random().toString(36).substr(2, 9)}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...row
        }

        // Compute on-the-fly fields if overtime_records
        if (this.table === 'overtime_records') {
          const [inH, inM] = String(newRow.time_in).split(':').map(Number)
          const [outH, outM] = String(newRow.time_out).split(':').map(Number)
          let inMin = inH * 60 + inM
          let outMin = outH * 60 + outM
          if (outMin < inMin) outMin += 24 * 60
          const calculatedHours = Number(((outMin - inMin) / 60).toFixed(2))

          newRow.overtime_hours = calculatedHours
          newRow.estimated_payout = Number((calculatedHours * (newRow.hourly_rate || 25.0) * (newRow.rate_multiplier || 1.5)).toFixed(2))
        }

        data.push(newRow)
        insertedRows.push(newRow)
      }

      saveTableData(this.table, data)

      let resData = Array.isArray(this.insertData) ? insertedRows : insertedRows[0]
      if (this.isSingle) resData = insertedRows[0]

      return {
        data: resData,
        count: insertedRows.length,
        error: null
      }
    }

    // ============================================================
    // UPDATE OPERATION
    // ============================================================
    if (this.mutationType === 'update') {
      let matchedRows = [...data]
      
      // Apply filters to select which rows to update
      for (const filter of this.filters) {
        matchedRows = matchedRows.filter(item => {
          const itemVal = item[filter.column]
          if (filter.type === 'eq') {
            return String(itemVal) === String(filter.value)
          }
          return true
        })
      }
      const matchedIds = matchedRows.map(r => r.id)

      const updatedRows = []
      data = data.map(item => {
        if (matchedIds.includes(item.id)) {
          const updatedItem = { ...item, ...this.updateData, updated_at: new Date().toISOString() }

          // Re-calculate hours and payout if overtime_records
          if (this.table === 'overtime_records') {
            const [inH, inM] = String(updatedItem.time_in).split(':').map(Number)
            const [outH, outM] = String(updatedItem.time_out).split(':').map(Number)
            let inMin = inH * 60 + inM
            let outMin = outH * 60 + outM
            if (outMin < inMin) outMin += 24 * 60
            const calculatedHours = Number(((outMin - inMin) / 60).toFixed(2))

            updatedItem.overtime_hours = calculatedHours
            updatedItem.estimated_payout = Number((calculatedHours * (updatedItem.hourly_rate || 25) * (updatedItem.rate_multiplier || 1.5)).toFixed(2))
          }

          updatedRows.push(updatedItem)
          return updatedItem
        }
        return item
      })

      saveTableData(this.table, data)

      let resData = updatedRows
      if (this.isSingle) resData = updatedRows[0] || null

      return {
        data: resData,
        count: updatedRows.length,
        error: null
      }
    }

    // ============================================================
    // DELETE OPERATION
    // ============================================================
    if (this.mutationType === 'delete') {
      let matchedRows = [...data]
      for (const filter of this.filters) {
        matchedRows = matchedRows.filter(item => {
          const itemVal = item[filter.column]
          if (filter.type === 'eq') {
            return String(itemVal) === String(filter.value)
          }
          return true
        })
      }
      const matchedIds = matchedRows.map(r => r.id)

      const remainingData = data.filter(item => !matchedIds.includes(item.id))
      saveTableData(this.table, remainingData)

      return {
        data: null,
        error: null
      }
    }

    // ============================================================
    // SELECT OPERATION (READ)
    // ============================================================
    // Apply filters
    for (const filter of this.filters) {
      data = data.filter(item => {
        // Handle inner joins checks (e.g. 'profiles.full_name')
        if (filter.column.includes('.')) {
          const [assocTable, assocCol] = filter.column.split('.')
          let assocItem = null
          if (assocTable === 'profiles') {
            assocItem = getTableData('profiles').find(p => p.id === item.employee_id)
          } else if (assocTable === 'departments') {
            assocItem = getTableData('departments').find(d => d.id === item.department_id)
          }
          if (!assocItem) return false
          const val = String(assocItem[assocCol] || '').toLowerCase()
          const searchVal = filter.pattern.replace(/%/g, '').toLowerCase()
          return val.includes(searchVal)
        }

        const itemVal = item[filter.column]
        if (filter.type === 'eq') {
          return String(itemVal) === String(filter.value)
        } else if (filter.type === 'ilike') {
          const searchVal = filter.pattern.replace(/%/g, '').toLowerCase()
          return String(itemVal || '').toLowerCase().includes(searchVal)
        } else if (filter.type === 'gte') {
          return itemVal >= filter.value
        } else if (filter.type === 'lte') {
          return itemVal <= filter.value
        }
        return true
      })
    }

    // Hydrate relations
    data = data.map(item => {
      const newItem = { ...item }
      
      // Hydrate department
      if (this.table === 'overtime_records' || this.table === 'profiles') {
        const dept = getTableData('departments').find(d => d.id === item.department_id)
        newItem.departments = dept ? { id: dept.id, name: dept.name } : null
      }
      
      // Hydrate profiles
      if (this.table === 'overtime_records') {
        const prof = getTableData('profiles').find(p => p.id === item.employee_id)
        newItem.profiles = prof ? { id: prof.id, full_name: prof.full_name, email: prof.email, role: prof.role, staff_id: prof.staff_id, category: prof.category } : null
      }

      return newItem
    })

    // Apply orders
    for (const ord of this.orders) {
      data.sort((a, b) => {
        const valA = a[ord.column]
        const valB = b[ord.column]

        if (valA === undefined || valB === undefined) return 0

        if (typeof valA === 'string') {
          return ord.ascending ? valA.localeCompare(valB) : valB.localeCompare(valA)
        }
        return ord.ascending ? (valA < valB ? -1 : 1) : (valA < valB ? 1 : -1)
      })
    }

    const totalCount = data.length

    // Apply pagination range slicing
    data = data.slice(this.offset, this.offset + this.limit)

    let result = data
    if (this.isSingle || this.isMaybeSingle) {
      result = data[0] || null
    }

    return {
      data: result,
      count: totalCount,
      error: null
    }
  }
}

// Export Mock Client Singleton
export const supabase = {
  from(tableName) {
    return new MockQueryBuilder(tableName)
  },
  channel(name) {
    return {
      on(event, filter, callback) {
        return this
      },
      subscribe() {
        return this
      }
    }
  },
  removeChannel(channel) {
    // no-op
  }
}
