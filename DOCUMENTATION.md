# CBI Overtime Web Application — System Documentation

> **Version:** 1.0.0  
> **Target Environment:** CBI Ghana / Abanach Group  
> **Tech Stack:** React 19, Vite 8, Supabase (PostgreSQL), Tailwind CSS, Recharts  

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Technology Stack & System Architecture](#2-technology-stack--system-architecture)
3. [User Roles & Permissions (RBAC)](#3-user-roles--permissions-rbac)
4. [Overtime Rules & Multiplier Calculation Engine](#4-overtime-rules--multiplier-calculation-engine)
5. [Database Schema & Data Model](#5-database-schema--data-model)
6. [Core Functional Modules & Pages](#6-core-functional-modules--pages)
7. [Audit Trail & Governance](#7-audit-trail--governance)
8. [Setup, Configuration & Local Development](#8-setup-configuration--local-development)
9. [Deployment Guide](#9-deployment-guide)
10. [Troubleshooting & Maintenance](#10-troubleshooting--maintenance)

---

## 1. Executive Summary

The **CBI Overtime Web Application** is a specialized workforce attendance and overtime tracking system built for **CBI Ghana** and **Abanach Group**. It replaces manual and paper-based overtime capture with an automated, auditable, and role-governed digital workflow.

### Primary Objectives:
- **Accurate Overtime Computation:** Automated calculation of elapsed work hours, overnight shifts, break-time deductions, and statutory rate multipliers.
- **Dual-Entity Policy Handling:** Distinct rate policies for **CBI** and **Abanach** staff across weekday, weekend, shift, and public holiday scenarios.
- **Workflow Integrity & Timeliness:** Departmental supervisor review windows (5-day deadline policy) and entry-block capabilities during payroll lockouts.
- **Executive Visibility:** Real-time dashboards displaying overtime metrics, departmental cost distributions, trends, and budget impact in Ghanaian Cedis (GHS).

---

## 2. Technology Stack & System Architecture

### 2.1 Architecture Diagram

```
┌────────────────────────────────────────────────────────┐
│                      Client Layer                      │
│        React 19 SPA (Vite 8 + Tailwind CSS + Lucide)   │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS / REST / WSS
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Backend & Data Layer                 │
│                     Supabase Platform                  │
│  ┌─────────────────┬──────────────────┬──────────────┐ │
│  │  Supabase Auth  │ PostgreSQL 15+   │ RLS Policies │ │
│  │ (JWT & Sessions)│ (Tables/Triggers)│ (Row Security│ │
│  └─────────────────┴──────────────────┴──────────────┘ │
└────────────────────────────────────────────────────────┘
```

### 2.2 Client Stack
- **Framework:** [React 19](https://react.dev/) with [Vite 8](https://vitejs.dev/)
- **Routing:** [React Router v7](https://reactrouter.com/) (Browser router, protected routes, role guards)
- **Styling:** [Tailwind CSS v3](https://tailwindcss.com/) with custom CBI corporate colors (`#006939` Green, `#FDB913` Yellow)
- **Visualization:** [Recharts v3](https://recharts.org/) for area, bar, and pie charts
- **Data Export & Import:** [SheetJS (xlsx)](https://docs.sheetjs.com/) for bulk Excel imports and report downloads
- **Icons & Notifications:** [Lucide React](https://lucide.dev/) and [React Hot Toast](https://react-hot-toast.zackfrazier.dev/)
- **Date Utilities:** [date-fns v4](https://date-fns.org/)

### 2.3 Backend & Persistence
- **Database Engine:** Supabase PostgreSQL with custom PL/pgSQL triggers, stored procedures, and generated columns.
- **Row Level Security (RLS):** Granular access policies ensuring users only query or mutate authorized rows.
- **Authentication:** Supabase Auth with custom user metadata synchronizing to `public.profiles`.

---

## 3. User Roles & Permissions (RBAC)

The application enforces a 3-tier Role-Based Access Control model:

| Capability / Action | Admin | Supervisor | Department Rep (`rep`) |
| :--- | :---: | :---: | :---: |
| **View Dashboard** | All Departments | Own Department | Own Department |
| **Capture Overtime (`/records/new`)** | Any Department | None | Own Department |
| **Batch Multi-Employee Capture** | Yes | No | Yes |
| **Quick Add Employee on Capture** | Yes | No | Yes |
| **Edit Record (`/records/:id/edit`)** | Any Record | No | Pending & Own Dept only |
| **Delete Record** | Any Record | No | Pending & Own Dept only |
| **Review Records (Approve/Decline)** | Any Record (can override) | Pending & Own Dept (within 5 days) | No |
| **Bulk Review Records** | All | Own Dept (within 5 days) | No |
| **Export Records to Excel** | All Departments | Filtered Scope | Filtered Scope |
| **User & Access Management** | Full CRUD | No | No |
| **Employee Roster & Bulk Excel Import** | Full CRUD | View Only | View Only |
| **Department Administration** | Full CRUD | View Only | View Only |
| **Holiday Calendar Management** | Full CRUD | View Only | View Only |
| **Extra Hours Allocation** | Full CRUD | No | No |
| **Admin Action Center & Reminders (`/admin-actions`)** | Full CRUD | No | No |
| **Admin Entry Blocks (Freeze submissions)** | Full CRUD | Read-only | Read-only |
| **View System Audit Trail** | Full Access | No | No |

---

## 4. Overtime Rules & Multiplier Calculation Engine

Located in `src/utils/multiplierHelper.js`, the calculation engine assigns an overtime rate multiplier based on **Company**, **Shift Category**, **Work Date (Weekday vs Weekend)**, **Holidays**, and **Reason**.

### 4.1 Multiplier Rules Matrix

| Company | Shift Category | Condition / Reason | Multiplier |
| :--- | :--- | :--- | :---: |
| **CBI** | Straight Day | Weekday (Mon–Fri) | **1.5×** |
| **CBI** | Straight Day | Weekend (Sat–Sun) | **2.0×** |
| **CBI** | Any | Public Holiday | **2.0×** |
| **CBI** | Shift | Replacement - Day_Off (Shift Only) | **2.0×** |
| **CBI** | Shift | Replacement - Extended Hours (Shift Only) | **1.5×** |
| **CBI** | Shift | Standard Shift Weekend / Weekday | **2.0× / 1.5×** |
| **Abanach** | Straight Day | Weekday (Mon–Fri) | **1.0×** |
| **Abanach** | Straight Day | Weekend (Sat–Sun) | **1.5×** |
| **Abanach** | Any | Public Holiday | **1.5×** |
| **Abanach** | Shift | Replacement - Day_Off (Shift Only) | **1.5×** |
| **Abanach** | Shift | Replacement - Extended Hours (Shift Only) | **1.0×** |
| **Abanach** | Shift | Standard Shift Weekend / Weekday | **1.5× / 1.0×** |

### 4.2 Overtime Hours & Financial Computations
1. **Gross Hours:**
   $$\text{Gross Hours} = \text{Time Out} - \text{Time In}$$
   *Note: Automatically accounts for overnight shifts spanning past midnight (e.g., 22:00 to 06:00 = 8.00 hours).*
2. **Net Overtime Hours:**
   $$\text{Net Hours} = \max(0, \text{Gross Hours} - \text{Break Hours})$$
3. **Estimated Financial Payout:**
   $$\text{Estimated Payout (GHS)} = \text{Net Hours} \times \text{Hourly Rate} \times \text{Rate Multiplier}$$

---

## 5. Database Schema & Data Model

The database runs on Supabase PostgreSQL with Row Level Security enabled across all tables.

### 5.1 Tables Summary

#### `departments`
Stores departmental organization units.
- `id` (UUID, Primary Key)
- `name` (TEXT, Unique)
- `created_at` (TIMESTAMPTZ)

#### `profiles`
Stores app users (admins, reps, supervisors) and non-login employee roster entries.
- `id` (UUID, Primary Key; maps to `auth.users.id` for login accounts, or standalone UUID for roster-only employees)
- `full_name` (TEXT, Not Null)
- `email` (TEXT, Unique)
- `password` (TEXT, Optional stored hash/reference)
- `role` (TEXT: `'admin' | 'rep' | 'supervisor' | 'employee'`)
- `department_id` (UUID, References `departments.id` ON DELETE SET NULL)
- `staff_id` (TEXT, Employee badge/payroll ID)
- `position` (TEXT, Job title)
- `category` (TEXT: `'Shift' | 'Straight Day'`)
- `company` (TEXT: `'CBI' | 'Abanach'`, Default: `'CBI'`)
- `hourly_rate` (NUMERIC, Default: `0`)
- `is_active` (BOOLEAN, Default: `TRUE`)
- `created_at` (TIMESTAMPTZ, Default: `NOW()`)

#### `overtime_records`
Primary transactional record of overtime captured.
- `id` (UUID, Primary Key, Default: `gen_random_uuid()`)
- `employee_name` (TEXT, Not Null)
- `employee_id` (TEXT, Not Null)
- `department_id` (UUID, Not Null, References `departments.id` ON DELETE CASCADE)
- `shift_type` (TEXT: `'Straight Day' | 'Shift'`, Not Null)
- `reason` (TEXT: `'Holiday' | 'PM' | 'Replacement' | 'Normal Routine Schedule' | 'Others'`, Not Null)
- `description` (TEXT, Optional detailed work remarks)
- `work_date` (DATE, Not Null)
- `time_in` (TIME, Not Null)
- `time_out` (TIME, Not Null)
- `full_work` (BOOLEAN, Default: `FALSE`)
- `break_hours` (NUMERIC(5,2), Default: `0`)
- `overtime_hours` (NUMERIC(5,2), Net overtime hours after breaks)
- `hourly_rate` (NUMERIC, Default: `0`)
- `rate_multiplier` (NUMERIC, Default: `1.5`)
- `estimated_payout` (NUMERIC, Calculated: `overtime_hours * hourly_rate * rate_multiplier`)
- `status` (TEXT: `'Pending' | 'Approved' | 'Declined'`, Default: `'Pending'`)
- `review_deadline` (TIMESTAMPTZ, Default: `NOW() + INTERVAL '5 days'`)
- `captured_by` (UUID, References `profiles.id` ON DELETE SET NULL)
- `captured_at` (TIMESTAMPTZ, Default: `NOW()`)
- `reviewed_by` (UUID, References `profiles.id` ON DELETE SET NULL)
- `reviewed_at` (TIMESTAMPTZ)
- `comments` (TEXT, Review notes/reasons)
- `updated_at` (TIMESTAMPTZ, Auto-updated by trigger)

#### `admin_entry_blocks`
Enables administrators to lock overtime submissions across dates/departments (e.g., during payroll closure).
- `id` (UUID, Primary Key)
- `start_at` (TIMESTAMPTZ)
- `end_at` (TIMESTAMPTZ)
- `reason` (TEXT)
- `company` (TEXT)
- `department_id` (UUID, References `departments.id`)
- `created_by` (UUID)

#### `holidays`
Public holiday registry consulted automatically by the overtime multiplier helper.
- `id` (UUID, Primary Key)
- `holiday_date` (DATE, Unique)
- `name` (TEXT)

#### `extra_hours`
Monthly administrative hour allocations for shift staff.
- `id` (UUID, Primary Key)
- `profile_id` (UUID, References `profiles.id`)
- `employee_name`, `staff_id`, `department_id`
- `entry_month` (1–12), `entry_year` (YYYY)
- `hours_assigned` (NUMERIC)
- `hourly_rate` (NUMERIC)
- `total_cost` (NUMERIC, Generated: `hours_assigned * hourly_rate`)
- `status` (`'Approved' | 'Pending'`)

#### `audit_logs`
Chronological event ledger for security and compliance.
- `id` (UUID, Primary Key)
- `action` (TEXT)
- `performed_by` (TEXT)
- `details` (JSONB)
- `performed_at` (TIMESTAMPTZ)

#### `admin_actions`
Task management, message logging, and deadline reminder registry for administrators.
- `id` (UUID, Primary Key)
- `title` (TEXT)
- `task_description` (TEXT)
- `action_message` (TEXT)
- `due_date` (DATE), `due_time` (TIME)
- `assigned_to` (UUID, References `profiles.id`), `assigned_name` (TEXT), `assigned_email` (TEXT)
- `priority` (`'Low' | 'Medium' | 'High' | 'Urgent'`)
- `status` (`'Pending' | 'In Progress' | 'Completed' | 'Cancelled'`)
- `created_by` (UUID), `created_by_name` (TEXT)
- `completed_at` (TIMESTAMPTZ)
- `is_notified` (BOOLEAN)

---

## 6. Core Functional Modules & Pages

### 6.1 Authentication (`/login`)
- Clean email/password sign-in with active-status verification.
- Inactive users are automatically blocked and signed out.
- Automatic redirect to `/dashboard` upon verification.

### 6.2 Executive Dashboard (`/dashboard`)
- **Key Metrics:** Total Overtime Hours, Total Estimated Payout (GHS), Active Workers Count, Pending Approvals, Average Hours per Worker, Top Overtime Earner.
- **Date Filters:** Current Month, Last Month, Last Quarter, Year-to-Date, All Time, Custom Date Range.
- **Charts:**
  - Overtime Hours Trend (toggleable by Day / Month / Year Area Chart).
  - Departmental Hours & Cost Breakdown (Bar Charts).
  - Overtime Reason Breakdown & Financial Distribution (Donut / Pie Charts).
- **Admin Entry Block Controls:** Live display and creation of active lockout periods.

### 6.3 Overtime Records Directory (`/records`)
- Comprehensive list of overtime submissions with real-time status badges.
- Multi-field filters: Search (name/ID), Department, Status (`Pending`, `Approved`, `Declined`), Reason, Date Range.
- **Review Workflow:** Single record review modal or bulk selection review (Approved / Declined with mandatory/optional audit comments).
- **Timeout Warnings:** Visual indicator for pending records past the 5-day review deadline.
- **Excel Export:** Generates standardized `.xlsx` reports matching active filters.

### 6.4 Capture Overtime (`/records/new`)
- Designed for department reps and administrators.
- **Multi-Select Employees:** Batch create records for multiple colleagues working the same shift.
- **Live Preview:** Immediate feedback on calculated gross hours, break deductions, applicable multiplier, and estimated payout.
- **Quick-Add Employee Modal:** Add a missing staff member on the fly without leaving the capture screen.

### 6.5 Employee Roster & Bulk Upload (`/employees/new`)
- Single employee creation form with validation.
- **Excel Batch Import:** Upload `.xlsx` or `.csv` with automated schema validation, missing field detection, duplicate staff ID checks, and batch insertion into Supabase.

### 6.6 User Management (`/users`, `/users/new`)
- Dedicated administration panel to view app users, roles, and status.
- Admin creation of login credentials using a secondary non-persisting client to prevent admin session disconnection.

### 6.7 Department Management (`/departments`, `/departments/:id`)
- Department catalog and detailed roster view with aggregated statistics.

### 6.8 Holidays Management (`/holidays`)
- Registry of national holidays to ensure accurate holiday overtime rates.

### 6.9 Extra Hours Allocation (`/extra-hours`)
- Dedicated administrative interface for monthly extra hours allocation for shift personnel.
- Includes historical audit modal.

### 6.10 Admin Action Center & Reminders (`/admin-actions`)
- **Action & Task Logging:** Admins can record messages, specific task checklists/duties, assignees, and target due dates and times.
- **Due Date Notifications:** Automated deadline monitoring that flags tasks as *Due Today* or *Overdue*, triggering in-app toast alerts, visual pulsing badges, and native browser push notifications when due.
- **Top Navigation Notification Bell:** Real-time bell dropdown in the application header showing active alerts with direct quick links and completion shortcuts.
- **Flexible Sync:** Supports Supabase cloud synchronization with seamless local storage fallback.

---

## 7. Audit Trail & Governance

### 7.1 Security Policies (RLS)
Every Supabase query is protected by server-side RLS policies:
- Authenticated users can view records within allowed departmental boundaries.
- Reps can only mutate `Pending` records within their own department.
- Supervisors can only review pending records within their own department before the review deadline expires.
- Administrators possess universal read, write, update, and delete privileges.

### 7.2 Audit Trail (`/audit`)
- Intercepts and records critical actions:
  - User Logins & Logouts
  - Overtime Submission, Edit, and Deletion
  - Record Approvals and Declines
  - Batch Operations and Configuration Changes
- Downloadable to Excel format for compliance and financial reviews.

---

## 8. Setup, Configuration & Local Development

### 8.1 Prerequisites
- **Node.js:** `>= 20.19.0`
- **Package Manager:** `npm` (or `pnpm` / `yarn`)
- **Supabase Account:** Active project with database access

### 8.2 Installation Steps

1. **Clone the repository and install dependencies:**
   ```bash
   git clone <repo-url>
   cd "2. CBI_Overtime App"
   npm install
   ```

2. **Configure Environment Variables:**
   Create a `.env` file in the root directory based on `.env.example`:
   ```env
   VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

3. **Database Initialization:**
   Execute the migration SQL scripts in the `supabase/migrations/` directory within the Supabase SQL Editor in numerical order:
   - `20240101000000_schema.sql`
   - `20240101000100_policies.sql`
   - `20241001000000_add_financial_fields.sql`
   - `20260601000000_add_audit_logs.sql`
   - `20260715000000_add_entry_blocks_and_company.sql`
   - `20260716000000_add_review_deadline.sql`
   - `20260724000001_review_deadline_5_days.sql`
   - `20260817000000_create_holidays.sql`
   - `20261002000000_create_extra_hours.sql`

4. **Seed Database (Optional):**
   ```bash
   node seed_db.js
   node seed_users.js
   ```

5. **Start Development Server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

## 9. Deployment Guide

### 9.1 Build Verification
Verify clean compilation before deploying:
```bash
npm run build
```
The output bundle will be located in the `dist/` directory.

### 9.2 Netlify Deployment
The repository includes `netlify.toml` configured for SPA routing:
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```
- Link the repository to Netlify.
- Set build command to `npm run build` and publish directory to `dist`.
- Define `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify Environment Variables.

### 9.3 Vercel Deployment
The repository includes `vercel.json`:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```
- Import project into Vercel and set the corresponding environment variables.

---

## 10. Troubleshooting & Maintenance

### Common Scenarios:
1. **Admin Cannot Add New Users Without Logging Out:**
   - The app uses an isolated `adminAuthClient` (with `persistSession: false`) in `NewUserPage.jsx` so creating a new user will never overwrite the admin's active session.
2. **Rate Multiplier Not Updating on Holiday:**
   - Verify that the holiday is registered in the `/holidays` table with matching date format `YYYY-MM-DD`.
3. **Supervisor Cannot Review Record:**
   - Confirm record status is `Pending`.
   - Confirm record's `department_id` matches the supervisor's `department_id`.
   - Check if the 5-day deadline has passed. If expired, only an Admin can perform the review or override.
4. **Time Calculation with Overnight Shift:**
   - Automated via SQL generated column: if `time_out < time_in`, an interval of 24 hours is added to compute the correct duration.
