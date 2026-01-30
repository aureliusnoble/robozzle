# RoboZZle Deployment Guide

Automated deployment using GitHub CLI and Supabase CLI.

## Prerequisites

Install these tools first:

```bash
# GitHub CLI (required for secrets/pages setup)
# Ubuntu/Debian:
sudo apt install gh
# macOS:
brew install gh
# Or download from: https://cli.github.com/

# Supabase CLI (should already be installed)
npm install -g supabase
```

## Quick Start (Automated)

If you have both CLIs installed and authenticated, run these commands:

```bash
cd /path/to/robozzle

# 1. Initialize and push to GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-USERNAME/robozzle.git
git branch -M main
git push -u origin main

# 2. Authenticate CLIs (one-time)
gh auth login
supabase login

# 3. Link Supabase project
supabase link --project-ref YOUR-PROJECT-REF

# 4. Push database migrations
supabase db push

# 5. Set GitHub secrets (from .env.local)
source .env.local
gh secret set VITE_SUPABASE_URL --body "$VITE_SUPABASE_URL"
gh secret set VITE_SUPABASE_ANON_KEY --body "$VITE_SUPABASE_ANON_KEY"
gh secret set SUPABASE_URL --body "$SUPABASE_URL"
gh secret set SUPABASE_SERVICE_KEY --body "$SUPABASE_SERVICE_KEY"

# 6. Enable GitHub Pages
gh api repos/{owner}/{repo}/pages -X POST -f source='{"branch":"main","path":"/"}' 2>/dev/null || true

# 7. Trigger deployment
git commit --allow-empty -m "Trigger deployment"
git push
```

---

## Detailed Steps

### Step 1: Supabase Setup

#### 1.1 Create Project (if not done)
Go to [supabase.com](https://supabase.com) and create a new project.

#### 1.2 Get Credentials
Create `.env.local` with your Supabase credentials:
```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...
```

#### 1.3 Link Project
```bash
# Get project ref from Supabase dashboard URL or list projects
supabase projects list

# Link (replace with your project ref)
supabase link --project-ref xxxxx
```

#### 1.4 Run Migrations

**Option A: Via CLI (if migrations haven't been run)**
```bash
supabase db push
```

**Option B: If migrations partially exist**
```bash
# Mark as applied if tables already exist
supabase migration repair --status applied 001 002 003
```

**Option C: Manual via Dashboard**
Go to Supabase Dashboard → SQL Editor and run each migration file:
- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_add_puzzle_metadata.sql`
- `supabase/migrations/003_generated_puzzles.sql`

#### 1.5 Configure Auth URLs

In Supabase Dashboard → Authentication → URL Configuration:
- **Site URL**: `https://YOUR-USERNAME.github.io/robozzle/`
- **Redirect URLs**:
  - `https://YOUR-USERNAME.github.io/robozzle/**`
  - `http://localhost:5173/**`

---

### Step 2: GitHub Repository Setup

#### 2.1 Initialize Git
```bash
cd /path/to/robozzle
git init
git add .
git commit -m "Initial commit"
```

#### 2.2 Connect to GitHub
```bash
# Add remote (repo must exist on GitHub)
git remote add origin https://github.com/YOUR-USERNAME/robozzle.git
git branch -M main
git push -u origin main
```

---

### Step 3: GitHub Secrets

#### Via CLI (Recommended)
```bash
# Authenticate GitHub CLI first
gh auth login

# Set secrets from environment
source .env.local
gh secret set VITE_SUPABASE_URL --body "$VITE_SUPABASE_URL"
gh secret set VITE_SUPABASE_ANON_KEY --body "$VITE_SUPABASE_ANON_KEY"
gh secret set SUPABASE_URL --body "$SUPABASE_URL"
gh secret set SUPABASE_SERVICE_KEY --body "$SUPABASE_SERVICE_KEY"

# Verify
gh secret list
```

#### Via GitHub Web UI
1. Go to repository → Settings → Secrets and variables → Actions
2. Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_URL` | Same as VITE_SUPABASE_URL |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key |

---

### Step 4: GitHub Pages

#### Via CLI
```bash
# Enable Pages with GitHub Actions as source
gh api repos/{owner}/{repo}/pages -X POST \
  -F build_type=workflow \
  2>/dev/null || echo "Pages may already be configured"
```

#### Via GitHub Web UI
1. Go to repository → Settings → Pages
2. Source: **GitHub Actions**
3. Save

---

### Step 5: Configure Base Path (If Using Subdirectory)

If your site will be at `https://username.github.io/robozzle/`:

Edit `vite.config.ts`, uncomment line 70:
```typescript
base: '/robozzle/',
```

Also update line 20:
```typescript
start_url: '/robozzle/',
```

**Skip this if using a custom domain or deploying to user/org pages root.**

---

### Step 6: Deploy

Push to trigger automatic deployment:
```bash
git add .
git commit -m "Configure deployment"
git push
```

Check deployment status:
```bash
# Via CLI
gh run list --workflow=deploy.yml

# Or watch the latest run
gh run watch
```

---

## Post-Deployment

### Update Supabase Auth URL
After first deployment, update Supabase Dashboard → Authentication → URL Configuration with your actual deployed URL.

### Set Up Daily Puzzle Cron (Optional)

In Supabase Dashboard → SQL Editor, run:
```sql
-- Enable pg_cron extension first (Database → Extensions → pg_cron)

-- Schedule daily puzzle creation at midnight UTC
SELECT cron.schedule(
  'create-daily-challenge',
  '0 0 * * *',
  $$SELECT create_daily_challenge()$$
);
```

### Grant Admin Access
In Supabase Dashboard → Table Editor → profiles:
1. Find your user row
2. Change `role` from `user` to `admin`
3. Save

Now you can access `/dev` route on your site.

---

## Generate Puzzles

### Via GitHub Actions
```bash
# Trigger puzzle generation manually
gh workflow run generate-puzzles.yml

# With options
gh workflow run generate-puzzles.yml -f count=10 -f category=recursion
```

### Via CLI locally
```bash
source .env.local
npx tsx scripts/puzzle-generation/index.ts --count 5 --verbose

# With upload to Supabase
npx tsx scripts/puzzle-generation/index.ts --upload --count 24
```

---

## Useful Commands

```bash
# Check deployment status
gh run list

# View deployment logs
gh run view --log

# Check GitHub Pages status
gh api repos/{owner}/{repo}/pages

# List Supabase migrations
supabase migration list

# Check Supabase project status
supabase status

# Run local dev server
npm run dev

# Build locally
npm run build

# Type check
npm run typecheck
```

---

## Troubleshooting

### "Pages build and deployment" fails
- Check Actions tab for error logs
- Verify all 4 secrets are set correctly
- Ensure `VITE_SUPABASE_URL` starts with `https://`

### Auth redirect issues
- Verify Site URL in Supabase matches your deployed URL exactly
- Check Redirect URLs include your domain with `/**` wildcard

### 404 on page refresh
The `public/404.html` and `src/main.tsx` handle SPA routing. If issues persist:
- Verify `404.html` exists in `public/`
- Check browser console for errors

### Migrations fail
```bash
# Check current state
supabase migration list

# If tables exist but aren't tracked, repair history
supabase migration repair --status applied 001 002 003

# Then verify
supabase migration list
```

### Puzzle generation fails
```bash
# Test locally first
source .env.local
npx tsx scripts/puzzle-generation/index.ts --count 1 --verbose

# Check SUPABASE_SERVICE_KEY is the service_role key (not anon)
```

---

## Architecture Overview

```
GitHub Repository
    ├── Push to main
    │
    ├─→ CI Workflow (ci.yml)
    │   └── Typecheck, Lint, Build
    │
    └─→ Deploy Workflow (deploy.yml)
        └── Build & Deploy to GitHub Pages
                │
                └─→ https://username.github.io/robozzle/
                        │
                        └─→ Supabase Backend
                            ├── Auth (Email, OAuth)
                            ├── Database (PostgreSQL + RLS)
                            └── Generated Puzzle Pool
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | CI checks on push/PR |
| `.github/workflows/deploy.yml` | Deploy to GitHub Pages |
| `.github/workflows/generate-puzzles.yml` | Generate AI puzzles |
| `supabase/migrations/*.sql` | Database schema |
| `supabase/config.toml` | Local Supabase config |
| `vite.config.ts` | Build configuration |
| `.env.local` | Local environment variables |
| `public/404.html` | SPA routing for GitHub Pages |
