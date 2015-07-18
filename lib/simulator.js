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
	plist = require('simple-plist'),
	spawn = require('child_process').spawn,
	Tail = require('always-tail'),
	util = require('util'),
	xcode = require('./xcode'),
	__ = appc.i18n(__dirname).__;

var cache;

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

function listSims(exe, callback) {
	appc.subprocess.run(exe, 'list', function (code, out, err) {
		if (code) {
			return callback(new Error(__('Error running simctl: %s', code)));
		}

		var devicesSection = '== Devices ==',
			p = out.indexOf(devicesSection),
			sims = [];

		if (p !== -1) {
			out = out.substring(p + devicesSection.length).trim().split('\n');

			var i = 0,
				len = out.length,
				m,
				okRE = /^(?:-- (.+) --)|(?: +(.*))$/,
				devRE = /^iOS (\d\.\d(?:\.\d)?)$/,
				simRE = /^(.+?(?= \()) \(([^)]+)\) \(([^)]+)/,
				runtime;

			for (; i < len; i++) {
				m = out[i].match(okRE);
				if (!m) {
					break;
				}

				if (m[1]) {
					m = m[1].match(devRE);
					runtime = m && m[1];
				} else if (m[2] && runtime) {
					if (m = m[2].match(simRE)) {
						sims.push({
							name: m[1],
							deviceType: m[1],
							udid: m[2],
							state: m[3],
							version: runtime,
							// this is prone to error
							supportsWatch: appc.version.gte(runtime, '8.2') && m[1].indexOf('iPhone') !== -1 && m[1].indexOf('iPhone 4') === -1,
							type: m[1].indexOf('iPad') !== -1 ? 'iPad' : 'iPhone',
							logpath: appc.fs.resolvePath('~/Library/Logs/CoreSimulator/' + m[2])
						});
					}
				}
			}
		}

		callback(null, sims)
	});
}

/**
 * Detects iOS simulators.
 *
 * @param {Object} [options] - An object containing various settings.
 * @param {Boolean} [options.bypassCache=false] - When true, re-detects all iOS simulators.
 * @param {String} [options.type] - The type of emulators to return. Can be either "iphone" or "ipad". Defaults to all types.
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

		var results = {
			simulators: {},
			crashDir: appc.fs.resolvePath('~/Library/Logs/DiagnosticReports'),
			issues: []
		};

		xcode.detect(options, function (err, xcodeInfo) {
			if (err) {
				emitter.emit('error', err);
				return callback(err);
			}

			var xcodeIds = Object.keys(xcodeInfo.xcode).filter(function (ver) { return xcodeInfo.xcode[ver].supported; }).sort(function (a, b) { return !xcodeInfo.xcode[a].selected || a > b; }),
				retinaRegExp = /^iPad 2$/i,
				tallRegExp = /^(.*iPad.*|iPhone 4s?)$/i,
				_64bitRegExp = /^(iPhone (4|4s|5)|iPad 2|iPad Retina)$/i;

			function simSort(a, b) {
				if (!a.resizable && b.resizable) return -1;
				if (a.resizable && !b.resizable) return 1;
				if (a.type === 'iphone' && b.type !== 'iphone') return -1;
				if (a.type !== 'iphone' && b.type === 'iphone') return 1;
				if (a.xcode < b.xcode) return -1;
				if (a.xcode > b.xcode) return 1;
				if (!a.retina && b.retina) return -1;
				if (a.retina && !b.retina) return 1;
				if (!a.tall && b.tall) return -1;
				if (a.tall && !b.tall) return 1;
				if (!a['64bit'] && b['64bit']) return -1;
				if (a['64bit'] && !b['64bit']) return 1;
				return 0;
			}

			// for each xcode version, add the sims
			async.each(xcodeIds, function (id, next) {
				var xc = xcodeInfo.xcode[id];

				listSims(xc.executables.simctl, function (err, sims) {
					if (err) {
						return next(err);
					}
					sims.forEach(function (sim) {
						results.simulators[sim.version] || (results.simulators[sim.version] = []);

						if (!results.simulators[sim.version].some(function (s) { return s.udid === sim.udid; })) {
							results.simulators[sim.version].push({
								'deviceType': sim.deviceType,
								'udid': sim.udid,
								'type': sim.type.toLowerCase(),
								'name': sim.name,
								'ios': sim.version,
								'retina': !retinaRegExp.test(sim.deviceType),
								'tall': !tallRegExp.test(sim.deviceType),
								'64bit': !_64bitRegExp.test(sim.deviceType),
								'resizable': sim.deviceType.toLowerCase().indexOf('resizable') !== -1,
								'supportsWatch': !!sim.supportsWatch,
								'xcode': xc.version,
								'xcodePath': xc.path,
								'simulator': xc.executables.simulator,
								'simctl': xc.executables.simctl,
								'systemLog': path.join(sim.logpath, 'system.log'),
								'logPaths': [
									appc.fs.resolvePath('~/Library/Developer/CoreSimulator/Devices/' + sim.udid + '/data/Applications'),
									appc.fs.resolvePath('~/Library/Developer/CoreSimulator/Devices/' + sim.udid + '/data/Containers/Data/Application')
								]
							});
						}

						results.simulators[sim.version].sort(simSort);
					});

					next();
				});
			}, function () {
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
 * @param {String} [options.externalDisplayType] - The type of external display to show. This is mostly used for watch apps. Possible values are `watch-regular`, `watch-compact`, and `carplay`.
 * @param {Boolean} [options.focus=true] - Focus the iOS Simulator after launching. Overrides the "hide" option.
 * @param {Boolean} [options.hide=false] - Hide the iOS Simulator after launching. Useful for testing. Ignored if "focus" option is set to true.
 * @param {Boolean} [options.killIfRunning=false] - Kill the iOS Simulator if already running.
 * @param {String} [options.launchBundleId] - Launches a specific app when the simulator loads. When installing an app, defaults to the app's id unless `launchWatchApp` is set to true.
 * @param {Boolean} [options.launchWatchApp=false] - When true, launches the specified app's watch app on an external display and the main app.
 * @param {Boolean} [options.launchWatchAppOnly=false] - When true, launches the specified app's watch app on an external display and not the main app.
 * @param {String} [options.logFilename] - The name of the log file to search for in the iOS Simulator's "Documents" folder. This file is created after the app is started.
 * @param {String} [options.simType=iphone] - The type of simulator to launch. Must be either "iphone" or "ipad". Only applicable when udid is not specified.
 * @param {String} [options.simVersion] - The iOS version to boot. Defaults to the most recent version.
 * @param {String} [options.watchLaunchMode] - The mode of the watch app to launch. This is used for watch apps. Possible values are `main`, `glance`, and `notification`. When set to `notification`, requires `watchNotificationPayload` to be set.
 * @param {String} [options.watchNotificationPayload] - A path to a file containing the notification payload when `watchLaunchMode` is set to `notification`.
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
			detect(options, function (err, simInfo) {
				if (err) {
					emitter.emit('error', err);
					return callback(err);
				}

				var simHandle,
					appid,
					appName = path.basename(options.appPath).replace(/\.app$/, ''),
					crashFileRegExp = new RegExp('^' + appName + '_\\d{4}\\-\\d{2}\\-\\d{2}\\-\\d{6}_.*\.crash$'),
					existingCrashes = getCrashes();

				if (udid) {
					// validate the udid
					var vers = Object.keys(simInfo.simulators);
					for (var i = 0, l = vers.length; !simHandle && i < l; i++) {
						var sims = simInfo.simulators[vers[i]];
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
								var sims = simInfo.simulators[simVers[j]];
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
						var infoPlist = path.join(options.appPath, 'Info.plist');
						if (!fs.existsSync(infoPlist)) {
							err = new Error(__('Unable to find Info.plist in root of specified app path: ' + infoPlist));
							emitter.emit('error', err);
							return callback(err);
						}

						try {
							appid = bplist.parseBuffer(fs.readFileSync(infoPlist))[0].CFBundleIdentifier;
						} catch (ex) {
							err = new Error(__('Failed to parse app\'s Info.plist: ' + infoPlist));
							emitter.emit('error', err);
							return callback(err);
						}
					}
				} else if (options.launchBundleId) {
					appid = options.launchBundleId;
				}

				// sometimes the simulator doesn't remove old log files in which case we get
				// our logging jacked - we need to remove them before running the simulator
				if (options.logFilename) {
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
					if (fs.existsSync(simInfo.crashDir)) {
						return fs.readdirSync(simInfo.crashDir).filter(function (n) { return crashFileRegExp.test(n); });
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
								return path.join(simInfo.crashDir, file);
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

				function launchSim() {
					var findLogTimer = null,
						logFileTail,
						systemLogTail,
						simProcess;

					emitter.emit('log-debug', __('Running %s', simHandle.simulator + ' -CurrentDeviceUDID ' + simHandle.udid));
					simProcess = spawn(simHandle.simulator, ['-CurrentDeviceUDID', simHandle.udid], { detached: true, stdio: 'ignore' });

					simProcess.on('close', function (code, signal) {
						// stop looking for the log file
						clearTimeout(findLogTimer);

						process.nextTick(function () {
							systemLogTail && systemLogTail.unwatch();
							systemLogTail = null;

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
					});

					// need to wait for the simulator to launch before focusing it calling simctl
					simHandle.startTime = Date.now();
					simHandle.running = false;

					async.whilst(
						function () { return !simHandle.running; },
						function (cb) {
							appc.subprocess.run(simHandle.simctl, 'list', function (code, out, err) {
								if (!code) {
									out.split('\n').some(function (line) {
										if (line.indexOf(simHandle.udid) !== -1 && line.indexOf('(Booted)') !== -1) {
											return simHandle.running = true;
										}
									});
								}
								cb();
							});
						},
						function () {
							var appStarted = false,
								logRegExp = new RegExp(' ' + appName + '\\[(\\d+)\\]: (.*)'),
								crash1RegExp = /^\*\*\* Terminating app/,
								crash2RegExp = new RegExp(' SpringBoard\\[(\\d+)\\]: Application \'.*\:' + appid + '\\[(\\w+)\\]\' crashed'),
								autoExitToken = options.autoExitToken || 'AUTO_EXIT';

							emitter.emit('launched', simHandle);

							// start listening to the system log
							systemLogTail = new Tail(simHandle.systemLog, '\n', { interval: 500 } );
							systemLogTail.on('line', function (line) {
								emitter.emit('log-raw', line);
								if (appStarted) {
									var m = line.match(logRegExp);
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

							// should be running!
							if ((options.focus === undefined && !options.hide && !options.autoExit) || options.focus) {
								// focus the simulator
								emitter.emit('log-debug', __('Running %s', 'osascript "' + path.join(__dirname, 'iphone_sim_activate.scpt') + '" "' + simHandle.simulator + '"'));
								appc.subprocess.run('osascript', [ path.join(__dirname, 'iphone_sim_activate.scpt'), simHandle.simulator ], function () {});
							} else if (options.hide || options.autoExit) {
								emitter.emit('log-debug', __('Running %s', 'osascript "' + path.join(__dirname, 'iphone_sim_hide.scpt') + '" "' + simHandle.simulator + '"'));
								appc.subprocess.run('osascript', [ path.join(__dirname, 'iphone_sim_hide.scpt'), simHandle.simulator ], function () {});
							}

							if (options.appPath && appid) {
								// install the app
								var args = ['install', simHandle.udid, options.appPath];
								emitter.emit('log-debug', __('Running %s', simHandle.simctl + ' ' + args.join(' ')));
								appc.subprocess.run(simHandle.simctl, args, function (code, out, err) {
									if (!options.launchWatchAppOnly) {
										// launch the app
										var args = ['launch', simHandle.udid, appid];
										emitter.emit('log-debug', __('Running %s', simHandle.simctl + ' ' + args.join(' ')));
										appc.subprocess.run(simHandle.simctl, args, function (code, out, err) {
											appStarted = true;
											emitter.emit('app-started', simHandle);
										});
									}

									if (options.launchWatchApp || options.launchWatchAppOnly) {
										/*
										options.externalDisplayType && args.push('--external-display-type', options.externalDisplayType);
										if (options.watchLaunchMode) {
											args.push('--watch-launch-mode', options.watchLaunchMode);
											if (options.watchLaunchMode === 'notification' && options.watchNotificationPayload) {
												if (!fs.existsSync(options.watchNotificationPayload)) {
													var err = new Error(__('Watch notification payload file does not exist: %s', options.watchNotificationPayload));
													emitter.emit('error', err);
													return callback(err);
												}
												args.push('--watch-notification-payload', options.watchNotificationPayload);
											}
										}
										*/
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
													if (fs.existsSync(file = path.join(logPath, /*guid*/files[i], 'Documents', options.logFilename))) {
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

							callback(null, simHandle);
						}
					);
				} // end of launchSim()

				if (options.killIfRunning) {
					stop(simHandle, launchSim);
				} else {
					launchSim();
				}
			});
		});
	});
};

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
			appc.subprocess.run('ps', '-ef', function (code, out, err) {
				if (code) {
					return callback(new Error(__('Failed to get process list (exit code %d)', code)));
				}

				var lines = out.split('\n'),
					i = 0,
					l = lines.length,
					m;

				for (; i < l; i++) {
					if (lines[i].indexOf(simHandle.simulator) !== -1) {
						m = lines[i].match(/^\s*\d+\s+(\d+)/);
						m && process.kill(parseInt(m[1]), 'SIGKILL');
					}
				}

				simHandle.running = false;
				emitter.emit('stopped');
				callback();
			});
		}, Date.now() - simHandle.startTime < 250 ? 250 : 0);
	});
};