# Worktree Support Configuration

Project-specific configuration for the worktree skill in solar_tigo_viewer.

## Directory Preference

```yaml
location: project-local
path: .worktrees
```

**Note:** `.worktrees/` is already in `.gitignore`.

## Environment Setup

### Dependencies

Each worktree needs its own Docker build:

```bash
cd .worktrees/<branch-name>

# Build and start dashboard services
cd dashboard
docker compose up --build -d

# Wait for services to be ready
sleep 5
curl -s http://localhost:5174 > /dev/null && echo "Frontend ready"
curl -s http://localhost:8000/health > /dev/null && echo "Backend ready"
```

### Environment Files

No `.env` files needed for local development - defaults work out of the box.

For production-like testing:
```bash
# Backend uses these defaults:
# MQTT_HOST=192.168.2.93
# MQTT_PORT=1883
```

## Test Commands

### Unit Tests

```bash
# From worktree root
cd dashboard

# Frontend tests
docker compose exec frontend npm run test

# Backend tests
docker compose exec backend pytest
```

### E2E Tests

Use Playwright MCP tools:
1. Ensure services are running: `docker compose up -d`
2. Navigate to http://localhost:5174
3. Use `mcp__playwright__browser_snapshot` to verify state

## Service Startup

```bash
cd dashboard
docker compose up --build -d

# Access at http://localhost:5174
```

**Port conflict note:** If running multiple worktrees simultaneously, you'll need to change ports in `docker-compose.yml` for each worktree to avoid conflicts.

## File Ownership Guidelines

| Session Focus | Owned Directories | Avoid |
|---------------|-------------------|-------|
| Backend work | `dashboard/backend/` | `dashboard/frontend/` |
| Frontend work | `dashboard/frontend/` | `dashboard/backend/` |
| Config/mapping | `config/` | Application code |
| Documentation | `docs/` | Source code |
| Tigo MQTT | `tigo-mqtt/` | Dashboard code |

## Branch Naming

```
implement/<spec-name>     # Spec implementations
feature/<description>     # New features
fix/<description>         # Bug fixes
experiment/<description>  # Exploratory work
```

## Pre-Worktree Checklist

- [ ] Main branch is up to date (`git pull origin main`)
- [ ] No uncommitted changes in main worktree
- [ ] Docker daemon is running
- [ ] No other worktrees using port 5174 or 8000

## Post-Merge Cleanup

```bash
# Remove the worktree
git worktree remove .worktrees/<branch-name>

# Delete the branch
git branch -d <branch-name>

# Prune stale references
git worktree prune

# Stop any Docker services from the worktree
# (They share the same network, so stopping main is usually sufficient)
```

## Known Issues

### Port Conflicts

Multiple worktrees running Docker services will conflict on ports 5174 (frontend) and 8000 (backend).

**Solutions:**
1. Only run one worktree's services at a time
2. Modify `docker-compose.yml` in each worktree to use different ports
3. Stop services before switching: `docker compose down`

### Docker Image Naming

Worktrees may build images with the same name, causing confusion.

**Solution:** Use explicit project names:
```bash
cd .worktrees/feature-x/dashboard
COMPOSE_PROJECT_NAME=feature-x docker compose up --build -d
```

### Shared MQTT Broker

All worktrees connect to the same MQTT broker (192.168.2.93). This is typically fine since they're reading the same panel data, but be aware if testing MQTT-related changes.

## Parallel Session Coordination

### Task Tracking

When running parallel Claude sessions, maintain awareness via `tasks.md`:

```markdown
# Active Parallel Tasks

| Worktree | Branch | Task | Files Owned | Status |
|----------|--------|------|-------------|--------|
| .worktrees/implement-zoom | implement/zoom-controls | Zoom feature | dashboard/frontend/src/components/Canvas* | In progress |
| .worktrees/fix-backend | fix/mqtt-reconnect | MQTT fixes | dashboard/backend/app/mqtt* | Testing |
```

### Conflict Prevention

- Check `git status` in main before creating worktrees
- Claim file ownership before editing
- Merge to main frequently
- Communicate session boundaries clearly
