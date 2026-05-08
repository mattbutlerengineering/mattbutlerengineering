# Infrastructure Runbooks

Operational procedures for managing the mattbutlerengineering infrastructure.

---

## 1. Deploy a New Service

### Prerequisites

- Service code in `services/<name>/`
- Dockerfile in `services/<name>/Dockerfile`
- Pulumi resource in `infrastructure/pulumi/`

### Steps

1. **Add Pulumi resource:**

   ```typescript
   // infrastructure/pulumi/index.ts
   import { Service } from "./service-template.js";

   const myService = new Service("my-service", {
     name: "my-service",
     image: "ghcr.io/mattbutlerengineering/my-service:latest",
     port: 3005,
     env: {
       DATABASE_URL: process.env.DATABASE_URL,
     },
   });
   ```

2. **Update edge router routing:**

   ```javascript
   // infrastructure/worker/edge-router.js
   const routes = {
     // ... existing routes ...
     "/api/my-service": {
       type: "service",
       url: "http://my-service:3005",
       headers: { "X-Service-Name": "my-service" },
     },
   };
   ```

3. **Add health check endpoint:**

   ```typescript
   // services/my-service/src/routes/health.ts
   fastify.get("/health", async () => ({
     status: "ok",
     service: "my-service",
     timestamp: new Date().toISOString(),
   }));
   ```

4. **Build and push image:**

   ```bash
   docker build -t ghcr.io/mattbutlerengineering/my-service:latest ./services/my-service
   docker push ghcr.io/mattbutlerengineering/my-service:latest
   ```

5. **Deploy with Pulumi:**

   ```bash
   cd infrastructure/pulumi
   pulumi up
   ```

6. **Verify deployment:**
   ```bash
   curl https://api.mattbutlerengineering.com/my-service/health
   ```

### Rollback

If deployment fails:

```bash
# Revert Pulumi stack
cd infrastructure/pulumi
pulumi stack select production
pulumi up --target urn:pulumi:production::mattbutlerengineering::Service::my-service --diff
```

---

## 2. Rollback a Service

### Automatic Rollback

DO App Platform automatically rolls back if health checks fail within 60 seconds.

### Manual Rollback

```bash
cd infrastructure/pulumi
pulumi stack select production

# List recent deployments
pulumi stack output deployment-history

# Rollback to previous version
pulumi up -t <previous-deployment-urn>
```

### Emergency Rollback (Critical)

```bash
# Force immediate rollback
cd infrastructure/pulumi
GITHUB_REF=main pnpm exec tsx scripts/emergency-rollback.ts --service=my-service
```

---

## 3. Database Backup and Restore

### Backup

```bash
# Daily automated backups via DO App Platform
# Manual backup:

# Connect to production database
psql $DATABASE_URL

# Create backup
pg_dump -Fc mattbutlerengineering > backup_$(date +%Y%m%d_%H%M%S).dump

# Upload to storage
aws s3 cp backup_20240101_120000.dump s3://mbe-backups/
```

### Restore

```bash
# Restore from backup
psql $DATABASE_URL -c "DROP DATABASE IF EXISTS mattbutlerengineering;"
pg_restore --no-owner --dbname mattbutlerengineering backup_20240101_120000.dump

# Verify restore
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
```

### Point-in-Time Recovery

```bash
# DO App Platform provides automatic PITR
# Restore to specific timestamp:

pg_restore --no-owner \
  --dbname=mattbutlerengineering \
  --quote-all-identifiers \
  --role=mattbutlerengineering \
  s3://mbe-backups/backup_20240101.dump
```

---

## 4. Edge Router Troubleshooting

### Common Issues

**Symptom: 502 Bad Gateway**

1. Check service health:

   ```bash
   curl -v https://api.mattbutlerengineering.com/api/<service>/health
   ```

2. Check service logs:

   ```bash
   doctl apps logs <app-id> --deployment <deployment-id> --service <service-name>
   ```

3. Verify routing configuration:
   ```bash
   # Check edge-router.js routing
   cat infrastructure/worker/edge-router.js | grep -A5 '/api/<service>'
   ```

**Symptom: 404 Not Found**

1. Verify route exists in edge-router.js
2. Check ingress configuration
3. Ensure service name matches in routing config

**Symptom: Connection Timeout**

1. Check if service is running:

   ```bash
   doctl apps list-deployments
   ```

2. Check network policies:
   ```bash
   doctl apps get <app-id> --format spec
   ```

### Edge Router Route Configuration

```javascript
// infrastructure/worker/edge-router.js
const routes = {
  // API Gateway
  "/api/users": {
    type: "service",
    url: "http://users-service:3001",
    headers: { "X-Service-Name": "users" },
  },
  "/api/reservations": {
    type: "service",
    url: "http://reservations-service:3004",
    headers: { "X-Service-Name": "reservations" },
  },
  "/api/agent": {
    type: "service",
    url: "http://agent-service:3003",
    headers: { "X-Service-Name": "agent" },
  },
  // SSE routes preserve connection
  "/api/v1/events": {
    type: "sse",
    url: "http://reservations-service:3004",
  },
  // Static assets
  "/_assets/*": {
    type: "static",
    url: "https://assets.mattbutlerengineering.com",
  },
};
```

### Restart Edge Router

```bash
# Deploy new edge router version
cd infrastructure/worker
wrangler deploy

# Verify
curl -I https://api.mattbutlerengineering.com/health
```

---

## 5. Scaling Services

### Manual Scale

```bash
# Scale via DO App Platform
doctl apps update <app-id> \
  --service <service-name> \
  --instance-count 3 \
  --instance-size basic
```

### Auto-Scale Configuration

```yaml
# In Pulumi service definition
const myService = new Service("my-service", {
  autoScale: {
    minInstances: 1,
    maxInstances: 5,
    cpuThreshold: 70,
    memoryThreshold: 80
  }
});
```

### Verify Scale

```bash
# Check current instances
doctl apps list <app-id> --format services

# Check load distribution
doctl apps logs <app-id> --deployment <deployment-id> | grep "request handled"
```

---

## 6. Secret Rotation

### Rotate API Keys

```bash
# Generate new key
openssl rand -hex 32

# Update in DO App Platform
doctl apps update <app-id> \
  --env MY_API_KEY=new_hex_value

# Deploy to pick up new secret
doctl apps deploy <app-id>
```

### Rotate Database Password

```bash
# Update password in DO App Platform
doctl apps update <app-id> \
  --env DATABASE_URL="postgresql://user:newpass@host:5432/db"

# Verify connection
psql $DATABASE_URL -c "SELECT 1;"
```

---

## 7. Incident Response

### Check System Health

```bash
# Check all service health
curl -s https://api.mattbutlerengineering.com/health/system | jq .

# Check CI status
curl -s https://api.mattbutlerengineering.com/health/ci | jq .

# Check recent deployments
doctl apps list-deployments <app-id> --format id,updated_at,deployed
```

### Common Incident Commands

```bash
# Get all logs for last hour
doctl apps logs <app-id> --since 1h

# Get error logs only
doctl apps logs <app-id> | grep -i error

# Check specific service
doctl apps logs <app-id> --service users-service

# View deployment history
doctl apps list-deployments <app-id> --format id,created_at,phase
```

### Emergency Contacts

| Service              | Contact                |
| -------------------- | ---------------------- |
| DigitalOcean Support | `doctl support ticket` |
| Auth0 Support        | auth0.com/support      |
| Claude API           | console.anthropic.com  |

---

## 8. Monitoring and Alerts

### Key Metrics to Watch

- **Response time**: P95 < 500ms, P99 < 1s
- **Error rate**: < 0.1%
- **Uptime**: > 99.9%
- **Database connections**: < 80% of max

### Alert Thresholds

| Alert           | Threshold | Action           |
| --------------- | --------- | ---------------- |
| High Error Rate | > 1%      | Page on-call     |
| Slow Response   | P99 > 2s  | Investigate      |
| Database Full   | > 90%     | Scale or cleanup |
| Disk Usage      | > 85%     | Cleanup logs     |

### View Metrics

```bash
# DO App Platform metrics
doctl apps metrics <app-id>

# Check request logs
doctl apps logs <app-id> --deployment <dep-id> --follow
```
