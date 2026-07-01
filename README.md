# iProfit CRM

Production-ready CRM (lead & sales management) — NestJS + Prisma + MySQL backend, React + Vite frontend.

## Prerequisites
- Node 18+ and npm
- Docker (for local MySQL) or a MySQL 8 instance

## Quick start

### 1. Database
```bash
docker compose up -d        # starts MySQL on :3306
```

### 2. Backend
```bash
cd backend
cp .env.example .env        # adjust DATABASE_URL / JWT_SECRET if needed
npm install
npx prisma migrate dev --name init
npm run prisma:seed         # creates admin@iprofit.com / Password123
npm run start:dev           # API on http://localhost:4000/api
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev                 # app on http://localhost:5173 (proxies /api -> :4000)
```

Log in with **admin@iprofit.com / Password123**.

## What's included
- JWT auth with 5-attempt/15-min lockout, register (first user = Admin)
- Role-based access control (Admin / Sales Manager / Sales Rep) via guards
- Leads CRUD with rep-scoped visibility, email dedupe, round-robin auto-assignment
- Automation cron: follow-up reminders + 7-day lead-inactivity alerts
- React UI: login, dashboard, leads list, lead detail, create-lead form
- Prisma schema for all modules (Users, Accounts, Leads, Activities, Tasks, Opportunities, Pipelines, Notifications)

## Extending
Tasks, Opportunities, Activities, Accounts, and Notifications modules follow the
exact pattern of `src/leads/` (dto → service → controller → module). See the
handoff spec document for endpoints, the 30-day plan, and module breakdowns.
