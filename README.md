# CBI Overtime Management Portal

An enterprise attendance, overtime capture, and approval management web application designed for **CBI Ghana** and **Abanach Group**. Built with **React 19**, **Vite 8**, **Tailwind CSS**, and **Supabase (PostgreSQL)**.

---

## 🌟 Key Features

- ⏱️ **Intelligent Overtime Calculation:** Automated shift calculation supporting overnight shifts (e.g. 22:00 to 06:00), break deductions, and dynamic rate multipliers.
- 🏢 **Dual-Company Rate Multipliers:** Configurable rule engine for **CBI** and **Abanach** across weekday, weekend, shift type, and public holiday rates.
- 👥 **Role-Based Access Control (RBAC):** Distinct permissions and departmental scopes for **Admins**, **Supervisors**, and **Department Representatives (`rep`)**.
- 📊 **Executive Analytics Dashboard:** Real-time visibility into total hours, estimated payroll impact (in GHS), top earners, departmental distributions, and reason breakdowns with interactive Recharts.
- 📥 **Batch Roster Upload:** Single or bulk Excel (`.xlsx` / `.csv`) employee onboarding with automatic column mapping, validation, and duplicate detection.
- ⏳ **5-Day Review Deadline Enforcement:** Structured approval window with visual timeout alerts and admin override support.
- 🔒 **Admin Entry Blocks:** Freeze overtime submissions during payroll closing or audit windows.
- 📅 **Holidays & Extra Hours:** Public holiday calendar and monthly shift-worker extra hours allocation with historical audit trails.
- 🛡️ **Comprehensive Audit Trail:** Logs all logins, logouts, submissions, and approvals with Excel export capabilities.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** `>= 20.19.0`
- **npm** or your preferred package manager

### 2. Installation
```bash
# Clone the repository
git clone <repository-url>
cd "2. CBI_Overtime App"

# Install dependencies
npm install
```

### 3. Environment Setup
Create a `.env` file in the project root:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run Development Server
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 🛠️ Tech Stack

| Technology | Purpose |
| :--- | :--- |
| **React 19** | Modern UI framework |
| **Vite 8** | High-performance build tool & dev server |
| **Tailwind CSS** | Custom styling with CBI brand identity |
| **Supabase** | Managed PostgreSQL, Auth, and Row-Level Security (RLS) |
| **React Router v7** | Declarative client-side routing & route guards |
| **Recharts** | Interactive charts and analytics |
| **SheetJS (xlsx)** | Excel report generation & bulk employee import |
| **date-fns** | High-precision date formatting & period calculations |

---

## 📖 Complete Documentation

For the full architectural breakdown, database schema, rate multiplier matrix, security policies, and deployment instructions, refer to:

👉 **[DOCUMENTATION.md](./DOCUMENTATION.md)**

---

## 🔐 User Roles Summary

- **Admin:** Universal system control, user & department management, holiday scheduling, extra hours, audit logs, and global approval overrides.
- **Supervisor:** Departmental review and approval/decline of pending overtime submissions within the 5-day window.
- **Department Rep:** Capture single or multi-employee overtime entries for colleagues in their department; edit/delete pending entries before review.

---

## 📄 License
Proprietary — Internal use for CBI Ghana & Abanach Group.
