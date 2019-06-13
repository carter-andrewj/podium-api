import { fromJS } from 'immutable';

import { RadixUtil, RadixAccount, RadixKeyPair } from 'radixdlt-reactnative';




export function getAccount(seed) {
	const hash = RadixUtil.hash(Buffer.from(seed));
	return new RadixAccount(RadixKeyPair.fromPrivate(hash));
}



export function postCost(text) {
	return text.length + (9 * Math.floor(text.length / 128))
}



export function chunkText(text, size) {
	const chunks = Math.ceil(text.length / size)
	const result = []
	for (var i = 0; i < chunks; i++) {
		result.push(text.substring(i * size, (i + 1) * size))
	}
	return result
}



export function filterAsync(subject, predicate) {
	return new Promise((resolve, reject) => {
		var predicatePromises = subject
			.map(v => predicate(v))
		Promise.all([...predicatePromises])
			.then(results => resolve(subject
				.zip(fromJS(results))
				.filter(([_, r]) => r)
				.map(([s, r]) => s)
				.toList()
			))
			.catch(error => reject(error))
	})
}



// Utility function for passing on errors
// resulting from interrim code (currently
// only the timeout error from getHistory
// which is thrown for empty addresses - 
// e.g. a user with no posts or no followers)
export function checkThrow(error) {
	if (error.code !== 2) {
		throw error
	}
}
