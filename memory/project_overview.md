---
name: Bridgn Project Overview
description: Full architecture, component map, data structures, and feature details for the Bridgn platform
type: project
---

Bridgn is a creator-brand collaboration platform for influencer marketing partnerships. It is a single `index.html` file (~3,139 lines, 268KB).

**Why:** A marketplace that connects content creators with brands for sponsored content deals, managing the full lifecycle from discovery → deal → delivery → payment.

---

## Tech Stack
- Single `index.html` — no build system, no bundler, no npm
- React 18 + ReactDOM via CDN (18.2.0)
- Babel Standalone 7.23.2 for in-browser JSX transpilation
- Supabase JS SDK (CDN) for auth — URL: https://uyucrqodrhrtqcgsfuei.supabase.co
- Supabase anon key in SUPA_KEY constant at line ~2910
- Google Fonts: DM Sans + DM Serif Display
- Custom CSS with CSS variables (dark theme, lines 12–150)

## Auth (Supabase)
- signInWithPassword, signUp (stores full_name + role in user_metadata), resetPasswordForEmail
- Role stored in `user_metadata.role` — either "creator" or "brand"
- Password reset redirects to https://bridgn.vercel.app
- AuthScreen handles login / signup / reset modes

---

## Two User Roles
**Creator** and **Brand** — toggled at signup, shown as a pill in the navbar.

---

## Shared Components
- `PlatformBadge` — Instagram/YouTube/TikTok/Twitter colored badge
- `StatusBadge` — Active/Pending/Completed/Declined/Invited/Expiring/Expired/Draft
- `Modal` — Overlay with close button, maxWidth prop, backdrop click to close
- `Toast` — Fixed bottom-center notification (auto-dismiss)
- `ExtBadge` — Blue "External" pill for non-Bridgn deals
- `EscrowBadge` — Teal "Escrow" / green "Paid" pill
- `TrustBadge` — "✓ Pays on time X%" — shown when brand has ≥3 deals and ≥90% on-time rate
- `StarRating` — 1–5 star rating, readonly or interactive
- `Navbar` — Logo, role pill, notifications bell → page, avatar menu (profile/notifications/sign out)
- `Sidebar` — Role-specific nav items with section headers and "SOON" badges
- `AvailabilityBanner` — Creator open/closed toggle shown at top of creator dashboard

---

## Creator Pages
| Page key | Component | Description |
|---|---|---|
| dashboard | CreatorDashboard | Stats (earnings/deals/escrow/payouts), campaign feed placeholder, incoming offers, active deals, quick actions |
| campaigns | CampaignsPage | "Coming Soon" with email notify + blurred preview of feed |
| campaign-detail | CampaignDetail | Campaign info, requirements, deliverables, apply button |
| deals | CreatorDealsPage | Filterable list of all deals (All/Active/Pending/Completed) |
| deal-room | DealRoomPage | Shared workspace: brief, deliverables checklist, content upload, messages, deal progress steps, escrow status |
| active-deal | ActiveDealPage | 6-step deal tracker (Accepted→Signed→Brief→Content→Review→Paid), step CTAs open modals |
| new-deal | NewDealPage | 3-step: deal details → contract type (5 options) → invite brand via email |
| dispute | DisputePage | File dispute (4 types: content/payment/brief/other) with description |
| offer | OfferPage | Review and accept/decline a brand's direct offer |
| analytics | CreatorAnalyticsPage | Upload platform analytics (Instagram/TikTok/YouTube) with timestamp verification |
| calendar | ContentCalendarPage | Month/list toggle view of content deadlines |
| rate-card | RateCardPage | Rate calculator: followers + engagement + niche → suggested rates per content type |
| media-kit | MediaKitPage | Editable media kit with preview and share (link/PDF) options |
| invoices | InvoicesPage | Invoice table (shared with brand view) — creator can create new invoices |
| public-profile | PublicProfilePage | Creator's public page with stats and booking inquiry modal |
| earnings | EarningsPage | Monthly bar chart, by-brand breakdown, best deals, quick insights |
| contracts | ContractVaultPage | Searchable/filterable contract list with status indicators and detail modal |
| availability | AvailabilityPage | Clickable calendar to block/unblock days (open/blocked/booked states) |
| expenses | ExpensesPage | Expense tracker with deductible flag and tax estimate |
| messages | MessagesPage | 3-panel: thread list + chat + deal info sidebar |
| notifications | NotificationsPage | Notification list (NOTIFS array is currently empty) |

---

## Brand Pages
| Page key | Component | Description |
|---|---|---|
| dashboard | BrandDashboard | Stats, active deals, upcoming deliverables, quick actions |
| browse | BrowseCreatorsPage | Search/filter/sort creator cards; shortlist + invite |
| creator-profile | CreatorProfilePage | 3-tab: overview / analytics / scorecard; invite modal |
| campaigns | BrandCampaignsPage | Campaign list with budget tracking; 2-step new campaign modal |
| campaign-calendar | CampaignCalendarPage | Calendar of all creator deliverables across campaigns |
| deals | BrandDealsPage | Table of all deals with status filter |
| deal-room | DealRoomPage | Shared with creator — same component |
| content-library | ContentLibraryPage | Grid/list of delivered content with rights expiry tracking; approve content |
| affiliate | AffiliateManagerPage | Affiliate links table with clicks/conversions/commission; create new link |
| brief-builder | BriefBuilderPage | Template-based brief (4 templates) with live preview + send to creator |
| scorecards | CreatorScorecardsPage | Rate creators (communication/quality/timeliness) after campaigns |
| team | TeamManagementPage | Invite/remove team members; 4 roles (Admin/Campaign Manager/Finance/Viewer) |
| roi | ROITrackerPage | ROI by creator: spend/revenue/ROI/clicks/conversions table |
| ai-match | AIMatchPage | Free-text query → animated search → ranked creator matches |
| shortlists | ShortlistsPage | Curated creator lists; create named list; navigate to browse |
| invoices | InvoicesPage | Same component as creator invoices — brand can release payments |
| messages | MessagesPage | Same component — brand threads show creator names |
| notifications | NotificationsPage | Same component |

---

## Key Data Constants (all defined near top of `<script>`)
- `CAMPAIGNS` — 5 campaigns for creator browse (id, title, brand, platform, budget, etc.)
- `CREATORS` — 6 creators with stats (followers, engagement, auth%, rating, analytics files)
- `CREATOR_DEALS_INIT` — 4 initial deals (used to seed creator deals state)
- `OFFERS` — 1 incoming offer from Luxara Skincare
- `BRAND_DEALS` — 4 brand-side deals
- `BRAND_CAMPAIGNS` — 3 active brand campaigns
- `CONTRACT_TEMPLATES` — 5: Flat Fee, Gifted, Affiliate/Commission, Ambassador, UGC License
- `BRIEF_TEMPLATES` — 4: Product Launch, Seasonal Campaign, UGC Content Brief, Brand Awareness
- `NOTIFS` — Empty array `[]` (notifications not seeded yet)
- `CONTRACTS_DATA` — 5 contracts (Active/Expiring/Expired)
- `EXPENSES_DATA` — 7 expenses with deductible flag
- `EARNINGS_MONTHLY` — 6 months (Oct–Mar)
- `EARNINGS_BY_BRAND` — 4 brands
- `AFFILIATE_DATA` — 4 affiliate links
- `CONTENT_LIBRARY_DATA` — 6 content pieces with rights tracking
- `SCORECARD_DATA` — 2 scorecards
- `TEAM_MEMBERS` — 3 team members
- `CAL_EVENTS` — 7 calendar events

## Styling Utilities (CSS classes defined in `<style>`)
- `.card` / `.card-lg` / `.card-hover` — surface cards
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-outline`, `.btn-danger`, `.btn-success`, `.btn-purple`, `.btn-teal`, `.btn-sm`, `.btn-lg`
- `.badge`, `.badge-green`, `.badge-yellow`, `.badge-red`, `.badge-blue`, `.badge-gray`, `.badge-orange`, `.badge-purple`, `.badge-teal`
- `.g2`, `.g3`, `.g4` — 2/3/4-column grids
- `.fi` (input), `.fta` (textarea), `.fsel` (select), `.fl` (label), `.fg` (form group), `.frow` (2-col form row)
- `.tbl` — styled table
- `.stat-card`, `.stat-label`, `.stat-value`, `.stat-change`, `.stat-up`
- `.page-title`, `.page-subtitle`
- `.section`, `.section-hdr`, `.section-title`, `.section-link`
- `.deal-row`, `.deal-av`, `.deal-info`, `.deal-name`, `.deal-sub`
- `.det-banner`, `.det-body`, `.det-stats`, `.det-stat`, `.det-sec`, `.det-sec-title`
- `.prog-bar`, `.prog-fill`
- `.search-input`, `.filter-btn`
- `.fade-in` — fadeIn animation on mount
- CSS vars: `--bg`, `--surface`, `--surface2`, `--border`, `--text`, `--text2`, `--text3`, `--accent`, `--accent-light`, `--accent2`, `--green`, `--red`, `--yellow`, `--purple`, `--teal`

## How to apply
All UI work lives in `index.html`. No separate files. When adding features:
- Follow existing inline-style + className patterns
- New pages go in the `render()` switch in `App()` at the bottom
- Add new nav items to `cNav` (creator) or `bNav` (brand) arrays in `Sidebar`
- New static data constants go near the top of the `<script>` block
- Keep CSS utility classes in the `<style>` block; add new ones there if needed
