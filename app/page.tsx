// Path: app/page.tsx
import { query } from '@/lib/database';
import { SlideshowJob } from '@/lib/types';

// ─── Data fetching ────────────────────────────────────────────────────────────

async function getRecentJobs(): Promise<SlideshowJob[]> {
  try {
    const result = await query<SlideshowJob>(
      `SELECT id, account_id, topic, niche, status, youtube_video_id,
              error_message, created_at, updated_at
       FROM slideshow_jobs
       ORDER BY created_at DESC
       LIMIT 30`,
    );
    return result.rows;
  } catch {
    return [];
  }
}

async function getStats(): Promise<{
  total: number;
  uploaded: number;
  failed: number;
  inProgress: number;
}> {
  try {
    const result = await query<{
      total: string;
      uploaded: string;
      failed: string;
      in_progress: string;
    }>(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'uploaded')  AS uploaded,
        COUNT(*) FILTER (WHERE status = 'failed')    AS failed,
        COUNT(*) FILTER (WHERE status NOT IN ('uploaded','failed')) AS in_progress
      FROM slideshow_jobs
    `);
    const r = result.rows[0];
    return {
      total:      parseInt(r.total, 10)      || 0,
      uploaded:   parseInt(r.uploaded, 10)   || 0,
      failed:     parseInt(r.failed, 10)     || 0,
      inProgress: parseInt(r.in_progress, 10)|| 0,
    };
  } catch {
    return { total: 0, uploaded: 0, failed: 0, inProgress: 0 };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

const STATUS_LABEL: Record<string, string> = {
  pending:     'Pending',
  generating:  'Generating',
  images_done: 'Images ✓',
  tts_done:    'TTS ✓',
  assembled:   'Assembled',
  uploaded:    'Uploaded',
  failed:      'Failed',
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  return (
    <span className={`badge badge-${status}`}>
      <span className={`badge-dot badge-dot-${status}`} />
      {label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export const revalidate = 30; // ISR: refresh every 30 seconds

export default async function DashboardPage() {
  const [jobs, stats] = await Promise.all([getRecentJobs(), getStats()]);

  const successRate =
    stats.total > 0 ? Math.round((stats.uploaded / stats.total) * 100) : 0;

  return (
    <main className="page">

      {/* Header */}
      <header className="header">
        <div className="header-icon">🏛️</div>
        <div className="header-text">
          <h1>AI Slideshow</h1>
          <p>AI Shorts Automation Pipeline</p>
        </div>
        {stats.inProgress > 0 && (
          <div className="header-badge">
            {stats.inProgress} running
          </div>
        )}
      </header>

      {/* Stats */}
      <section className="stats-row" aria-label="Pipeline statistics">
        <div className="stat-card">
          <div className="stat-label">Total Jobs</div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-sub">all time</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Uploaded</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {stats.uploaded}
          </div>
          <div className="stat-sub">live on YouTube</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Progress</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>
            {stats.inProgress}
          </div>
          <div className="stat-sub">running now</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Success Rate</div>
          <div className="stat-value" style={{ color: 'var(--accent-light)' }}>
            {successRate}%
          </div>
          <div className="stat-sub">{stats.failed} failed</div>
        </div>
      </section>

      {/* Jobs table */}
      <p className="section-title">Recent Jobs</p>

      <div className="jobs-table-wrap">
        {jobs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎬</div>
            <p className="empty-title">No jobs yet</p>
            <p className="empty-sub">
              Trigger the pipeline via <code>POST /api/cron</code> or wait for the
              scheduled cron-job.org run.
            </p>
          </div>
        ) : (
          <table className="jobs-table" aria-label="Slideshow jobs">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Status</th>
                <th>Account</th>
                <th>Created</th>
                <th>YouTube</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <span className="job-topic" title={job.topic}>
                      {job.topic}
                    </span>
                    {job.status === 'failed' && job.error_message && (
                      <div className="error-message" title={job.error_message}>
                        ⚠ {job.error_message}
                      </div>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={job.status} />
                  </td>
                  <td>
                    <span className="job-time">{job.account_id}</span>
                  </td>
                  <td>
                    <span className="job-time">{formatRelativeTime(job.created_at)}</span>
                  </td>
                  <td>
                    {job.youtube_video_id ? (
                      <a
                        id={`yt-link-${job.id}`}
                        className="job-link"
                        href={`https://www.youtube.com/watch?v=${job.youtube_video_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Watch ${job.topic} on YouTube`}
                      >
                        Watch
                        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M2 10L10 2M10 2H5M10 2v5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </a>
                    ) : (
                      <span className="job-time">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
