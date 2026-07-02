/**
 * Detects iOS developer and distribution certificates and the WWDC certificate.
 *
 * @module device
 *
 * @copyright
 * Copyright (c) 2014-2016 by Appcelerator, Inc. All Rights Reserved.
 *
 * @license
 * Licensed under the terms of the Apache Public License.
 * Please see the LICENSE included with this distribution for details.
 */

import { magik } from './utilities';
import * as iosDevice from 'node-ios-device';
import fs from 'node:fs';

let cache;

/**
 * Detects connected iOS devices.
 *
 * @param {Object} [options] - An object containing various settings.
 * @param {Boolean} [options.bypassCache=false] - When true, re-detects all connected iOS devices.
 *
 * @emits module:device#detected
 * @emits module:device#error
 *
 * @returns {Handle}
 */
export async function detect(options) {
	const handle = new Handle();

	if (cache && !options.bypassCache) {
		const dupe = JSON.parse(JSON.stringify(cache));
		handle.emit('detected', dupe);
		return dupe;
	}

	return magik(options, callback, function (handle, options, callback) {
		iosDevice.devices(function (err, devices) {
			if (err) {
				handle.emit('error', err);
				return callback(err);
			}

			var results = {
				devices: devices,
				issues: [],
			};

			// the cache must be a clean copy that we'll clone for subsequent detect() calls
			// because we can't allow the cache to be modified by reference
			cache = JSON.parse(JSON.stringify(results));

			handle.emit('detected', results);
			return callback(null, results);
		});
	});
}

/**
 * Installs the specified app to an iOS device.
 *
 * @param {String} udid - The UDID of the device to install the app to or null if you want ioslib to pick one.
 * @param {String} appPath - The path to the iOS app to install after launching the iOS Simulator.
 * @param {Object} [options] - An object containing various settings.
 * @param {Boolean} [options.bypassCache=false] - When true, re-detects all iOS simulators.
 * @param {Number} [options.logPort] - A port to connect to in the iOS app and relay log messages from.
 * @param {Number} [options.timeout] - Number of milliseconds to wait before timing out.
 *
 * @emits module:device#app-quit - Only omitted when `options.logPort` is specified and app starts a TCP server.
 * @emits module:device#app-started - Only omitted when `options.logPort` is specified and app starts a TCP server.
 * @emits module:device#disconnect - Only omitted when `options.logPort` is specified and app starts a TCP server.
 * @emits module:device#error
 * @emits module:device#installed
 * @emits module:device#log - Only omitted when `options.logPort` is specified and app starts a TCP server.
 *
 * @returns {Handle}
 */
export function install(udid, appPath, options) {
	return magik(options, null, function (handle, options) {
		if (!appPath) {
			return handle.emit('error', new Error('Missing app path argument'));
		}

		if (!fs.existsSync(appPath)) {
			return handle.emit('error', new Error(`App path does not exist: ${appPath}`));
		}

		handle.stop = function () {}; // for stopping logging

		iosDevice.installApp(udid, appPath, function (err) {
			if (err) {
				return handle.emit('error', err);
			}

			handle.emit('installed');

			if (options.logPort) {
				var logHandle = iosDevice
					.log(udid, options.logPort)
					.on('log', function (msg) {
						handle.emit('log', msg);
					})
					.on('app-started', function () {
						handle.emit('app-started');
					})
					.on('app-quit', function () {
						handle.emit('app-quit');
					})
					.on('disconnect', function () {
						handle.emit('disconnect');
					})
					.on('error', function (err) {
						handle.emit('log-error', err);
					});

				handle.stop = function () {
					logHandle.stop();
				};
			}
		});
	});
}
