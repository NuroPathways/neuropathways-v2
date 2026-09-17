# NeuroPathways Parent-First Web App — Functional Spec v1

**Date:** 2026-09-17
**Author:** ForwardAI (Sanju Goswami advisory)
**Approved by:** Ramez Shakhashiro (verbal, via dashboard review)

## Mission

Transform the web app from an empty scaffold into a parent-first experience
that matches and improves on the existing mobile app. Security fixes are
the prerequisite; parent UX is the deliverable.

## Current State

| Layer | State | Notes |
|-------|-------|-------|
| DB schema | Built (17 tables) | families, children, behavior_plans, documents, behavior_logs, win_logs, messages, ai_conversations, daily_check_ins, engagement_events, etc. |
| API server | Built (1289 lines entities.ts) | Express, Drizzle ORM, Anthropic AI integration, multer uploads. Security gaps identified. |
| Web app | Empty scaffold | "Replit Agent is building..." placeholder. Vite + React + shadcn/UI + Tailwind v4 + wouter + TanStack Query installed. |
| Mobile app | Built (Expo) | 5 tabs: Home, Log, AI, Messages, More. Plus: Documents, Goals, Help, Login, Progress screens. |

## Deliverable 1: Security PR (Phase 1)

Branch: `security/phase-1`

Five commits, one per fix:
1. **Upload auth** — add requireAuth to POST /upload, add file type validation (PDF/PNG/JPG/DOCX)
2. **Entity route auth** — add requireAuth to behavior-logs, win-logs, engagement-events, manage-client-goal; validate client session on client-portal-data
3. **CORS lockdown** — change `origin: true` to `process.env.CORS_ORIGIN || 'https://nuropath-ai.replit.app'`
4. **Rate limiting** — install express-rate-limit; global 100/15min, auth routes 5/15min
5. **Security headers** — install helmet; add `app.use(helmet())` before CORS

All changes are additive middleware. No feature changes. Fully revertible.

## Deliverable 2: Parent-First Web Experience

Branch: `feature/parent-web`

### Screens (mirroring mobile, optimized for web)

| Screen | Route | What it does |
|--------|-------|-------------|
| Login | `/` | Access code login (matches mobile client-session flow) |
| Home | `/home` | Dashboard: greeting, quick actions, recent logs, unread messages, active goals summary |
| Log | `/log` | Behavior logging: select behavior type, intensity (low/moderate/high), optional notes. One-tap submit. |
| AI Chat | `/ai` | Chat with Claude about behavior plans, triggers, coping strategies. Suggested prompts. |
| Messages | `/messages` | View messages from clinician. Read-only for now. |
| Progress | `/progress` | Goals and progress over time. Visual charts. |
| Documents | `/documents` | View behavior plans and documents. AI-simplified summaries. |

### Design Principles

1. **Two-second check-in.** The behavior log must be completable in under 5 seconds: one tap for behavior, one for intensity, optional note, submit.
2. **Plain language.** No clinical jargon visible to parents. AI summaries translate BCBA language.
3. **Mobile-first responsive.** Parents use this on phones at 9 PM. Every screen works at 375px.
4. **Calm, not clinical.** Warm palette, rounded corners, clear typography. This is a parenting tool, not a medical chart.
5. **Offline-aware.** Show cached data when offline; queue logs for sync.

### Tech Stack (already installed)

- wouter (routing)
- TanStack Query (data fetching, caching)
- shadcn/UI + Radix (components)
- Tailwind CSS v4 (styling)
- Vite (bundling)

### API Integration

Reuse the same endpoints the mobile app uses:
- `POST /client-session/login` — parent login
- `POST /behavior-logs` — log a behavior (will require auth after security PR)
- `POST /win-logs` — log a win
- `GET /client-portal-data` — parent dashboard data
- `POST /ai` — AI chat
- Entity CRUD for behavior plans, documents, goals, messages

## Deliverable 3: Technical Spec (saved for continuity)

This file. Plus corpus entries for competitive research.

## Out of Scope (for this sprint)

- Clinician dashboard (web) — separate future sprint
- Mobile app changes — mobile already works
- HIPAA compliance (Phase 3) — needs hosting migration
- Push notifications — requires service worker setup
- Community features — Phase 2

## Recovery Plan

All changes on branches, submitted as PRs. Ramez merges only what he approves.
If anything breaks: revert the PR. Zero-risk path.
