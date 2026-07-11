import rateLimit from 'express-rate-limit';

// Static workspace previews are cheap disk reads, and a single gallery page
// pulls dozens of assets — counting them against the 100/5min budget lets one
// preview visit exhaust the whole window.
const PREVIEW_RE = /^\/build\/[a-f0-9]{16}\/preview(\/|$)/;

export const globalRateLimit = rateLimit({
	windowMs: 5 * 60 * 1000,
	// Was 100 — too easily exhausted by a single legitimate integration (a
	// campaign run alone is a roundtable call + spec SSE + 4 Tara SSE streams
	// + budget checks; add a partner portal's own polling/validity checks on
	// top and 100/5min was gone before any real abuse was in play).
	max: 500,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: 'Too many requests, please try again later' },
	validate: { trustProxy: false },
	skip: (req) => PREVIEW_RE.test(req.path),
});
