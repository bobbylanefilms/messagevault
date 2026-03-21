# Scenarios: Foundation & Auth
**Stage:** 1
**Features Covered:** A1, A2, A3, A4, A5
**Prerequisites:** Application deployed and accessible. Clerk authentication configured. Convex backend running. At least one valid Clerk test account available.

---

## Scenario 1: Unauthenticated User Sees Landing Page
**Feature:** A3. Authentication and User Management
**Type:** Happy Path

**Given:** The user is not signed in (no active Clerk session)
**When:** The user navigates to the application root URL (`/`)
**Then:**
- A landing page is displayed with the app name "MessageVault"
- Clerk sign-in and/or sign-up components are visible
- No sidebar, dashboard, or application content is visible
- The page uses dark mode styling by default

**Verification Steps:**
1. Open the application in an incognito/private browser window
2. Confirm the landing page renders with "MessageVault" branding
3. Confirm sign-in/sign-up UI is present and functional
4. Screenshot the landing page
5. Confirm no application navigation (sidebar, top bar) is visible

**Notes:** The landing page should feel clean and minimal — not a marketing page, just auth components and branding.

---

## Scenario 2: Unauthenticated User Cannot Access Protected Routes
**Feature:** A3. Authentication and User Management
**Type:** Error Handling

**Given:** The user is not signed in
**When:** The user directly navigates to `/dashboard`, `/browse`, `/calendar`, `/search`, `/chat`, `/import`, or `/settings`
**Then:**
- The user is redirected to the landing page (`/`) or shown the sign-in component
- No application data or UI is exposed
- The redirect happens without errors or broken page states

**Verification Steps:**
1. In an incognito window, navigate directly to `/dashboard`
2. Confirm redirect to `/` or sign-in prompt
3. Repeat for `/browse`, `/calendar`, `/search`, `/chat`, `/import`, `/settings`
4. Confirm no flash of authenticated content before redirect

**Notes:** Test all routes listed in the spec's route structure. A flash of content before redirect is a security concern and counts as a failure.

---

## Scenario 3: User Sign-Up and First Login
**Feature:** A3. Authentication and User Management
**Type:** Happy Path

**Given:** A new user with valid credentials who has never signed in before
**When:** The user completes the sign-up flow via Clerk
**Then:**
- The user is redirected to `/dashboard` after successful sign-up
- A user record is created in Convex (just-in-time creation)
- Default preferences are set (default model, thinking enabled, theme)
- The top bar shows the Clerk `<UserButton />` with the user's avatar or initial
- The sidebar is visible with navigation links

**Verification Steps:**
1. Sign up with a new account via the Clerk UI
2. Confirm redirect to `/dashboard` after authentication completes
3. Confirm the app shell renders: top bar with logo, user button; sidebar with navigation
4. Screenshot the authenticated dashboard (even if it shows empty state)
5. Confirm the user's name or avatar appears in the Clerk `<UserButton />`

**Notes:** "Just-in-time" means the user record is created on the first Convex operation, not during the Clerk sign-up flow. The dashboard will show empty state since no data has been imported yet.

---

## Scenario 4: Sidebar Navigation Works Across All Routes
**Feature:** A4. App Shell and Layout
**Type:** Happy Path

**Given:** An authenticated user on the dashboard
**When:** The user clicks each navigation item in the sidebar
**Then:**
- Clicking "Calendar" navigates to `/calendar`
- Clicking "Search" navigates to `/search`
- Clicking "AI Chat" navigates to `/chat`
- Clicking "Import" navigates to `/import`
- Clicking "Settings" navigates to `/settings`
- The active route is visually highlighted in the sidebar
- The main content area updates to show the corresponding page
- The sidebar and top bar remain visible on all pages

**Verification Steps:**
1. Starting from `/dashboard`, click each sidebar navigation item in sequence
2. For each click, confirm: URL changes, main content updates, sidebar highlights the active item
3. Confirm the top bar (logo, search icon, import button, user button) remains consistent across all pages
4. Screenshot at least 3 different pages showing the layout consistency
5. Use browser back/forward buttons to confirm navigation history works

**Notes:** Each page may show placeholder or empty-state content at this stage. The test is about navigation and layout, not page content.

---

## Scenario 5: Top Bar Elements Are Functional
**Feature:** A4. App Shell and Layout
**Type:** Happy Path

**Given:** An authenticated user on any page
**When:** The user interacts with top bar elements
**Then:**
- Clicking the MessageVault logo/name navigates to `/dashboard`
- Clicking the search icon navigates to `/search`
- Clicking the Import button navigates to `/import`
- The Clerk `<UserButton />` opens a dropdown with profile and sign-out options
- Signing out returns the user to the landing page

**Verification Steps:**
1. From a non-dashboard page, click the logo/app name — confirm navigation to `/dashboard`
2. Click the search icon — confirm navigation to `/search`
3. Click the Import button — confirm navigation to `/import`
4. Click the Clerk user button — confirm dropdown appears with sign-out option
5. Click sign out — confirm return to landing page and session is cleared
6. Confirm navigating to `/dashboard` after sign-out redirects back to landing page

**Notes:** The sign-out flow must fully clear the session. Verify by attempting to access a protected route after sign-out.

---

## Scenario 6: Dark Mode Is Default with Theme Toggle
**Feature:** A4. App Shell and Layout, A5. Shared Utilities
**Type:** Happy Path

**Given:** A new user who has never changed theme preferences
**When:** The user views the application
**Then:**
- The application renders in dark mode by default
- Background colors are dark (not white/light)
- Text is light-colored against the dark background
- All UI components (sidebar, top bar, content area) use consistent dark theme styling
- If a theme toggle exists, switching to light mode updates the entire UI

**Verification Steps:**
1. Sign in and observe the default color scheme
2. Confirm dark background colors throughout the application
3. Navigate to 2-3 different pages and confirm dark mode consistency
4. If a theme toggle is visible (in settings or top bar), toggle to light mode and confirm the change
5. Screenshot both dark and light modes if toggle exists

**Notes:** Dark mode is the default per the spec. System preference detection may also be in play — test in a browser with light system preference to confirm the app still defaults to dark.

---

## Scenario 7: Empty States Display Appropriately
**Feature:** A5. Shared Utilities and UI Components
**Type:** Edge Case

**Given:** An authenticated user with no imported data
**When:** The user navigates to each feature page
**Then:**
- Dashboard shows an empty state with appropriate messaging (e.g., "No conversations yet")
- Browse page shows an empty state or redirect guidance
- Calendar shows an empty or placeholder state
- Search shows an appropriate empty state
- AI Chat shows an empty state (possibly with suggestion cards)
- Each empty state includes a call-to-action (e.g., "Import your first archive")
- No errors, broken layouts, or confusing blank pages

**Verification Steps:**
1. With a fresh account (no imports), navigate to `/dashboard`
2. Confirm a user-friendly empty state message is displayed
3. Navigate to `/browse` — confirm empty state or helpful redirect
4. Navigate to `/calendar` — confirm empty state
5. Navigate to `/search` — confirm empty state
6. Navigate to `/chat` — confirm empty state
7. Screenshot each empty state page
8. Confirm no page shows raw error messages or completely blank content

**Notes:** Empty states should feel warm and encouraging, not clinical or error-like. The copy should guide the user toward importing their first archive.

---

## Scenario 8: Sidebar Collapses on Narrow Viewports
**Feature:** A4. App Shell and Layout
**Type:** Edge Case

**Given:** An authenticated user viewing the application
**When:** The browser window is resized to a narrow width (e.g., 768px or less)
**Then:**
- The sidebar collapses or becomes a toggleable overlay
- The main content area expands to use the available width
- A hamburger menu or toggle button appears to open/close the sidebar
- All navigation remains accessible when the sidebar is expanded
- The layout does not break or overflow horizontally

**Verification Steps:**
1. Start with the browser at full desktop width — confirm sidebar is visible
2. Resize the browser to approximately 768px width
3. Confirm the sidebar collapses or transforms into a mobile-friendly navigation
4. If a toggle button appears, click it to open the sidebar and confirm navigation works
5. Resize back to full width and confirm the sidebar returns to its normal state
6. Screenshot the narrow viewport layout

**Notes:** MessageVault is desktop-primary, so mobile layout does not need to be pixel-perfect. But it should not break — content should remain accessible.

---
