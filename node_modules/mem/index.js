'use strict';
const mimicFn = require('mimic-fn');
const mapAgeCleaner = require('map-age-cleaner');

const cacheStore = new WeakMap();

const mem = (fn, {
	cacheKey,
	cache = new Map(),
	maxAge
} = {}) => {
	if (typeof maxAge === 'number') {
		mapAgeCleaner(cache);
	}

	const memoized = function (...arguments_) {
		const key = cacheKey ? cacheKey(arguments_) : arguments_[0];

		const cacheItem = cache.get(key);
		if (cacheItem) {
			return cacheItem.data;
		}

		const result = fn.apply(this, arguments_);

		cache.set(key, {
			data: result,
			maxAge: maxAge ? Date.now() + maxAge : Infinity
		});

		return result;
	};

	try {
		// The below call will throw in some host environments
		// See https://github.com/sindresorhus/mimic-fn/issues/10
		mimicFn(memoized, fn);
	} catch (_) {}

	cacheStore.set(memoized, cache);

	return memoized;
};

module.exports = mem;

module.exports.clear = fn => {
	if (!cacheStore.has(fn)) {
		throw new Error('Can\'t clear a function that was not memoized!');
	}

	const cache = cacheStore.get(fn);
	if (typeof cache.clear === 'function') {
		cache.clear();
	}
};
