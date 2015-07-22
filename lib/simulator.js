/**
 * Detects iOS developer and distribution certificates and the WWDC certificate.
 *
 * @module simulator
 *
 * @copyright
 * Copyright (c) 2014-2015 by Appcelerator, Inc. All Rights Reserved.
 *
 * @license
 * Licensed under the terms of the Apache Public License.
 * Please see the LICENSE included with this distribution for details.
 */

const
	appc = require('node-appc'),
	async = require('async'),
	bplist = require('bplist-parser'),
	events = require('events'),
	magik = require('./utilities').magik,
	fs = require('fs'),
	path = require('path'),
	spawn = require('child_process').spawn,
	Tail = require('always-tail'),
	util = require('util'),
	xcode = require('./xcode'),
	__ = appc.i18n(__dirname).__;

var cache,
	globalRuntimes = {};

exports.detect = detect;
exports.launch = launch;
exports.stop = stop;
exports.SimulatorCrash = SimulatorCrash;

/**
 * @class
 * @classdesc An exception for when an app crashes in the iOS Simulator.
 * @constructor
 * @param {Array|Object} [crashFiles] - The crash details.
 */
function SimulatorCrash(crashFiles) {
	this.name       = 'SimulatorCrash';
	this.message    = __('App crashed in the iOS Simulator');
	this.crashFiles = Array.isArray(crashFiles) ? crashFiles : crashFiles ? [ crashFiles ] : null;
}
SimulatorCrash.prototype = Object.create(Error.prototype);
SimulatorCrash.prototype.constructor = SimulatorCrash;

const deviceState = exports.deviceState = {
	DOES_NOT_EXIST: -1,
	CREATING: 0,
	SHUTDOWN: 1,
	BOOTING: 2,
	BOOTED: 3,
	SHUTTING_DOWN: 4
};

const deviceStateNames = exports.deviceStateNames = {
	0: 'Creating',
	1: 'Shutdown',
	2: 'Booting',
	3: 'Booted',
	4: 'Shutting Down'
};

function readPlist(file) {
	try {
		if (fs.existsSync(file)) {
			var buffer = fs.readFileSync(file),
				header = buffer.slice(0, 'bplist'.length).toString('utf8');
			if (header === 'bplist') {
				return bplist.parseBuffer(buffer)[0];
			} else {
				return (new appc.plist()).parse(buffer.toString());
			}
		}
	} catch (ex) {
		console.log(ex);
	}
	return null;
}

/**
 * Detects iOS simulators.
 *
 * @param {Object} [options] - An object containing various settings.
 * @param {Boolean} [options.bypassCache=false] - When true, re-detects all iOS simulators.
 * @param {Function} [callback(err, results)] - A function to call with the simulator information.
 *
 * @emits module:simulator#detected
 * @emits module:simulator#error
 *
 * @returns {EventEmitter}
 */
function detect(options, callback) {
	return magik(options, callback, function (emitter, options, callback) {
		if (cache && !options.bypassCache) {
			emitter.emit('detected', cache);
			return callback(null, cache);
		}

		function fakeWatchSim(name, udid, model, xcode) {
			return {
				udid: udid,
				name: name,
				state: 'External Display',
				deviceType: null,
				deviceName: name,
				model: model,
				family: 'watch',
				supportsWatch: false,
				runtime: null,
				runtimeName: 'watchOS 1.0',
				xcode: xcode,
				systemLog: null,
				logPaths: null
			};
		}

		var results = {
			deviceTypes: {},
			runtimes: {},
			ios: {},
			watchos: {},
			devicePairs: {},
			crashDir: appc.fs.resolvePath('~/Library/Logs/DiagnosticReports'),
			issues: []
		};

		xcode.detect(options, function (err, xcodeInfo) {
			if (err) {
				emitter.emit('error', err);
				return callback(err);
			}

			function findRuntimes(dir, xcode) {
				fs.existsSync(dir) && fs.readdirSync(dir).forEach(function (name) {
					var plist = readPlist(path.join(dir, name, 'Contents', 'Info.plist'));
					if (plist && !results.runtimes[plist.CFBundleIdentifier]) {
						var runtime = results.runtimes[plist.CFBundleIdentifier] = {
							name: plist.CFBundleName,
							version: null,
							xcode: xcode || null
						};

						plist = readPlist(path.join(dir, name, 'Contents', 'Resources', 'profile.plist'));
						if (plist) {
							runtime.version = plist.defaultVersionString;
						}
					}
				});
			}

			var xcodeIds = Object.keys(xcodeInfo.xcode).filter(function (ver) { return xcodeInfo.xcode[ver].supported; }).sort(function (a, b) { return !xcodeInfo.xcode[a].selected || a > b; });

			xcodeIds.some(function (id) {
				var xc = xcodeInfo.xcode[id];
				if (appc.version.satisfies(xc.version, '>=6.2 <7.0')) {
					results.watchos['1.0'] = [
						fakeWatchSim('Apple Watch - 38mm', '58045222-F0C1-41F7-A4BD-E2EDCFBCF5B9', 'Watch0,1', id),
						fakeWatchSim('Apple Watch - 42mm', 'D5C1DA2F-7A74-49C8-809A-906E554021B0', 'Watch0,2', id)
					];
					return true;
				}
			});

			// find the runtimes and device types for all Xcodes
			async.eachSeries(xcodeIds, function (id, next) {
				var xc = xcodeInfo.xcode[id];

				['iPhoneSimulator.platform', 'WatchSimulator.platform'].forEach(function (platform) {
					// read in the device types
					var deviceTypesDir = path.join(xc.path, 'Platforms', platform, 'Developer', 'Library', 'CoreSimulator', 'Profiles', 'DeviceTypes');
					fs.existsSync(deviceTypesDir) && fs.readdirSync(deviceTypesDir).forEach(function (name) {
						var plist = readPlist(path.join(deviceTypesDir, name, 'Contents', 'Info.plist'));
						if (plist && !results.deviceTypes[plist.CFBundleIdentifier]) {
							var deviceType = results.deviceTypes[plist.CFBundleIdentifier] = {
								name: plist.CFBundleName,
								model: 'unknown',
								supportsWatch: false,
								xcode: id
							};

							plist = readPlist(path.join(deviceTypesDir, name, 'Contents', 'Resources', 'profile.plist'));
							if (plist) {
								deviceType.model = plist.modelIdentifier;
							}

							plist = readPlist(path.join(deviceTypesDir, name, 'Contents', 'Resources', 'capabilities.plist'));
							if (plist) {
								deviceType.supportsWatch = !!plist.capabilities['watch-companion'];
							}
						}
					});

					// read in the runtimes
					findRuntimes(path.join(xc.path, 'Platforms', platform, 'Developer', 'Library', 'CoreSimulator', 'Profiles', 'Runtimes'), id);
				});

				next();
			}, function () {
				// find all global runtimes
				findRuntimes('/Library/Developer/CoreSimulator/Profiles/Runtimes');

				// read the devices
				var coreSimDir = appc.fs.resolvePath('~/Library/Developer/CoreSimulator/Devices');
				fs.existsSync(coreSimDir) && fs.readdirSync(coreSimDir).forEach(function (name) {
					var plist = readPlist(path.join(coreSimDir, name, 'device.plist'));
					if (plist) {
						var deviceType = results.deviceTypes[plist.deviceType],
							runtime = results.runtimes[plist.runtime];

						if (!deviceType || !runtime) {
							// wrong xcode, skip
							return;
						}

						var family = deviceType.model.replace(/[\W0-9]/g, '').toLowerCase(),
							sdkType = family === 'iphone' || family === 'ipad' ? 'ios' : 'watchos';

						results[sdkType][runtime.version] || (results[sdkType][runtime.version] = []);
						if (!results[sdkType][runtime.version].some(function (s) { return s.udid === plist.UDID; })) {
							results[sdkType][runtime.version].push({
								udid:          plist.UDID,
								name:          plist.name,
								state:         deviceStateNames[plist.state] || 'Unknown',

								deviceType:    plist.deviceType,
								deviceName:    deviceType.name,
								model:         deviceType.model,
								family:        family,
								supportsWatch: deviceType.supportsWatch,

								runtime:       plist.runtime,
								runtimeName:   runtime.name,

								xcode:         deviceType.xcode,

								systemLog:     appc.fs.resolvePath('~/Library/Logs/CoreSimulator/' + plist.UDID + '/system.log'),
								logPaths: [
									appc.fs.resolvePath('~/Library/Developer/CoreSimulator/Devices/' + plist.UDID + '/data/Applications'),
									appc.fs.resolvePath('~/Library/Developer/CoreSimulator/Devices/' + plist.UDID + '/data/Containers/Data/Application')
								]
							});
						}
					}
				});

				// sort the simulators
				['ios', 'watchos'].forEach(function (type) {
					Object.keys(results[type]).forEach(function (ver) {
						results[type][ver].sort(function (a, b) { return a.model < b.model ? -1 : a.model > b.model ? 1 : 0; });
					});
				});

				// load the device pairs
				var deviceSetPlist = readPlist(path.join(coreSimDir, 'device_set.plist'));
				if (deviceSetPlist && deviceSetPlist.DevicePairs) {
					Object.keys(deviceSetPlist.DevicePairs).forEach(function (udid) {
						results.devicePairs[udid] = {
							phone: deviceSetPlist.DevicePairs[udid].companion,
							watch: deviceSetPlist.DevicePairs[udid].gizmo
						};
					});
				}

				cache = results;
				emitter.emit('detected', results);
				callback(null, results);
			});
		});
	});
};

/**
 * Launches the specified iOS Simulator or picks one automatically.
 *
 * @param {String} udid - The UDID of the iOS Simulator to launch or null if you want ioslib to pick one.
 * @param {Object} [options] - An object containing various settings.
 * @param {String} [options.appPath] - The path to the iOS app to install after launching the iOS Simulator.
 * @param {Boolean} [options.autoExit=false] - When "appPath" has been specified, causes the iOS Simulator to exit when the autoExitToken has been emitted to the log output.
 * @param {String} [options.autoExitToken=AUTO_EXIT] - A string to watch for to know when to quit the iOS simulator when "appPath" has been specified.
 * @param {Boolean} [options.bypassCache=false] - When true, re-detects all iOS simulators.
 * @param {Boolean} [options.focus=true] - Focus the iOS Simulator after launching. Overrides the "hide" option.
 * @param {Boolean} [options.hide=false] - Hide the iOS Simulator after launching. Useful for testing. Ignored if "focus" option is set to true.
 * @param {Boolean} [options.killIfRunning=false] - Kill the iOS Simulator if already running.
 * @param {String} [options.launchBundleId] - Launches a specific app when the simulator loads. When installing an app, defaults to the app's id unless `launchWatchApp` is set to true.
 * @param {Boolean} [options.launchWatchApp=false] - When true, launches the specified app's watch app on an external display and the main app.
 * @param {Boolean} [options.launchWatchAppOnly=false] - When true, launches the specified app's watch app on an external display and not the main app.
 * @param {String} [options.logFilename] - The name of the log file to search for in the iOS Simulator's "Documents" folder. This file is created after the app is started.
 * @param {String} [options.simType=iphone] - The type of simulator to launch. Must be either "iphone" or "ipad". Only applicable when udid is not specified.
 * @param {String} [options.simVersion] - The iOS version to boot. Defaults to the most recent version.
 * @param {String} [options.watchUDID] - The UDID of the Watch Simulator to launch or null if your app has a watch app and you want ioslib to pick one.
 * @param {String} [options.watchAppName] - The name of the watch app to install. If omitted, automatically picks the watch app.
 * @param {Function} [callback(err, simHandle)] - A function to call when the simulator has launched.
 *
 * @emits module:simulator#app-quit
 * @emits module:simulator#app-started
 * @emits module:simulator#error
 * @emits module:simulator#launched
 * @emits module:simulator#log
 * @emits module:simulator#log-debug
 * @emits module:simulator#log-file
 * @emits module:simulator#log-raw
 *
 * @returns {EventEmitter}
 */
function launch(udid, options, callback) {
	return magik(options, callback, function (emitter, options, callback) {
		if (!options.appPath && (options.launchWatchApp || options.launchWatchAppOnly)) {
			var err = new Error(
				options.launchWatchAppOnly
					? __('You must specify an appPath when launchWatchApp is true.')
					: __('You must specify an appPath when launchWatchAppOnly is true.')
				);
			emitter.emit('error', err);
			return callback(err);
		}

		// detect xcodes
		xcode.detect(options, function (err, xcodeInfo) {
			if (err) {
				emitter.emit('error', err);
				return callback(err);
			}

			// detect the simulators
			detect(options, function (err, simulators) {
				if (err) {
					emitter.emit('error', err);
					return callback(err);
				}

				var simHandle,
					appId,
					watchAppId,
					watchOSVersion,
					appName = path.basename(options.appPath).replace(/\.app$/, ''),
					crashFileRegExp = new RegExp('^' + appName + '_\\d{4}\\-\\d{2}\\-\\d{2}\\-\\d{6}_.*\.crash$'),
					existingCrashes = getCrashes();

				if (udid) {
					// validate the udid
					var vers = Object.keys(simulators.ios);
					for (var i = 0, l = vers.length; !simHandle && i < l; i++) {
						var sims = simulators.ios[vers[i]];
						for (var j = 0, k = sims.length; j < k; j++) {
							if (sims[j].udid === udid) {
								simHandle = sims[j];
								break;
							}
						}
					}

					if (!simHandle) {
						err = new Error(__('Unable to find an iOS Simulator with the UDID "%s".', options.udid));
					} else if ((options.launchWatchApp || options.launchWatchAppOnly) && !simHandle.supportsWatch) {
						err = new Error(__('Selected iOS Simulator with the UDID "%s" does not support watch extensions.', options.udid));
					}
				} else {
					// pick one
					var xcodeIds = Object
						.keys(xcodeInfo.xcode)
						.filter(function (ver) { return xcodeInfo.xcode[ver].supported; })
						.sort(function (a, b) { return !xcodeInfo.xcode[a].selected || a > b; });

					// loop through xcodes
					for (var i = 0; !simHandle && i < xcodeIds.length; i++) {
						var simVers = xcodeInfo.xcode[xcodeIds[i]].sims;
						// loop through each xcode simulators
						for (var j = 0; !simHandle && j < simVers.length; j++) {
							if (!options.simVersion || simVers[j] === options.simVersion) {
								var sims = simulators.ios[simVers[j]];
								// loop through each simulator
								for (var k = 0; !simHandle && k < sims.length; k++) {
									if (!options.simType || sims[k].type === options.simType) {
										// lastly, if we're installing a watch extension, make sure we pick a simulator that supports the watch
										if (!options.appPath || !(options.launchWatchApp || options.launchWatchAppOnly) || sims[k].supportsWatch) {
											simHandle = sims[k];
										}
									}
								}
							}
						}
					}

					if (!simHandle) {
						// user experience!
						if (options.simVersion) {
							err = new Error(__('Unable to find an iOS Simulator running iOS %s.', options.simVersion));
						} else {
							err = new Error(__('Unable to find an iOS Simulator.'));
						}
					}
				}

				if (err) {
					emitter.emit('error', err);
					return callback(err);
				}

				if (options.appPath) {
					if (!fs.existsSync(options.appPath)) {
						err = new Error(__('App path does not exist: ' + options.appPath));
						emitter.emit('error', err);
						return callback(err);
					}

					if (!options.launchBundleId) {
						// get the app's id
						var infoPlist = path.join(options.appPath, 'Info.plist');
						if (!fs.existsSync(infoPlist)) {
							err = new Error(__('Unable to find Info.plist in root of specified app path: ' + infoPlist));
							emitter.emit('error', err);
							return callback(err);
						}

						var plist = readPlist(infoPlist);
						if (plist && plist.CFBundleIdentifier) {
							appId = plist.CFBundleIdentifier;
						} else {
							err = new Error(__('Failed to parse app\'s Info.plist: ' + infoPlist));
							emitter.emit('error', err);
							return callback(err);
						}
					}

					if (options.launchWatchApp || options.launchWatchAppOnly) {
						// look for WatchKit v1 apps
						var pluginsDir = path.join(options.appPath, 'PlugIns');
						fs.existsSync(pluginsDir) && fs.readdirSync(pluginsDir).some(function (name) {
							var extDir = path.join(pluginsDir, name);
							if (fs.existsSync(extDir) && fs.statSync(extDir).isDirectory() && /\.appex$/.test(name)) {
								return fs.readdirSync(extDir).some(function (name) {
									var appDir = path.join(extDir, name);
									if (fs.existsSync(appDir) && fs.statSync(appDir).isDirectory() && /\.app$/.test(name)) {
										var plist = readPlist(path.join(appDir, 'Info.plist'));
										if (plist && plist.WKWatchKitApp && (!options.watchAppName || fs.existsSync(path.join(appDir, options.watchAppName)))) {
											watchAppId = plist.CFBundleIdentifier;
											watchOSVersion = '1.0';
											return true;
										}
									}
								});
							}
						});

						if (!watchAppId) {
							// look for WatchKit v2 apps
							var watchDir = path.join(options.appPath, 'Watch');
							fs.existsSync(watchDir) && fs.readdirSync(watchDir).forEach(function (name) {
								var plist = readPlist(path.join(watchDir, name, 'Info.plist'));
								if (plist && (plist.DTPlatformName === 'watchos' || plist.WKWatchKitApp) && (!options.watchAppName || fs.existsSync(path.join(watchDir, options.watchAppName)))) {
									watchAppId = plist.CFBundleIdentifier;
									watchOSVersion = plist.DTPlatformVersion;
								}
							});
						}
					}
				} else if (options.launchBundleId) {
					appId = options.launchBundleId;
				}

				// sometimes the simulator doesn't remove old log files in which case we get
				// our logging jacked - we need to remove them before running the simulator
				if (options.logFilename && Array.isArray(simHandle.logPaths)) {
					simHandle.logPaths.forEach(function (logPath) {
						fs.existsSync(logPath) && fs.readdirSync(logPath).forEach(function (guid) {
							var file = path.join(logPath, guid, 'Documents', options.logFilename);
							if (fs.existsSync(file)) {
								emitter.emit('log-debug', __('Removing old log file: %s', file));
								fs.unlinkSync(file);
							}
						});
					});
				}

				function getCrashes() {
					if (fs.existsSync(simulators.crashDir)) {
						return fs.readdirSync(simulators.crashDir).filter(function (n) { return crashFileRegExp.test(n); });
					}
					return [];
				}

				function checkIfCrashed() {
					var crashes = getCrashes(),
						diffCrashes = crashes
							.filter(function (file) {
								return existingCrashes.indexOf(file) === -1;
							})
							.map(function (file) {
								return path.join(simulators.crashDir, file);
							})
							.sort();

					if (diffCrashes.length) {
						// when a crash occurs, we need to provide the plist crash information as a result object
						diffCrashes.forEach(function (crashFile) {
							emitter.emit('log-debug', __('Detected crash file: %s', crashFile));
						});
						emitter.emit('app-quit', new SimulatorCrash(diffCrashes));
						return true;
					}

					return false;
				}

				if (options.killIfRunning !== false) {
					stop(simHandle, launchSim);
				} else {
					launchSim();
				}

				function launchSim() {
					var findLogTimer = null,
						logFileTail,
						haveWatchApp = false,
						watchSimHandle;
console.log();
dump(simHandle);
console.log();
console.log('appPath =', options.appPath);
console.log('appId =', appId);
console.log();
console.log('options.launchWatchApp =', options.launchWatchApp);
console.log('options.launchWatchAppOnly =', options.launchWatchAppOnly);
console.log();
console.log('watchAppId =', watchAppId);
console.log('watchOSVersion = ', watchOSVersion);
console.log();

					simHandle.startTime = Date.now();
					simHandle.running = false;

					if (simHandle.watchsimulator && options.appPath && appId && options.launchWatchApp) {
						// does the app have a watch app?
						// what is the watch app's id?
					}


process.exit(0);

/*
					function simStarted() {
						// focus or hide the simulator
						if ((options.focus === undefined && !options.hide && !options.autoExit) || options.focus) {
							var args = [
								path.join(__dirname, 'iphone_sim_activate.scpt'),
								path.basename(simHandle.simulator)
							];
							if (!simHandle.watchsimulator) {
								// Xcode 6... we need to show the external display via the activate script
								if (options.appPath && appId && (options.launchWatchApp || options.launchWatchAppOnly)) {
									args.push(options.externalDisplayType === 'watch-regular' ? 'Apple Watch - 42mm' : 'Apple Watch - 38mm');
								} else {
									args.push('Disabled');
								}
							}
							emitter.emit('log-debug', __('Running %s', 'osascript "' + args.join('" "') + '"'));
							appc.subprocess.run('osascript', args, function () {});
						} else if (options.hide || options.autoExit) {
							emitter.emit('log-debug', __('Running %s', 'osascript "' + path.join(__dirname, 'iphone_sim_hide.scpt') + '" "' + simHandle.simulator + '"'));
							appc.subprocess.run('osascript', [ path.join(__dirname, 'iphone_sim_hide.scpt'), simHandle.simulator ], function () {});
						}

						if (!options.appPath || !appId) {
							return callback(null, simHandle);
						}

						if (simHandle.watchsimulator) {
							// Xcode 7 or newer we need to launch the watch simulator
						}

						// install the app
						args = ['install', simHandle.udid, options.appPath];
						emitter.emit('log-debug', __('Running %s', simHandle.simctl + ' ' + args.join(' ')));
						appc.subprocess.run(simHandle.simctl, args, function (code, out, err) {
							if (!options.launchWatchAppOnly) {
								// launch the app
								var args = ['launch', simHandle.udid, appId];
								emitter.emit('log-debug', __('Running %s', simHandle.simctl + ' ' + args.join(' ')));
								appc.subprocess.run(simHandle.simctl, args, function (code, out, err) {
									appStarted = true;
									emitter.emit('app-started', simHandle);
								});
							}

							if (options.launchWatchApp || options.launchWatchAppOnly) {
								// launch the watch app
								var args = ['launch', simHandle.udid, appId];
								emitter.emit('log-debug', __('Running %s', simHandle.simctl + ' ' + args.join(' ')));
								appc.subprocess.run(simHandle.simctl, args, function (code, out, err) {
									appStarted = true;
									emitter.emit('app-started', simHandle);
								});
							}
						});

						if (options.logFilename) {
							// we are installing an app and we found the simulator log directory, now we just
							// need to find the log file
							(function findLogFile() {
								var found = false;
								// scan all log paths
								simHandle.logPaths.forEach(function (logPath) {
									if (fs.existsSync(logPath)) {
										var files = fs.readdirSync(logPath),
											i = 0,
											l = files.length,
											file, appDir, stat, dt, docs, j, k;

										for (; i < l; i++) {
											if (fs.existsSync(file = path.join(logPath, /*guid*




											/files[i], 'Documents', options.logFilename))) {
												emitter.emit('log-debug', __('Found application log file: %s', file));
												logFileTail = new Tail(file, '\n', { interval: 500 } );
												logFileTail.on('line', function (msg) {
													emitter.emit('log-file', msg);
												});
												logFileTail.watch();
												found = true;
												return;
											}
										}
									}
								});

								// try again
								if (!found) {
									findLogTimer = setTimeout(findLogFile, 250);
								}
							})();
						}
					}

					function simStopped() {
						// stop looking for the log file
						clearTimeout(findLogTimer);

						process.nextTick(function () {
							logFileTail && logFileTail.unwatch();
							logFileTail = null;
						});

						// wait 1 second for the potential crash log to be written
						setTimeout(function () {
							// did we crash?
							if (!checkIfCrashed()) {
								emitter.emit('log-debug', __('Exited with code: %s', code));
								emitter.emit('app-quit', code);
							}
						}, 1000);
					}

					// are we installing an app?
					//   does it have a watch app?
					//     if so, are we running xcode 7+?
					//       if so, are we paired?
					//         if not, pair the sims
					//   start the ios sim
					//   tail the logs
					//   are we launching a watch app?
					//     start the watch sim
					//     tail the logs
					//   install the apps
					// else
					//   start the ios simulator
					//   tail the log

					startSimulator(simHandle, simStarted, simStopped);
*/
				}

				function startSimulator(simHandle, onStart, onStop) {
					emitter.emit('log-debug', __('Running %s', simHandle.simulator + ' -CurrentDeviceUDID ' + simHandle.udid));

					var simProcess = spawn(simHandle.simulator, ['-CurrentDeviceUDID', simHandle.udid], { detached: true, stdio: 'ignore' }),
						systemLogTail,
						running = false;

					simProcess.on('close', function (code, signal) {
						process.nextTick(function () {
							systemLogTail && systemLogTail.unwatch();
							systemLogTail = null;
						});

						onStop && onStop();
					});

					// need to wait for the simulator to launch before focusing it calling simctl
					async.whilst(
						function () { return !running; },
						function (cb) {
							appc.subprocess.run(simHandle.simctl, 'list', function (code, out, err) {
								if (!code && out.split('\n').some(function (line) {
									if (line.indexOf(simHandle.udid) !== -1 && line.indexOf('(Booted)') !== -1) {
										return running = true;
									}
								})) {
									return cb();
								}
								setTimeout(cb, 250);
							});
						},
						function () {
							var appStarted = false,
								systemLogRegExp = new RegExp(' ' + appName + '\\[(\\d+)\\]: (.*)'),
								crash1RegExp = /^\*\*\* Terminating app/,
								crash2RegExp = new RegExp(' SpringBoard\\[(\\d+)\\]: Application \'.*\:' + appId + '\\[(\\w+)\\]\' crashed'),
								autoExitToken = options.autoExitToken || 'AUTO_EXIT';

							// start listening to the system log
							if (simHandle.systemLog) {
								systemLogTail = new Tail(simHandle.systemLog, '\n', { interval: 500 } );
								systemLogTail.on('line', function (line) {
									emitter.emit('log-raw', line);
									if (appStarted) {
										var m = line.match(systemLogRegExp);
										if (m) {
											emitter.emit('log', m[2]);
											options.autoExit && m[2].indexOf(autoExitToken) !== -1 && stop(simHandle);
										}
										if ((m && crash1RegExp.test(m[2])) || crash2RegExp.test(line)) {
											// wait 1 second for the potential crash log to be written
											setTimeout(function () {
												// did we crash?
												checkIfCrashed();
											}, 1000);
										}
									}
								});
								systemLogTail.watch();
							}

							simHandle.running = true;
							emitter.emit('launched', simHandle);
							onStart && onStart();
						}
					);
				}
			});
		});
	});
};

/**
 * Determines if the iOS Simulator is running by scanning the output of the `ps` command.
 *
 * @param {String} proc - The path of the executable to find the pid for
 * @param {Function} callback - A function to call with the pid
 */
function isRunning(proc, callback) {
	appc.subprocess.run('ps', '-ef', function (code, out, err) {
		if (code) {
			return callback(new Error(__('Failed to get process list (exit code %d)', code)));
		}

		var lines = out.split('\n'),
			i = 0,
			l = lines.length,
			m,
			procRE = /^\s*\d+\s+(\d+)/;

		for (; i < l; i++) {
			if (lines[i].indexOf(proc) !== -1) {
				m = lines[i].match(procRE);
				return callback(null, m ? parseInt(m[1]) : null);
			}
		}

		callback(null, false);
	});
}

/**
 * Stops the specified iOS Simulator.
 *
 * @param {Object} simHandle - The simulator handle.
 * @param {Function} [callback(err)] - A function to call when the simulator has quit.
 *
 * @emits module:simulator#error
 * @emits module:simulator#stopped
 *
 * @returns {EventEmitter}
 */
function stop(simHandle, callback) {
	return magik(null, callback, function (emitter, options, callback) {
		if (!simHandle || typeof simHandle !== 'object') {
			var err = new Error(__('Invalid simulator handle argument'));
			emitter.emit('error', err);
			return callback(err);
		}

		// make sure the simulator has had some time to launch
		setTimeout(function () {
			isRunning(simHandle.simulator, function (err, pid) {
				if (err) {
					callback(err);
				} else if (pid) {
					process.kill(pid, 'SIGKILL');
				}

				simHandle.running = false;
				emitter.emit('stopped');
				callback();
			});
		}, simHandle.startTime && Date.now() - simHandle.startTime < 250 ? 250 : 0);
	});
};