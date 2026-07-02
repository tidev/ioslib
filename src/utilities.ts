/**
 * Utility functions used by ioslib.
 *
 * @module utilities
 *
 * @copyright
 * Copyright (c) 2015-2016 by Appcelerator, Inc. All Rights Reserved.
 *
 * @license
 * Licensed under the terms of the Apache Public License.
 * Please see the LICENSE included with this distribution for details.
 */

'use strict';

const appc = require('node-appc');
const bplist = require('bplist-parser');
const crypto = require('crypto');
const EventEmitter = require('events').EventEmitter;
const fs = require('fs');

/**
 * Exposes both an event emitter API and a `stop()` method for canceling long
 * running functions such as `trackDevices()` and `log()`.
 */
export class Handle extends EventEmitter {
	constructor() {
		super();

		// add a noop error handler to prevent unhandled error warnings
		this.on('error', () => {});
	}
}

/**
 * Creates an event emitting handle, validates that the platform is OS X,
 * normalizes the 'options' and 'callback' arguments, and passes all
 * these goodies to the 'body' function. It's magik!
 *
 * @param {Object} [options] - An object containing various settings.
 * @param {Function} [callback(err, ...)] - A function to call with the task is complete. This is guaranteed to be called asynchronously.
 * @param {Function} [body] - A function to call with the
 *
 * @returns {Handle}
 */
export function magik(options, callback, body) {
	const handle = new Handle();

	process.nextTick(() => {
		if (typeof options === 'function') {
			callback = options;
			options = {};
		} else if (!options) {
			options = {};
		}
		typeof callback === 'function' || (callback = function () {});

		if (process.platform !== 'darwin') {
			var err = new Error(__('Unsupported platform "%s"', process.platform));
			handle.emit('error', err);
			return callback(err);
		}

		body && body(handle, options, callback);
	});

	return handle;
}

/**
 * MD5 hashes the specified string.
 *
 * @param {String|Buffer} str - The string to hash.
 *
 * @returns {String} The MD5 hash.
 */
export function hash(str) {
	return crypto
		.createHash('md5')
		.update(str || '')
		.digest('hex');
}

/**
 * Parses both ascii and binary plist files and returns a JSON representation.
 *
 * @param {String} file - The path to the plist file.
 *
 * @returns {Object|null} - Returns a JSON representation of the plist file or null if the file does not exist or unable to parse.
 */
export function readPlist(file) {
	try {
		if (fs.existsSync(file)) {
			const buffer = fs.readFileSync(file);
			if (buffer.subarray(0, 'bplist'.length).equals(Buffer.from('bplist'))) {
				return bplist.parseBuffer(buffer)[0];
			} else {
				return new appc.plist().parse(buffer.toString());
			}
		}
	} catch {}
	return null;
}
