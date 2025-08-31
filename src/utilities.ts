import appc from 'node-appc';
import bplist from 'bplist-parser';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Exposes both an event emitter API and a `stop()` method for canceling long
 * running functions such as `trackDevices()` and `log()`.
 */
export class Handle extends EventEmitter {}

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
    var handle = new Handle;
    handle.on('error', function () {});

    process.nextTick(function () {
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
};

/**
 * MD5 hashes the specified string.
 *
 * @param {String|Buffer} str - The string to hash.
 *
 * @returns {String} The MD5 hash.
 */
export function hash(str) {
	return crypto.createHash('md5').update(str || '').digest('hex');
};

/**
 * Parses both ascii and binary plist files and returns a JSON representation.
 *
 * @param {String} file - The path to the plist file.
 *
 * @returns {Object|null} - Returns a JSON representation of the plist file or null if the file does not exist or unable to parse.
 */
export function readPlist(file) {
	try {
		if (existsSync(file)) {
			var buffer = readFileSync(file),
				header = buffer.slice(0, 'bplist'.length).toString('utf8');
			if (header === 'bplist') {
				return bplist.parseBuffer(buffer)[0];
			} else {
				return (new appc.plist()).parse(buffer.toString());
			}
		}
	} catch {}
	return null;
}
