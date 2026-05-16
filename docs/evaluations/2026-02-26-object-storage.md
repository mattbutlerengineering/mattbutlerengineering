# Object Storage Evaluation — February 2026

## Current State

| Dimension | Value |
|-----------|-------|
| **Object storage** | None |
| **Image uploads** | Not implemented |
| **File storage needs** | Venue photos, menus, floor plan images (future) |

### Use Cases

1. **Venue images** — photos of the restaurant, ambiance, food
2. **Menu PDFs/images** — digital menus linked to venues
3. **Floor plan backgrounds** — custom images behind the floor plan editor
4. **User avatars** — profile pictures (low volume)

Expected volume: low. Dozens to hundreds of images, not millions. Egress is moderate — images served to public website and dashboard.

---

## Provider Profiles

### 1. Cloudflare R2 (Recommended)

S3-compatible object storage with zero egress fees. Part of the Cloudflare ecosystem (already used for DNS).

| Criterion | Details |
|-----------|---------|
| **Storage** | $0.015/GB/month |
| **Egress** | $0 (zero egress fees — the key differentiator) |
| **Free tier** | 10 GB storage, 10 million Class B ops, 1 million Class A ops/month |
| **API** | S3-compatible (use any S3 SDK) |
| **CDN** | Automatic via Cloudflare CDN (already on Cloudflare) |
| **Custom domains** | Supported (serve images from `images.mattbutlerengineering.com`) |
| **Image transformations** | Cloudflare Images ($5/month for 5K transformations) or use R2 + Workers |

**Key strength:** Zero egress. Images served from Cloudflare's CDN at no bandwidth cost. Since this project already uses Cloudflare for DNS, R2 is a natural addition — same dashboard, same account. The 10 GB free tier covers hundreds of venue images.

---

### 2. DigitalOcean Spaces

S3-compatible object storage with built-in CDN. Part of the DigitalOcean ecosystem (already used for hosting).

| Criterion | Details |
|-----------|---------|
| **Storage** | $5/month for 250 GB + 1 TB bandwidth |
| **Egress** | $0.01/GB after 1 TB |
| **Free tier** | None ($5/month minimum) |
| **API** | S3-compatible |
| **CDN** | Built-in CDN included |

**Key weakness:** $5/month minimum even for storing 10 images. No free tier. For the expected volume (< 1 GB storage, < 10 GB bandwidth), Cloudflare R2's free tier is a better fit.

---

### 3. AWS S3

The original object storage. Most feature-complete but most expensive for egress.

| Criterion | Details |
|-----------|---------|
| **Storage** | $0.023/GB/month (S3 Standard) |
| **Egress** | $0.09/GB after 100 GB/month |
| **Free tier** | 5 GB for 12 months |

**Elimination reason:** Requires an AWS account (project uses DigitalOcean). Egress costs are 50-100x Cloudflare R2 for the same bandwidth. Overkill and overpriced for this use case.

---

## Recommendation: Cloudflare R2

| Dimension | Details |
|-----------|---------|
| **Cost** | $0/month (well within 10 GB free tier) |
| **Setup** | Create R2 bucket in existing Cloudflare account |
| **SDK** | Any S3-compatible SDK (`@aws-sdk/client-s3` works with R2) |
| **CDN** | Automatic via Cloudflare (already the DNS/CDN provider) |
| **Migration** | S3-compatible API means switching providers is trivial |

---

## Sources

- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [DigitalOcean Spaces Pricing](https://www.digitalocean.com/pricing/spaces-object-storage)
- [S3 Compatible Storage Cost Comparison](https://blog.moretools.net/cloud-storage/s3-compatible-storage-cost-comparison-cloudflare-r2-digitalocean-spaces-vultr-etc/)
- [Cloudflare R2 vs DigitalOcean Spaces (Taloflow)](https://www.taloflow.ai/guides/comparisons/cloudflarer2-vs-digitaloceanspaces-object-storage)
- [AWS S3 Pricing](https://aws.amazon.com/s3/pricing/)
