# Local media processor

The media worker is a separate, single-concurrency Node process. It reads private source objects,
uses the host `ffmpeg` and `ffprobe` binaries, writes a protected READY object, and only then commits
the verified MIME, size, SHA-256 and optional duration in PostgreSQL.

Required runtime variables are `DATABASE_URL`, `S3_BUCKET`, `S3_REGION` and the same optional
`S3_ENDPOINT`, `S3_ACCESS_KEY`, and `S3_SECRET_KEY` used by the API. `FFMPEG_PATH` and
`FFPROBE_PATH` may override the host binaries. Do not expose the source or READY bucket publicly.

The worker claims one job at a time with `FOR UPDATE SKIP LOCKED`. A crashed lease can be reclaimed;
retryable failures use bounded backoff and the third failed attempt becomes terminal `FAILED`.
