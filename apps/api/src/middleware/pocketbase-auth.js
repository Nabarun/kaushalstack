import { Buffer } from 'node:buffer';
import Pocketbase from 'pocketbase';

export async function pocketbaseAuth(req, res, next) {
	const token = req.headers.authorization?.split(' ')?.[1];

	if (!token) {
		return next();
	}

	const base64Decoded = Buffer.from(token, 'base64').toString('utf-8');

	try {
		const tokenData = JSON.parse(base64Decoded);
		if (!tokenData?.record) {
			return next();
		}
		// by refreshing token we verify that it was not intercepted by a malicious user
		const pocketbaseClient = new Pocketbase(process.env.POCKETBASE_URL || 'http://localhost:8090');
		pocketbaseClient.authStore.save(tokenData.token, tokenData.record);
		const newToken = await pocketbaseClient.collection(tokenData.record.collectionName).authRefresh();

		req.pocketbaseUserId = newToken.record.id;

		return next();
	} catch (error) {
		return next(new Error(error.message));
	}
}
