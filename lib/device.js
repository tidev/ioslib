/**
 * Detects connected iOS devices and installs/launches apps on them via
 * `xcrun devicectl` (CoreDevice).
 *
 * The legacy MobileDevice.framework path (node-ios-device) is gone: iOS 17+
 * devices connect exclusively through CoreDevice/RemoteXPC and are invisible
 * to the old API, even over USB. devicectl ships with Xcode 15+.
 *
 * @module device
 *
 * @copyright
 * Copyright TiDev, Inc. 04/07/2022-Present. All Rights Reserved.
 *
 * @license
 * Licensed under the terms of the Apache Public License.
 * Please see the LICENSE included with this distribution for details.
 */

'use strict';

const appc = require('node-appc');
const magik = require('./utilities').magik;
const fs = require('fs');
const os = require('os');
const path = require('path');
const execFile = require('child_process').execFile;
const spawn = require('child_process').spawn;
const __ = appc.i18n(__dirname).__;

var cache;
var jsonFileCounter = 0;

exports.detect = detect;
exports.install = install;
exports.launch = launch;
exports.lockState = lockState;

const EXEC_LIMIT = { maxBuffer: 10 * 1024 * 1024 };

/**
 * Runs a devicectl subcommand and parses its structured JSON output.
 *
 * @param {Array<String>} args - The devicectl arguments.
 * @param {Function} callback(err, result) - A function to call with the parsed `result` object.
 */
function runDevicectl(args, callback) {
	const jsonFile = path.join(os.tmpdir(), 'ioslib-devicectl-' + process.pid + '-' + (jsonFileCounter++) + '.json');
	execFile('xcrun', [ 'devicectl' ].concat(args, [ '--json-output', jsonFile ]), EXEC_LIMIT, function (err, stdout, stderr) {
		var result = null,
			parseErr = null;
		try {
			result = JSON.parse(fs.readFileSync(jsonFile, 'utf8')).result;
		} catch (e) {
			parseErr = e;
		}
		try {
			fs.unlinkSync(jsonFile);
		} catch (e) {
			// ignore
		}
		if (err) {
			return callback(new Error(__('devicectl failed: %s', (stderr || stdout || err.message || '').trim())));
		}
		if (parseErr) {
			return callback(new Error(__('Failed to parse devicectl output: %s', parseErr.message)));
		}
		callback(null, result);
	});
}

/**
 * Detects connected iOS devices.
 *
 * A device is returned when it is a paired, physical iOS device; CoreDevice
 * establishes the tunnel on demand, so a device that currently reports a
 * disconnected tunnel is still usable.
 *
 * @param {Object} [options] - An object containing various settings.
 * @param {Boolean} [options.bypassCache=false] - When true, re-detects all connected iOS devices.
 * @param {Function} [callback(err, results)] - A function to call with the device information.
 *
 * @emits module:device#detected
 * @emits module:device#error
 *
 * @returns {Handle}
 */
function detect(options, callback) {
	return magik(options, callback, function (handle, options, callback) {
		if (cache && !options.bypassCache) {
			var dupe = JSON.parse(JSON.stringify(cache));
			handle.emit('detected', dupe);
			return callback(null, dupe);
		}

		runDevicectl([ 'list', 'devices' ], function (err, result) {
			var results = {
				devices: [],
				issues: []
			};

			if (err) {
				// devicectl requires Xcode 15+; degrade to "no devices" instead of
				// failing the entire ioslib.detect() call
				results.issues.push({
					id: 'IOS_DEVICECTL_LIST_FAILED',
					type: 'warning',
					message: __('Failed to list devices via devicectl.') + '\n' + err.message
				});
			} else {
				(result && result.devices || []).forEach(function (d) {
					var hw = d.hardwareProperties || {},
						props = d.deviceProperties || {},
						conn = d.connectionProperties || {};

					if (hw.reality !== 'physical' || hw.platform !== 'iOS' || conn.pairingState !== 'paired') {
						return;
					}

					results.devices.push({
						udid: hw.udid,
						identifier: d.identifier,
						name: props.name || hw.marketingName || 'Unknown',
						deviceClass: hw.deviceType,
						marketingName: hw.marketingName,
						productType: hw.productType,
						productVersion: props.osVersionNumber,
						buildVersion: props.osBuildUpdate,
						cpuArchitecture: hw.cpuType && hw.cpuType.name,
						connectionType: conn.transportType
					});
				});
			}

			// the cache must be a clean copy that we'll clone for subsequent detect() calls
			// because we can't allow the cache to be modified by reference
			cache = JSON.parse(JSON.stringify(results));

			handle.emit('detected', results);
			return callback(null, results);
		});
	});
}

/**
 * Queries the lock state of the specified device.
 *
 * @param {String} udid - The UDID or CoreDevice identifier of the device.
 * @param {Function} callback(err, locked) - A function to call with the lock state; `locked` is
 * `null` when the state could not be determined (e.g. the device is unreachable).
 */
function lockState(udid, callback) {
	runDevicectl([ 'device', 'info', 'lockState', '--timeout', '20', '--device', udid ], function (err, result) {
		if (err || !result) {
			return callback(err || new Error(__('Unable to determine lock state')), null);
		}
		callback(null, !!result.passcodeRequired);
	});
}

/**
 * Installs the specified app on an iOS device.
 *
 * @param {String} udid - The UDID or CoreDevice identifier of the device to install the app to.
 * @param {String} appPath - The path to the .app directory to install.
 * @param {Object} [options] - An object containing various settings.
 * @param {Number} [options.timeout=90] - Number of seconds to wait before timing out.
 *
 * @emits module:device#error
 * @emits module:device#installed
 *
 * @returns {Handle}
 */
function install(udid, appPath, options) {
	return magik(options, null, function (handle, options) {
		if (!udid) {
			return handle.emit('error', new Error(__('Missing device udid argument')));
		}

		if (!appPath) {
			return handle.emit('error', new Error(__('Missing app path argument')));
		}

		if (!fs.existsSync(appPath)) {
			return handle.emit('error', new Error(__('App path does not exist: ' + appPath)));
		}

		handle.stop = function () {};

		runDevicectl([ 'device', 'install', 'app', '--timeout', String(options.timeout || 90), '--device', udid, appPath ], function (err) {
			if (err) {
				return handle.emit('error', err);
			}
			handle.emit('installed');
		});
	});
}

/**
 * Launches the specified app on an iOS device with the console attached and
 * relays its log output. If the device is locked, waits for it to be unlocked
 * before launching.
 *
 * @param {String} udid - The UDID or CoreDevice identifier of the device.
 * @param {String} bundleId - The id of the app to launch.
 * @param {Object} [options] - An object containing various settings.
 * @param {Boolean} [options.terminateExisting=true] - When true, terminates an already running instance of the app.
 * @param {Number} [options.pollInterval=3000] - Number of milliseconds between lock state checks while waiting for the device to be unlocked.
 *
 * @emits module:device#app-quit - The app (or its console relay) exited; passes the exit code.
 * @emits module:device#app-started - The app was successfully launched.
 * @emits module:device#error
 * @emits module:device#launching - A launch attempt is starting.
 * @emits module:device#locked - The device is locked; launch will proceed once it is unlocked.
 * @emits module:device#log - A line of app log output.
 *
 * @returns {Handle}
 */
function launch(udid, bundleId, options) {
	return magik(options, null, function (handle, options) {
		if (!udid) {
			return handle.emit('error', new Error(__('Missing device udid argument')));
		}

		if (!bundleId) {
			return handle.emit('error', new Error(__('Missing bundle id argument')));
		}

		var child = null,
			stopped = false;

		handle.stop = function () {
			stopped = true;
			if (child) {
				child.kill();
				child = null;
			}
		};

		// devicectl output routing (empirically verified):
		//  - its stdout carries devicectl's own progress lines plus the app's
		//    stdout, and only speaks when the launch actually succeeded
		//  - its stderr carries the app's stderr (i.e. all NSLog output) plus
		//    devicectl's error blocks when the launch failed
		// so stdout activity confirms the launch, and stderr must be buffered
		// until then so a failed launch's error block never leaks into the
		// app log stream
		var DEVICECTL_CHATTER = /^(Launched application with|Waiting for the application to terminate|The app terminated with the exit code)/,
			LOCKED_DENIAL = /BSErrorCodeDescription = Locked|could not be, unlocked/;

		function attempt() {
			if (stopped) {
				return;
			}

			var remainder = '',
				stderrRemainder = '',
				stderrOutput = '',
				pendingStderr = [],
				launched = false,
				args = [ 'devicectl', 'device', 'process', 'launch', '--console' ];

			options.terminateExisting !== false && args.push('--terminate-existing');
			args.push('--device', udid, bundleId);

			handle.emit('launching');

			child = spawn('xcrun', args);

			function confirmLaunched() {
				if (!launched) {
					launched = true;
					handle.emit('app-started');
					pendingStderr.forEach(function (line) {
						handle.emit('log', line);
					});
					pendingStderr = [];
				}
			}

			function emitStderrLine(line) {
				if (launched) {
					handle.emit('log', line);
				} else {
					pendingStderr.push(line);
				}
			}

			child.stdout.on('data', function (data) {
				var lines = (remainder + data.toString()).split('\n');
				remainder = lines.pop();
				lines.forEach(function (line) {
					if (line.trim()) {
						confirmLaunched();
						DEVICECTL_CHATTER.test(line) || handle.emit('log', line);
					}
				});
			});

			child.stderr.on('data', function (data) {
				data = data.toString();
				stderrOutput += data;
				var lines = (stderrRemainder + data).split('\n');
				stderrRemainder = lines.pop();
				lines.forEach(function (line) {
					if (line.trim()) {
						emitStderrLine(line);
					}
				});
			});

			child.on('exit', function (code) {
				child = null;
				if (stopped) {
					return;
				}
				if (remainder.trim()) {
					confirmLaunched();
					DEVICECTL_CHATTER.test(remainder) || handle.emit('log', remainder);
					remainder = '';
				}
				if (stderrRemainder.trim()) {
					emitStderrLine(stderrRemainder);
					stderrRemainder = '';
				}
				if (code && !launched) {
					// launch failed before the app came up; SpringBoard denies the
					// request when the device is locked, so wait for an unlock (the
					// devicectl error text is more reliable than lockState, which
					// can time out on locked devices over wifi)
					if (LOCKED_DENIAL.test(stderrOutput)) {
						return waitForUnlock();
					}
					return lockState(udid, function (err, locked) {
						if (locked) {
							waitForUnlock();
						} else {
							handle.emit('error', new Error(__('Failed to launch app on device (devicectl exit code %s)', code)
								+ (stderrOutput.trim() ? '\n' + stderrOutput.trim() : '')));
						}
					});
				}
				if (!launched) {
					pendingStderr.forEach(function (line) {
						handle.emit('log', line);
					});
					pendingStderr = [];
				}
				handle.emit('app-quit', code);
			});
		}

		function waitForUnlock() {
			handle.emit('locked');
			(function poll() {
				if (stopped) {
					return;
				}
				lockState(udid, function (err, locked) {
					if (locked === false) {
						// only a definitive "unlocked" answer triggers the launch;
						// lockState is flaky on locked devices over wifi and an
						// unknown state must not burn a guaranteed-to-fail attempt
						attempt();
					} else {
						setTimeout(poll, options.pollInterval || 3000);
					}
				});
			}());
		}

		// check the lock state first so we don't burn a guaranteed-to-fail launch attempt
		lockState(udid, function (err, locked) {
			if (locked === true) {
				waitForUnlock();
			} else {
				attempt();
			}
		});
	});
}
