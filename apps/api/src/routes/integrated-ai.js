import { Router } from 'express';
import { ContentBlockType, stream, uploadImagesToPocketBase } from '../api/integrated-ai.js';
import { SystemPrompt } from '../constants/prompts.js';
import { uploadFiles } from '../middleware/file-upload.js';
import { integratedAiRateLimit } from '../middleware/integrated-ai-rate-limit.js';
import { pocketbaseAuth } from '../middleware/pocketbase-auth.js';

const router = Router();

router.use(pocketbaseAuth);

router.post('/stream', integratedAiRateLimit, uploadFiles({
	allowedMimeTypes: [
		'image/jpeg',
		'image/png',
		'image/webp',
	],
	fieldName: 'images',
}), async (req, res) => {
	const { message } = req.body;

	if (!message) {
		throw new Error('message is required');
	}

	const parsedMessage = JSON.parse(message);

	if (req.files?.length > 0) {
		const imageUrls = await uploadImagesToPocketBase({ images: req.files });
		imageUrls.forEach((url) => {
			parsedMessage.push({ type: ContentBlockType.Image, image: url });
		});
	}

	const sseStream = await stream({
		userId: req.pocketbaseUserId,
		systemPrompt: SystemPrompt,
		userMessage: parsedMessage,
	});

	res.setHeader('Content-Type', 'text/event-stream');
	res.setHeader('Cache-Control', 'no-cache');
	res.setHeader('Connection', 'keep-alive');
	res.setHeader('X-Accel-Buffering', 'no');

	sseStream.pipe(res, { end: false });

	res.on('close', () => sseStream.destroy());
});

export default router;
