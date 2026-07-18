# AI Slideshow Video Generation Flow

The video generation pipeline is fully automated and orchestrated using **Inngest** for reliable background jobs and **Modal** for heavy GPU rendering. 

The process is divided into several main stages: Triggering, Script Generation, Asset Generation, Rendering, and Publishing.

## 1. Triggering the Pipeline

You can trigger a job manually via the CLI or automatically on a schedule.

- **Manual Trigger**: Running `npm run trigger:prod` executes `scripts/trigger-prod.ts`. This script sends an Inngest event (`slideshow/trigger` for shorts, `slideshow/trigger-long` for long-form content).
- **Scheduled Triggers**: 
  - `channelScheduler` runs multiple times a day to automatically trigger a standard video generation for eligible active accounts.
  - `longFormScheduler` runs daily to schedule long-form videos based on account throttling rules.

## 2. Script Generation & Job Creation

Once triggered, Inngest picks up the event (`generate-short` or `generate-long-form` functions in `inngest/pipeline.ts`).

1. **Check for Resume**: The system first checks the database for any incomplete jobs for the account. If found, it resumes them.
2. **Script Generation**: If no job exists, the system calls `generateScript` or `generateLongFormScript` (in `lib/generators.ts`). This selects a topic and uses an LLM to write a segmented script containing `visual_prompt`, `caption_text`, and `spoken_text` for each slide/shot.
3. **Database Job**: A new job is inserted into `slideshow_jobs` with the status `script_ready`.

## 3. Parallel Asset Generation

The `executeAssetPipeline` function processes the script by fetching all necessary media concurrently to optimize time:

* **Task A: Audio Narration**
  The script's spoken text is compiled and sent to `generateNarrativeSpeech` (which uses a Text-to-Speech engine, such as Edge TTS or a Modal TTS service). The generated audio buffer is uploaded to Cloudinary, saving the `narration_audio_url`.

* **Task B: Slide Images**
  Images are generated in batches (concurrency of 2). For each shot, its `visual_prompt` is sent to `generateImage` (via Cloudflare AI). The images are uploaded to Cloudinary, saving a list of URLs to `shot_image_urls`.

* **Task D: Thumbnail**
  A thumbnail is generated using a combination of the hook text and the thumbnail prompt, via `generateThumbnail`. The result is uploaded to Cloudinary.

* **Task C: Background Music**
  Once the exact duration of the narration is known, a suitable background track is selected (via `selectMusicTrack`), cropped/processed, and uploaded to Cloudinary as `music_url`.

After this phase completes, the job status is updated to `assets_ready`.

## 4. Video Rendering (Modal)

The heavy lifting of combining audio, images, and music into a video happens on **Modal**.

1. **API Call to Modal**: The pipeline sends a POST request to `MODAL_RENDER_URL` (handled by `modal/render.py`). The payload includes the collected asset URLs, caption style, script, and a callback webhook URL.
2. **Processing**: Modal processes the request. It typically uses tools like FFmpeg to concatenate images, overlay the TTS narration, mix in the background music, and burn in the captions. 
3. **Completion/Webhook**: 
   - *Synchronous:* If in dev mode, Modal may return the video URL directly.
   - *Asynchronous:* Modal processes the video in the background and sends a POST request to `/api/webhooks/modal` upon completion.
4. The database is updated with the final `video_url`, and the job status transitions to `assembled`.

## 5. Publishing to YouTube

When a video is fully assembled, the `publishVideo` Inngest function (listening to `slideshow/publish` events) handles the final upload.

1. **Verification**: Checks that the job is `assembled` and has a `video_url`.
2. **YouTube Upload**: Calls `uploadToYouTube`, passing the video, downloaded thumbnail, and metadata (title, description, tags).
3. **Analytics Sync**: Records the published video in `slideshow_uploads` and updates the topic's analytics.
4. **Cleanup**: Finally, it changes the job status to `published` and calls `cleanupJobArtifacts` to delete the intermediate images/audio from Cloudinary to save storage.
