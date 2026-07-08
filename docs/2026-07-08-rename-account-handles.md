# Rename Account Handles — 2026-07-08

**Mapping:**

| Current ID | New ID | YouTube Handle | Channel ID |
|---|---|---|---|
| `tech_shots` | `CanvasCenter` | @CanvasCenter | UCYJQqqRf4tMxc7ra5FF08eQ |
| `finance_shots` | `CanvasSquare` | CanvasSquare | UCzKvcGH7IyS684PQ4aCw2PQ |
| `survival_shots` | `CanvasBase` | @CanvasBase | UC6gH91v6aGmQFdNwMFC5RwQ |
| `stoic_shots` | `CanvasStation` | @CanvasStation | UCnBL50AkM_6BmvrNlS1rxVw |

---

## Step 1 — DB Migrations

### accounts

```sql
UPDATE accounts SET id = 'CanvasCenter'  WHERE id = 'tech_shots';
UPDATE accounts SET id = 'CanvasSquare'  WHERE id = 'finance_shots';
UPDATE accounts SET id = 'CanvasBase'    WHERE id = 'survival_shots';
UPDATE accounts SET id = 'CanvasStation' WHERE id = 'stoic_shots';
```

### slideshow_jobs

```sql
UPDATE slideshow_jobs SET account_id = 'CanvasCenter'  WHERE account_id = 'tech_shots';
UPDATE slideshow_jobs SET account_id = 'CanvasSquare'  WHERE account_id = 'finance_shots';
UPDATE slideshow_jobs SET account_id = 'CanvasBase'    WHERE account_id = 'survival_shots';
UPDATE slideshow_jobs SET account_id = 'CanvasStation' WHERE account_id = 'stoic_shots';
```

### slideshow_topics

```sql
UPDATE slideshow_topics SET account_id = 'CanvasCenter'  WHERE account_id = 'tech_shots';
UPDATE slideshow_topics SET account_id = 'CanvasSquare'  WHERE account_id = 'finance_shots';
UPDATE slideshow_topics SET account_id = 'CanvasBase'    WHERE account_id = 'survival_shots';
UPDATE slideshow_topics SET account_id = 'CanvasStation' WHERE account_id = 'stoic_shots';
```

---

## Step 2 — Update Modal Cloudinary Secret

Run `scripts/decrypt-and-upload-modal.ts` (after editing — see Step 3) to rewrite the Modal `cloudinary` secret. `render.py` derives suffixes via `account_id.upper().replace("-", "_")`, so PascalCase `CanvasCenter` → `CANVASCENTER`.

```bash
npx tsx scripts/decrypt-and-upload-modal.ts
```

---

## Step 3 — Edit Code Files

| File | What to change |
|---|---|
| `lib/constants.ts:4` | `ACCOUNT_ID` default → `'CanvasCenter'` |
| `lib/constants.ts:9-14` | `ACCOUNT_NICHE` keys: `tech_shots`→`CanvasCenter`, `finance_shots`→`CanvasSquare`, `survival_shots`→`CanvasBase`, `stoic_shots`→`CanvasStation` |
| `lib/constants.ts:17-22` | `ACCOUNT_YOUTUBE_CHANNEL_ID` keys — same rename (channel IDs stay unchanged) |
| `scripts/seed-data.ts` | Account IDs in SEEDS array (4 entries) + comments |
| `scripts/decrypt-and-upload-modal.ts:33-39` | `accountIds` array + `suffixMap` keys & suffix values |
| `scripts/trigger-prod.ts:22` | Default `'tech_shots'` → `'CanvasCenter'` |
| `scripts/trigger.ts:11` | Default `'tech_shots'` → `'CanvasCenter'` |
| `scripts/migrate-reseed-techshots.ts` | All `tech_shots` → `CanvasCenter` |
| `.env.local` (line 2) | `ACCOUNT_ID="CanvasCenter"` |
| `.env.production` (line 2) | `ACCOUNT_ID="CanvasCenter"` |
| `.env.example` (line 36) | `ACCOUNT_ID=CanvasCenter` |
| `AGENTS.md:11-13,54` | Example commands |
| `docs/adding-an-account.md` | Examples/comments throughout |
| `SYSTEM.md:85` | Comment example |

---

## Execution Order

```
1. Run DB SQL updates                        (psql or npx tsx)
2. Edit scripts/decrypt-and-upload-modal.ts   (new account IDs)
3. npx tsx scripts/decrypt-and-upload-modal.ts → updates Modal secret
4. Edit remaining code files
5. npm run build                              (verify no type errors)
6. git push                                   (deploy to Vercel)
```

All changes in a single commit. DB updates first, then code, then deploy.
