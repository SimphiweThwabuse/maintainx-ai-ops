# MaintainX

**AI-Powered Maintenance Operations Platform**

Live application: https://maintainx-ai-ops.lovable.app

---

## Project Overview

MaintainX is a web-based maintenance operations platform built for hotels and the maintenance
companies that service them.

In a typical hotel, a guest who finds a broken tap or a failing air conditioner has to call or
visit reception, a staff member writes the issue down, and the request is passed on by phone or
paper. Problems get lost, priorities are guessed, nobody knows who is working on what, and there
is no record of how long anything took.

MaintainX replaces that process with a single tracked workflow:

- Guests report issues in seconds by scanning a QR code — no app, no account, no login.
- Every report becomes a numbered ticket in a central database.
- AI reads the description and assigns a maintenance category and a suggested priority.
- AI matches the ticket to a suitable, available technician.
- Reception and management see live dashboards; technicians see only their own jobs.
- Service-level deadlines are tracked and breached tickets are escalated automatically.

The result is faster response times, clear accountability, and a full history of every
maintenance issue in the property.

---

## Key Features

| Feature | Description |
| --- | --- |
| Guest QR maintenance reporting | A printable QR poster links to a mobile-first reporting page. Guests choose a hotel and room/location, describe the problem, and submit — no account required. |
| Text, photo and voice reporting | Reports accept typed text, an optional photo upload, and optional voice input via the browser speech API, with text always available as a fallback. |
| AI ticket classification | Each new ticket is classified into one of five categories and given a suggested priority with a written reason and confidence score. |
| AI immediate guidance | After submitting, a guest receives short, safety-first guidance about what to do next. |
| AI technician assignment | Tickets are matched to technicians by service skill, with in-house technicians preferred and technicians already on an active job excluded. |
| Manual assignment | Receptionists and managers can assign or reassign a technician themselves. |
| Role-based access | Guests, Receptionists, Technicians, Hotel Managers and Administrators each see a different navigation and data set. |
| Technician "My Jobs" | Technicians see only their assigned tickets, with an unread-job badge, status updates, ETA entry and hand-back. |
| Ticket status workflow | Six statuses from New Ticket through to Resolved, with a full status history per ticket. |
| SLA tracking and escalation | Assignment and resolution deadlines per priority; breaches flag the ticket as escalated and notify staff. |
| In-app notifications | A real-time notification bell for reception and management, and a job badge for technicians. |
| Guest ticket tracking | Guests can look up one ticket at a time using its exact ticket number. |
| AI System Assistant chatbot | A read-only assistant that explains the system and answers role-appropriate questions. |
| Reports and analytics | Charts covering tickets by status (including escalated), priority, category and volume over time. |
| User and account management | Self-service signup with roles, hotel/company selection, technician skills and availability, password reset, and light/dark theming. |
| Clients, Technicians, Assets, Schedule | Directory and scheduling views for organisations, technician records and hotel assets. |

---

## User Roles

### Guest (no account)

- Scans a QR code or opens the public reporting page.
- Submits a maintenance report with description, optional photo, optional voice input and an
  optional email address for updates.
- Receives a ticket number and AI safety guidance.
- May track **one** ticket at a time by entering its exact ticket number.
- Cannot list, search or view any other ticket, and cannot see staff or reporter details.

### Receptionist

- Reports issues on behalf of guests who cannot use the QR code.
- Views all tickets for their own hotel.
- Assigns or reassigns technicians manually, or accepts the AI suggestion.
- Updates ticket status and monitors unassigned and escalated tickets.
- Receives in-app notifications for new, unassigned, critical and escalated tickets.

### Technician

- Sees only the tickets assigned to them, in **My Jobs**.
- Updates status (Assigned → In Progress → Resolved, or Pending/Scheduled).
- External technicians can record an ETA, which suspends escalation for that window.
- Can hand a job back to New if they cannot resolve it, which escalates the ticket.
- Holds one or more service skills and an availability flag used by AI assignment.

### Hotel Manager

- Full oversight of their hotel: dashboard, all tickets, technicians, clients, assets, schedule.
- Views reports and analytics.
- Manages technician records scoped to their own hotel or maintenance company.
- Receives escalation and critical-ticket notifications.

An **Administrator** role also exists with platform-wide access.

---

## System Workflow

```text
Guest scans QR code
        ↓
Reporting page (hotel + room/location + description + optional photo/voice/email)
        ↓
Ticket created  →  ticket number MX-YYYY-NNNNN, status "New Ticket"
        ↓
AI classification  →  category + suggested priority + reason
        ↓
AI immediate guidance shown to the guest
        ↓
AI technician assignment  →  status "Assigned", technician notified
        ↓                              (or left unassigned → reception notified)
Technician starts work    →  status "In Progress"
        ↓
Status updates: Pending / Scheduled / hand-back to New
        ↓
SLA deadlines monitored  →  breach or expired ETA → ticket flagged "Escalated"
        ↓                    reception + manager notified
Resolved  →  resolution timestamp and full activity history retained
```

If the AI service is unavailable at any point, the ticket is still created and stored, and is
flagged for manual classification. AI never blocks a guest report.

---

## AI Functionality

All AI calls run **server-side only**, through the Lovable AI Gateway
(`https://ai.gateway.lovable.dev/v1/chat/completions`) using the `google/gemini-3.5-flash` model.
The AI layer is isolated in `src/lib/ai/` so capabilities can be added without touching routes
or UI.

| Capability | Where | What it does |
| --- | --- | --- |
| Ticket classification | `src/lib/ai/service.server.ts` | Classifies the description into exactly one of five approved categories — Plumbing, Electrical, HVAC / Air Conditioning, Emergency Maintenance, General Maintenance (the fallback for anything else) — and suggests Critical, Medium or Low priority with a reason and confidence value. |
| Immediate guest guidance | `src/lib/ai/service.server.ts` | Returns short, calm, zero-risk advice to the guest after submission. It never instructs a guest to repair anything. |
| Suggested ticket response | `src/lib/ai/service.server.ts` | Generates a draft response for staff on a ticket. |
| Technician assignment | `src/lib/assignment.server.ts`, `src/lib/assignment-eligibility.server.ts` | Matches ticket category to technician service skills, prefers in-house technicians, and excludes technicians with an active In Progress job. |
| System Assistant chatbot | `src/lib/ai/assistant.server.ts`, `src/lib/assistant.functions.ts`, `src/components/app/assistant-chat.tsx` | A read-only assistant with a separate rule set per audience (guest, receptionist, hotel manager, technician, admin). It can only discuss data supplied in a server-built context block and cannot perform any action. |

AI results are recommendations. Classification, priority and assignment can all be overridden by
staff, and every AI outcome is stored on the ticket (`ai_category_slug`, `ai_priority`,
`ai_reason`, `ai_confidence`, `ai_model`, `ai_status`, `needs_manual_classification`).

---

## Technology Stack

| Layer | Technology |
| --- | --- |
| Language | TypeScript |
| UI | React 19 |
| Framework | TanStack Start (v1) with TanStack Router, file-based routing and server functions |
| Build tool | Vite |
| Data fetching | TanStack Query |
| Styling | Tailwind CSS v4, shadcn/ui components on Radix UI primitives, `lucide-react` icons |
| Charts | Recharts |
| Forms & validation | React Hook Form, Zod |
| Notifications (UI) | Sonner toasts |
| QR generation | `qrcode` |
| Backend platform | Supabase (Lovable Cloud) |
| Database | PostgreSQL with Row Level Security |
| Authentication | Supabase Auth (email/password) |
| File storage | Supabase Storage (ticket photos) |
| Realtime | Supabase Realtime (notifications) |
| AI | Lovable AI Gateway — `google/gemini-3.5-flash` |
| Email | `@lovable.dev/email-js` |
| Hosting | Lovable (edge/Worker runtime) |

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│  Browser (React 19 + TanStack Router)                        │
│  Public routes: /, /report, /report/$code, /qr-poster, /auth │
│  Protected routes: /_authenticated/* (dashboard, tickets,    │
│  technicians, clients, assets, ai, schedule, reports,        │
│  settings)                                                   │
└───────────────┬──────────────────────────────────────────────┘
                │ typed RPC (TanStack server functions)
┌───────────────▼──────────────────────────────────────────────┐
│  Server runtime (edge Worker)                                │
│  *.functions.ts  – validated entry points, auth middleware   │
│  *.server.ts     – business logic: AI, assignment, SLA,      │
│                    escalation, notifications, email          │
└───────┬───────────────────────────────┬──────────────────────┘
        │ Supabase JS (RLS as the user) │ HTTPS
┌───────▼───────────────────┐   ┌───────▼──────────────────────┐
│  Supabase                 │   │  Lovable AI Gateway          │
│  PostgreSQL + RLS         │   │  google/gemini-3.5-flash     │
│  Auth · Storage · Realtime│   └──────────────────────────────┘
└───────────────────────────┘
```

**Frontend.** File-based routes under `src/routes`. The `_authenticated` layout route guards every
staff page. Server data is fetched through TanStack Query with server functions as the transport.

**Backend.** There is no separate API server. Application logic runs as TanStack server functions
(`createServerFn`) in the same deployment. Files named `*.server.ts` are server-only and never reach
the browser bundle; components import the thin `*.functions.ts` wrappers instead.

**Authentication boundary.** Protected server functions use a Supabase auth middleware; a
client-side middleware (`src/lib/auth-bearer.ts`) waits for and refreshes the Supabase session and
attaches the bearer token to each call, redirecting to `/auth` when no valid session exists.

**Guest boundary.** Public reporting uses a narrow server module (`src/lib/public.server.ts`) that
exposes only the data a guest needs: active hotels, locations, ticket creation and single
ticket-number lookup.

**AI integration.** All model calls are made server-side with the gateway key held in the server
environment. Failures degrade gracefully — the ticket is always saved.

---

## Database

PostgreSQL on Supabase. Main tables in the `public` schema:

| Table | Purpose |
| --- | --- |
| `profiles` | User profile per authenticated account: name, email, phone, avatar, and links to a hotel or maintenance company. |
| `user_roles` | Role assignments, stored separately from profiles to prevent privilege escalation. |
| `hotels` | Hotel / organisation records (name, type, address, contact details, active flag). |
| `hotel_locations` | Rooms and locations within a hotel, each with a QR code value. |
| `maintenance_companies` | External maintenance companies that supply technicians. |
| `technicians` | Technician records: name, in-house or external type, hotel/company link, specialty, active and availability flags. |
| `technician_services` | Join table mapping technicians to the services/skills they can perform. |
| `maintenance_services` | Catalogue of service skills. |
| `maintenance_categories` | The five ticket categories, with a default service mapping used by assignment. |
| `tickets` | Core entity: ticket number, hotel, location, reporter details, description, media, AI classification fields, category, priority, status, assignment, SLA deadlines, ETA and escalation fields, timestamps. |
| `ticket_assignments` | Assignment history — which technician/company, by whom, and when assigned or unassigned. |
| `ticket_status_history` | Every status transition with the previous status, new status and who changed it. |
| `ticket_activity` | Human-readable activity feed per ticket (events, messages, metadata). |
| `assets` | Hotel assets linked to a location and category. |
| `sla_targets` | Assignment and resolution minutes per priority. |
| `app_notifications` | In-app notifications: recipient, ticket, kind, title, message, severity, dedupe key and read timestamp. |

Security-definer helper functions live in a private schema and are used by RLS policies to resolve
the current user's role, hotel and company without recursive policy evaluation.

---

## Authentication & Authorization

**Authentication.** Supabase Auth with email and password. Signup collects full name, email,
password with confirmation, a role, and — depending on role — a hotel (Hotel Manager,
Receptionist) or a maintenance company (Technician, who also selects service skills). Password
fields have show/hide toggles. A forgot-password flow sends a recovery link that lands on
`/reset-password`. Passwords are handled entirely by Supabase Auth; the application never stores
or sees them.

**Authorization.** Roles live in `user_roles` and are read server-side. Three layers enforce access:

1. **Route guard** — `src/routes/_authenticated/route.tsx` redirects unauthenticated visitors to
   `/auth`; navigation items are filtered by role.
2. **Server functions** — protected functions run behind a Supabase auth middleware and act as the
   calling user, so the database enforces the user's own permissions.
3. **Row Level Security** — every table has RLS enabled with role- and organisation-scoped
   policies. Managers are scoped to their own hotel or company, technicians to their own jobs,
   and guests to nothing beyond the narrow public reporting surface.

Guests are never authenticated. Public actions run through a dedicated server module with a
deliberately minimal surface.

---

## Ticket Lifecycle

**Statuses** (no others exist in the system):

| Status | Meaning |
| --- | --- |
| New Ticket | Created and not yet assigned. |
| Assigned | A technician has been allocated (by AI or manually). |
| In Progress | The technician has started work. |
| Pending | Work is blocked or awaiting something. |
| Scheduled | Work is planned for a later time. |
| Resolved | The issue is fixed; resolution timestamp recorded. |

**Ticket numbers** follow the format `MX-YYYY-NNNNN` (for example `MX-2026-00052`).

**SLA targets** (stored in `sla_targets`):

| Priority | Assign within | Resolve within |
| --- | --- | --- |
| Critical | 30 minutes | 4 hours |
| Medium | 2 hours | 12 hours |
| Low | 4 hours | 24 hours |

**Escalation.** Escalation is a flag, not a status — a ticket keeps its current status and gains
`is_escalated`, an escalation reason, timestamp and count. A ticket escalates when:

- the assignment or resolution deadline is breached;
- an external technician's recorded ETA expires without progress;
- a technician hands the ticket back to New because they cannot resolve it.

A valid ETA window suspends escalation. Escalated tickets display a badge and banner, are shown
in the Reports "Tickets by Status" chart, and notify the Receptionist and Hotel Manager.

---

## Notifications

In-app notifications are stored in `app_notifications`, delivered over Supabase Realtime, and
de-duplicated by a dedupe key. Reception and management use the notification bell in the header;
technicians see an unread-job badge next to **My Jobs**.

| Notification | Recipients |
| --- | --- |
| New job assigned (`new_job`) | The assigned technician |
| AI assignment made | Receptionist, Hotel Manager |
| Ticket unassigned / no eligible technician | Receptionist, Hotel Manager |
| Critical ticket created | Receptionist, Hotel Manager |
| Ticket escalated | Receptionist, Hotel Manager |
| Technician hand-back | Receptionist, Hotel Manager |

The technician badge counts only unread `new_job` notifications: it appears on assignment,
clears when the technician moves the ticket out of Assigned, hides at zero, and reappears for the
next assignment. Guests receive updates by email only if they supplied an email address.

---

## Security

- **Authentication** is delegated to Supabase Auth. Passwords are never stored, logged or handled
  by application code.
- **Roles are stored in a dedicated `user_roles` table**, never on the profile record, to prevent
  privilege escalation.
- **Row Level Security is enabled on every public table**, with explicit grants and
  role/organisation-scoped policies. Manager write access to technician records is scoped to the
  manager's own hotel or company.
- **Security-definer helper functions** live in a private schema with restricted execution rights,
  so policies can resolve role and organisation without recursion or exposure.
- **Server-only modules** (`*.server.ts`) are excluded from the browser bundle. AI gateway keys and
  server credentials are read from the server environment inside handlers and never shipped to the
  client.
- **Guest surface is minimal**: anonymous users can create a ticket and look up exactly one ticket
  by its full ticket number. Listing, searching and browsing are not possible, and anonymous
  projections exclude private contact data.
- **The AI assistant is read-only.** It cannot assign, edit or change anything, is given a
  server-built context block scoped to the caller's permissions, and is instructed never to reveal
  credentials or personal details.
- **CSRF protection** is applied to server functions, and input is validated with Zod before it
  reaches business logic.
- Only the public Supabase URL and publishable key are present in client configuration; no secret
  keys exist in the repository.

---

## Installation & Local Development

**Prerequisites:** Node.js 20+ and npm (or Bun).

```sh
# 1. Clone the repository
git clone <this-repository-url>
cd <repository-name>

# 2. Install dependencies
npm install

# 3. Configure environment variables (see the next section)
#    Create a .env file in the project root.

# 4. Run the application locally
npm run dev
```

The app starts on `http://localhost:8080`.

Other scripts:

```sh
npm run build       # production build
npm run build:dev   # development-mode build
npm run preview     # preview a production build
npm run lint        # ESLint
npm run format      # Prettier
```

---

## Environment Variables

Create a `.env` file in the project root. **Never commit secret values.**

| Variable | Scope | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Client | The Supabase project URL the app connects to. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client | The Supabase publishable (anon) key. Safe for the browser; access is governed by RLS. |
| `VITE_SUPABASE_PROJECT_ID` | Client | The Supabase project identifier. |
| `LOVABLE_API_KEY` | Server only | Authenticates server-side calls to the Lovable AI Gateway for classification, guidance, responses and the chatbot. Must never appear in client code. |

`.env.production` holds only the three public `VITE_` values. Server secrets are injected by the
hosting environment and are not stored in the repository.

---

## Deployment

The application is deployed through Lovable and served from an edge (Cloudflare Worker) runtime.

- Production URL: https://maintainx-ai-ops.lovable.app
- The build is produced by Vite (`npm run build`); the server entry and all server functions are
  bundled for the Worker runtime, so all dependencies must be bundleable — there is no runtime
  module resolution.
- Public `VITE_*` values are baked in at build time; server secrets such as `LOVABLE_API_KEY` are
  injected into the server runtime.
- A single Supabase project backs both the preview and published environments. Schema changes are
  applied as SQL migrations under `supabase/migrations/`.
- The repository is synced bidirectionally with GitHub; pushes to the default branch flow back
  into the Lovable editor.

---

## Project Structure

```text
src/
├── routes/                        # File-based routes (TanStack Router)
│   ├── __root.tsx                 # Root layout, theme, error handling
│   ├── index.tsx                  # Public home page
│   ├── auth.tsx                   # Login / signup
│   ├── forgot-password.tsx        # Password recovery request
│   ├── reset-password.tsx         # Password recovery completion
│   ├── report.index.tsx           # Public guest reporting page
│   ├── report.$code.tsx           # QR-scoped reporting page (hotel/location)
│   ├── qr-poster.tsx              # Printable QR poster generator
│   └── _authenticated/            # Guarded staff area
│       ├── route.tsx              # Auth guard
│       ├── dashboard.tsx          # Role-specific dashboards
│       ├── tickets.index.tsx      # Ticket list with search and filters
│       ├── tickets.$ticketId.tsx  # Ticket detail, AI panel, assignment, history
│       ├── technicians.tsx clients.tsx assets.tsx
│       ├── ai.tsx schedule.tsx reports.tsx settings.tsx
├── components/
│   ├── app/                       # App components (shell, badges, brand,
│   │                              # request form, notification bell, chatbot,
│   │                              # QR poster, theme toggle, password input)
│   └── ui/                        # shadcn/ui primitives
├── lib/
│   ├── ai/                        # AI service layer (classification, assistant)
│   ├── *.functions.ts             # Server function entry points (validated)
│   ├── *.server.ts                # Server-only logic: assignment, escalation,
│   │                              # notifications, email, public guest surface
│   ├── domain.ts                  # Statuses, priorities, categories, roles, labels
│   ├── sla.ts                     # SLA target calculations
│   └── auth-bearer.ts             # Client middleware attaching the auth token
├── hooks/                         # useAccount, useNotifications, use-mobile
├── integrations/supabase/         # Generated Supabase clients, types, middleware
├── styles.css                     # Tailwind v4 theme and design tokens
├── router.tsx  start.ts  server.ts
supabase/
├── migrations/                    # SQL schema migrations
└── config.toml
public/                            # Static assets
```

---

## Testing

Verification was performed manually and through automated browser checks rather than a unit-test
suite:

- **End-to-end flow testing** of the primary workflow: QR scan → guest report → ticket creation →
  AI classification → assignment → technician status updates → escalation → resolution.
- **Automated browser verification** with Playwright against the running application for
  navigation, the QR poster (desktop and mobile), reporting pages and authenticated routes.
- **Role testing** for Guest, Receptionist, Technician and Hotel Manager, confirming each role sees
  only its permitted navigation and data.
- **Security scanning** of the database, with findings on RLS policies, security-definer functions,
  storage access and manager write scoping reviewed and remediated.
- **Type checking and production builds** run after changes; the application must build cleanly.
- **Responsive testing** from 320px mobile widths up to desktop, including light and dark themes.
- **Failure-path testing**: tickets are still created when the AI service is unavailable, and text
  reporting still works when photo or voice input is not.

---

## Troubleshooting

| Issue | Cause and fix |
| --- | --- |
| Blank screen after a new deployment | An old cached bundle is still loaded. Hard-refresh the page; the app also includes automatic stale-chunk recovery. |
| "Missing Supabase environment variables" | `.env` is absent or incomplete. Ensure `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PROJECT_ID` are set, then restart the dev server. |
| "Unauthorized: no authorization header" | The Supabase session had not hydrated when a request fired. Sign in again; the auth middleware now waits for and refreshes the session. |
| Ticket created but not classified | The AI gateway was unreachable or out of credits. The ticket is saved and flagged for manual classification — set the category and priority by hand. |
| Voice input unavailable | The browser does not support the speech API. Type the description instead; text input always works. |
| Technician not offered for assignment | The technician is inactive, unavailable, lacks the matching service skill, or already has an In Progress job. |

---

## Future Improvements

The following are **not implemented** and are listed as potential future work:

- Predictive and preventive maintenance scheduling based on historical ticket data.
- AI image analysis of uploaded photos to assist classification.
- Server-side voice transcription of guest audio recordings.
- Multi-language guest reporting (the interface is structured for it, but only English is shipped).
- Approval workflows and cost/parts tracking per ticket.
- A native mobile application for technicians, with offline support.
- Expansion beyond hotels to apartments and general property management, which the generic
  organisation/location data model already anticipates.
- An automated unit and integration test suite in CI.

---

## Team

Byte 5 — project team for MaintainX Consulting Group. Individual member details are recorded in
the accompanying project report documentation rather than in this repository.

---

## Project Status

**Complete.** MaintainX is a finished project. All documented functionality is implemented and
deployed to the live application.

---

## License

No license file is present in this repository.
