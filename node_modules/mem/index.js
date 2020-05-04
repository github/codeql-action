'use strict';
const mimicFn = require('mimic-fn');
const mapAgeCleaner = require('map-age-cleaner');

const cacheStore = new WeakMap();

const mem = (fn, options = {}) => {
	// Automatically use WeakMap unless the user provided their own cache
	const weakCache = options.cache || new WeakMap();
	const {
		cacheKey = ([firstArgument]) => firstArgument,
		cache = new Map(),
		maxAge
	} = options;

	if (typeof maxAge === 'number') {
		mapAgeCleaner(cache);
	}

	const memoized = function (...arguments_) {
		const key = cacheKey(arguments_);

		// Prefer WeakMap if the key allows it
		const bestCache = key && (typeof key === 'object' || typeof key === 'function') ?
			weakCache :
			cache;

		if (bestCache.has(key)) {
			return bestCache.get(key).data;
		}

		const cacheItem = fn.apply(this, arguments_);

		bestCache.set(key, {
			data: cacheItem,
			maxAge: maxAge ? Date.now() + maxAge : Infinity
		});

		return cacheItem;
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
