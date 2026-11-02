# SmartCred – Smart Appointment Booking and Management System

SmartCred is a complete, full-stack multi-role appointment booking, QR verification, and practice management platform built with **ReactJS (Vite) + Tailwind CSS**, **Node.js + Express REST API**, **JWT + HttpOnly Refresh Cookie Authentication**, and a **persistent relational SQLite database (`smartcred.db`)** powered by `better-sqlite3`.

---

## 1. Technology Stack

### Frontend
- **React 19 + TypeScript + Vite**
- **Tailwind CSS v4** (Deep Navy Glassmorphism theme, responsive 1440px+ & mobile layouts)
- **React Router DOM v7** (Public pages + Role-protected dashboards)
- **Axios** (Automatic CSRF header injection & silent JWT refresh interceptor)
- **React Context API** (`AuthContext` session & RBAC state)
- **Lucide React Icons**
- **Recharts** (Live SQLite analytics charts for Professional & Admin portals)
- **html5-qrcode** (Live camera QR scanner + QR image file scanner)

### Backend & Database
- **Node.js + Express.js** (`server.ts` full-stack entrypoint)
- **SQLite (`smartcred.db`)** via `better-sqlite3` (WAL journal mode, foreign keys enforced, `IMMEDIATE` booking transactions)
- **JWT (`jsonwebtoken`)** + **bcrypt** password hashing + **Signed Double-Submit CSRF** protection
- **QRCode (`qrcode`)** + HMAC-SHA256 zero-PII token generation & SHA-256 database hashing
- **Nodemailer** (SMTP email), **Twilio** (SMS), & **WhatsApp Business Cloud API** (with transparent SQLite-logged Demo Simulation when API keys are unconfigured)
- **Multer** (Profile image uploads to `/uploads`)
- **Zod** (Strict request payload validation)

---

## 2. Persistent SQLite Database Schema (`smartcred.db`)

On startup, `server/db/database.ts` automatically initializes `smartcred.db` (if not already present) without wiping existing data across restarts. Schema includes:

1. `users` — Client, Professional, and Admin accounts with `bcrypt` password hashes
2. `professionals` — Specialist credentials, fees, ratings, and admin `approval_status` (`PENDING`, `APPROVED`, `REJECTED`)
3. `services` — Specialist consultation services, durations, and prices
4. `availability` — 7-day working schedules, hours, and daily break windows
5. `blocked_dates` — Full-day holiday/conference blocks
6. `blocked_slots` — Granular reserved slots and custom partial-day blocks
7. `appointments` — Transactional booking records, statuses, and `qr_token_hash` (SHA-256)
8. `notifications` — Multi-channel (`IN_APP`, `EMAIL`, `SMS`, `WHATSAPP`) logs and delivery statuses
9. `reviews` — Verified client ratings and testimonials linked to completed appointments
10. `activity_logs` — Platform-wide security and operational audit trail
11. `refresh_tokens` — Rotating HttpOnly session refresh token hashes
12. `password_reset_tokens` — Expiring single-use SHA-256 password reset tokens
13. `notification_preferences` — Per-user Email, SMS, WhatsApp, and Reminder toggles
14. `appointment_status_history` — Chronological audit log of every status transition
15. `service_categories` & `contact_messages` — Category taxonomy and Contact Us inquiries

---

## 3. Demo Accounts (Development Seed)

When `smartcred.db` is initialized for the first time and `ENABLE_DEMO_SEED="true"` (default in development), `server/db/seed.ts` creates bcrypt-hashed demo accounts:

| Role | Email | Password | Portal |
| :--- | :--- | :--- | :--- |
| **User (Client)** | `user@smartcred.demo` | `demo123` | `/dashboard/user` |
| **Professional** | `professional@smartcred.demo` | `demo123` | `/dashboard/professional` |
| **Admin** | `admin@smartcred.demo` | `demo123` | `/dashboard/admin` |

> **Disabling Demo Accounts Before Production:**  
> Set `ENABLE_DEMO_SEED="false"` in your `.env` environment before initializing a production `smartcred.db` instance. Existing demo accounts can also be suspended anytime from **Admin Dashboard -> Manage Users**.

---

## 4. Installation & Execution Instructions

### Prerequisites
- Node.js `v20+` (or `v22+` recommended)
- npm `v10+`

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env` and customize secrets (and optional SMTP / Twilio / WhatsApp credentials):
```bash
cp .env.example .env
```

### Step 3: Initialize & Seed SQLite Database (Optional Manual Run)
The backend automatically initializes `smartcred.db` on startup, or you can run the seed CLI explicitly:
```bash
npm run seed
```

### Step 4: Start Full-Stack Development Server (Frontend + Backend on Port 3000)
```bash
npm run dev
```
Open `http://localhost:3000` in your browser. Both the React Vite frontend and Express `/api/*` backend run together on port `3000`.

### Step 5: Production Build & Execution
```bash
npm run build
NODE_ENV=production npm start
```
Or preview using `tsx`:
```bash
npm run preview
```

---

## 5. End-to-End Testing Guide

1. **Client Booking & QR Pass Generation:**
   - Sign in at `/login` using `user@smartcred.demo` / `demo123` (or register a new account at `/register`).
   - Click **Book Appointment** (`/book`), select a specialist and service, pick a date and open SQLite time slot, and confirm.
   - Click **Download QR** (saves `<BOOKING_CODE>-smartcred-qr.png`) or **Copy Token**.
2. **Professional Schedule & QR Scanner Verification:**
   - Sign out and sign in as `professional@smartcred.demo` / `demo123`.
   - Open **Bookings & Clients** to **Accept** pending appointments or view client details.
   - Open **QR Scanner Check-In**, click **Scan QR Image File** (upload the downloaded PNG) or start the live camera scanner, inspect the verified SQLite booking details, and click **Authorize & Complete Check-In**.
   - Scan the same QR pass a second time to verify duplicate check-in protection.
   - Open **My Services** or **Availability & Breaks** to add services, edit working hours, or block dates—then verify updated slots on `/book`.
3. **Administrator Governance & CSV Reporting:**
   - Sign in as `admin@smartcred.demo` / `demo123`.
   - Open **Professionals & Approvals** to approve the seeded pending application (`Rohan Deshmukh, CFA`) and verify they immediately appear on `/explore`.
   - Open **Reports & CSV Export**, switch between **Daily**, **Weekly**, and **Monthly** SQLite aggregations, and click **Export CSV**.

---

## 6. Deployment Notes

- Mount a persistent volume for `SQLITE_DB_PATH` (e.g., `/data/smartcred.db`) and `/uploads` when deploying to Docker, Render, Railway, or a Linux VM so SQLite WAL files and uploaded avatars persist across container redeployments.
- Set strong random values for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CSRF_SECRET`, and `QR_HMAC_SECRET`, and set `ENABLE_DEMO_SEED="false"`.

---

## 7. Responsive Desktop & Mobile Web Experience

- **Adaptive Multi-Device Layout**: Full 1440px desktop command center with collapsible drawer and inline quick-switch navigation tabs on mobile and tablet browsers.
- **7-Step Guided Booking Wizard**: Category & specialist filtering, real-time SQLite slot computation, conflict prevention, and instant cryptographic QR pass issuance with PNG download, native Web Share, and print pass support.
- **Browser Camera & File QR Check-In**: Specialists verify client QR passes directly in the browser via `html5-qrcode` live camera streaming or PNG upload with duplicate check-in protection.


