/**
 * Detects Xcode installs and their iOS SDKs.
 *
 * @module xcode
 *
 * @copyright
 * Copyright (c) 2014-2018 by Appcelerator, Inc. All Rights Reserved.
 *
 * Copyright (c) 2010-2014 Digital Bazaar, Inc.
 * {@link https://github.com/digitalbazaar/forge}
 *
 * @license
 * Licensed under the terms of the Apache Public License.
 * Please see the LICENSE included with this distribution for details.
 */

const
	appc = require('node-appc'),
	async = require('async'),
	env = require('./env'),
	hash = require('./utilities').hash,
	magik = require('./utilities').magik,
	fs = require('fs'),
	path = require('path'),
	readPlist = require('./utilities').readPlist,
	simctl = require('./simctl'),
	__ = appc.i18n(__dirname).__;

var cache,
	detecting = {},
	waiting = [];

/**
 * A lookup table of valid iOS Simulator -> Watch Simulator pairings.
 *
 * This table MUST be maintained!
 *
 * The actual device pairing is done by the CoreSimulator private framework.
 * I have no idea how it determines what iOS Simulators are compatible with
 * what Watch Simulator. It's a mystery!
 */
const simulatorDevicePairCompatibility = {
	'>=6.2 <7.0': {             // Xcode 6.2, 6.3, 6.4
		'>=8.2 <9.0': {         // iOS 8.2, 8.3, 8.4
			'1.x': true         // watchOS 1.0
		}
	},
	'7.x': {                    // Xcode 7.x
		'>=8.2 <9.0': {         // iOS 8.2, 8.3, 8.4
			'1.x': true         // watchOS 1.0
		},
		'>=9.0 <=9.2': {        // iOS 9.0, 9.1, 9.2
			'>=2.0 <=2.1': true // watchOS 2.0, 2.1
		},
		'>=9.3 <10': {          // iOS 9.3
			'2.2': true         // watchOS 2.2
		}
	},
	'8.x': {                    // Xcode 8.x
		'>=9.0 <=9.2': {        // iOS 9.0, 9.1, 9.2
			'>=2.0 <=2.1': true // watchOS 2.0, 2.1
		},
		'>=9.3 <10': {          // iOS 9.x
			'2.2': true,        // watchOS 2.2
			'3.x': true         // watchOS 3.x
		},
		'10.x': {               // iOS 10.x
			'2.2': true,        // watchOS 2.2
			'3.x': true         // watchOS 3.x
		}
	},
	'9.x': {                    // Xcode 9.x
		'>=9.0 <=9.2': {        // iOS 9.0, 9.1, 9.2
			'>=2.0 <=2.1': true // watchOS 2.0, 2.1
		},
		'>=9.3 <10': {          // iOS 9.x
			'2.2': true,        // watchOS 2.2
			'3.x': true         // watchOS 3.x
		},
		'10.x': {               // iOS 10.x
			'2.2': true,        // watchOS 2.2
			'3.x': true         // watchOS 3.x
		},
		'11.x': {               // iOS 11.x
			'>=3.2 <4.0': true, // watchOS 3.2
			'4.x': true         // watchOS 4.x
		}
	},
	'10.x <10.3': {             // Xcode 10.0-10.2.1
		'8.x': {},              // iOS 8.x
		'>=9.0 <=9.2': {        // iOS 9.0, 9.1, 9.2
			'>=2.0 <=2.1': true // watchOS 2.0, 2.1
		},
		'>=9.3 <10': {          // iOS 9.x
			'2.2': true,        // watchOS 2.2
			'3.x': true         // watchOS 3.x
		},
		'>=10.0 <=10.2': {      // iOS 10.0, 10.1, 10.2
			'2.2': true,        // watchOS 2.2
			'3.x': true         // watchOS 3.x
		},
		'>=10.3 <11': {         // iOS 10.3
			'3.x': true         // watchOS 3.x
		},
		'11.x': {               // iOS 11.x
			'>=3.2 <4.0': true, // watchOS 3.2
			'4.x': true         // watchOS 4.x
		},
		'12.x': {               // iOS 12.x
			'>=3.2 <4.0': true, // watchOS 3.2
			'4.x': true,        // watchOS 4.x
			'5.x': true         // watchOS 5.x
		}
	},
	'>=10.3 <11': {
		'>=10.3 <11': {         // iOS 10.3
			'3.x': true         // watchOS 3.x
		},
		'11.x': {               // iOS 11.x
			'>=3.2 <4.0': true, // watchOS 3.2
			'4.x': true         // watchOS 4.x
		},
		'12.x': {		        // iOS 12.x
			'4.x': true,        // watchOS 4.x
			'5.x': true         // watchOS 5.x
		}
	},
	'11.x': {                   // Xcode 11.x
		'>=10.3 <11': {         // iOS 10.3
			'2.2': true,        // watchOS 2.2
			'3.x': true         // watchOS 3.x
		},
		'11.x': {               // iOS 11.x
			'>=3.2 <4.0': true, // watchOS 3.2
			'4.x': true         // watchOS 4.x
		},
		'12.x': {               // iOS 12.x
			'4.x': true,        // watchOS 4.x
			'5.x': true,        // watchOS 5.x
			'6.x': true         // watchOS 6.x
		},
		'13.x': {               // iOS 13.x
			'4.x': true,        // watchOS 4.x
			'5.x': true,        // watchOS 5.x
			'6.x': true         // watchOS 6.x
		}
	},
	'12.x': {                   // Xcode 12.x
		'>=10.3 <11': {         // iOS 10.x
			'2.2': true,        // watchOS 2.2
			'3.x': true         // watchOS 3.x
		},
		'11.x': {               // iOS 11.x
			'>=3.2 <4.0': true, // watchOS 3.2
			'4.x': true         // watchOS 4.x
		},
		'12.x': {               // iOS 12.x
			'4.x': true,        // watchOS 4.x
			'5.x': true,        // watchOS 5.x
			'6.x': true,        // watchOS 6.x
			'7.x': true         // watchOS 7.x
		},
		'13.x': {               // iOS 13.x
			'4.x': true,        // watchOS 4.x
			'5.x': true,        // watchOS 5.x
			'6.x': true,        // watchOS 6.x
			'7.x': true         // watchOS 7.x
		},
		'14.x': {               // iOS 14.x
			'4.x': true,        // watchOS 4.x
			'5.x': true,        // watchOS 5.x
			'6.x': true,        // watchOS 6.x
			'7.x': true         // watchOS 7.x
		}
	},
	'13.x': {                   // Xcode 13.x
		'>=10.3 <11': {         // iOS 10.x
			'2.2': true,        // watchOS 2.2
			'3.x': true         // watchOS 3.x
		},
		'11.x': {               // iOS 11.x
			'>=3.2 <4.0': true, // watchOS 3.2
			'4.x': true         // watchOS 4.x
		},
		'12.x': {               // iOS 12.x
			'4.x': true,        // watchOS 4.x
			'5.x': true,        // watchOS 5.x
			'6.x': true,        // watchOS 6.x
			'7.x': true,        // watchOS 7.x
			'8.x': true         // watchOS 8.x
		},
		'13.x': {               // iOS 13.x
			'4.x': true,        // watchOS 4.x
			'5.x': true,        // watchOS 5.x
			'6.x': true,        // watchOS 6.x
			'7.x': true,        // watchOS 7.x
			'8.x': true         // watchOS 8.x
		},
		'14.x': {               // iOS 14.x
			'4.x': true,        // watchOS 4.x
			'5.x': true,        // watchOS 5.x
			'6.x': true,        // watchOS 6.x
			'7.x': true,        // watchOS 7.x
			'8.x': true         // watchOS 8.x
		},
		'15.x': {
			'4.x': true,        // watchOS 4.x
			'5.x': true,        // watchOS 5.x
			'6.x': true,        // watchOS 6.x
			'7.x': true,        // watchOS 7.x
			'8.x': true         // watchOS 8.x
		}
	},
	'14.x': {                   // Xcode 14.x
		'12.x': {               // iOS 12.x
			'7.x': true,        // watchOS 7.x
			'8.x': true,        // watchOS 8.x
			'9.x': true			// watchOS 9.x
		},
		'13.x': {               // iOS 13.x
			'7.x': true,        // watchOS 7.x
			'8.x': true,        // watchOS 8.x
			'9.x': true			// watchOS 9.x
		},
		'14.x': {               // iOS 14.x
			'7.x': true,        // watchOS 7.x
			'8.x': true,        // watchOS 8.x
			'9.x': true			// watchOS 9.x
		},
		'15.x': {
			'7.x': true,        // watchOS 7.x
			'8.x': true,        // watchOS 8.x
			'9.x': true			// watchOS 9.x
		},
		'16.x': {
			'7.x': true,        // watchOS 7.x
			'8.x': true,        // watchOS 8.x
			'9.x': true			// watchOS 9.x
		}
	},
	'15.x': {                   // Xcode 15.x
		'13.x': {               // iOS 13.x
			'7.x': true,        // watchOS 7.x
			'8.x': true,        // watchOS 8.x
			'9.x': true,		// watchOS 9.x
			'10.x': true		// watchOS 10.x
		},
		'14.x': {               // iOS 14.x
			'7.x': true,        // watchOS 7.x
			'8.x': true,        // watchOS 8.x
			'9.x': true,		// watchOS 9.x
			'10.x': true		// watchOS 10.x
		},
		'15.x': {
			'7.x': true,        // watchOS 7.x
			'8.x': true,        // watchOS 8.x
			'9.x': true,		// watchOS 9.x
			'10.x': true		// watchOS 10.x
		},
		'16.x': {
			'7.x': true,        // watchOS 7.x
			'8.x': true,        // watchOS 8.x
			'9.x': true,		// watchOS 9.x
			'10.x': true		// watchOS 10.x
		},
		'17.x': {
			'7.x': true,        // watchOS 7.x
			'8.x': true,        // watchOS 8.x
			'9.x': true,		// watchOS 9.x
			'10.x': true		// watchOS 10.x
		}
	},
	'16.x': {                   // Xcode 16.x
		'15.x': {				// iOS 15.x
			'8.x': true,        // watchOS 8.x
			'9.x': true,		// watchOS 9.x
			'10.x': true,		// watchOS 10.x
			'11.x': true,		// watchOS 11.x
		},
		'16.x': {				// iOS 16.x
			'8.x': true,        // watchOS 8.x
			'9.x': true,		// watchOS 9.x
			'10.x': true,		// watchOS 10.x
			'11.x': true,		// watchOS 11.x
		},
		'17.x': {				// iOS 18.x
			'8.x': true,        // watchOS 8.x
			'9.x': true,		// watchOS 9.x
			'10.x': true,		// watchOS 10.x
			'11.x': true,		// watchOS 11.x
		},
		'18.x': {				// iOS 18.x
			'8.x': true,        // watchOS 8.x
			'9.x': true,		// watchOS 9.x
			'10.x': true,		// watchOS 10.x
			'11.x': true,		// watchOS 11.x
		}
	}
};

/**
 * Detects Xcode installations.
 *
 * @param {Object} [options] - An object containing various settings.
 * @param {Boolean} [options.bypassCache=false] - When true, re-detects all Xcode installations.
 * @param {String|Array<String>} [options.searchPath] - One or more path to scan for Xcode installations.
 * @param {String} [options.minTVosVersion] - The minimum AppleTV SDK to detect.
 * @param {String} [options.minIosVersion] - The minimum iOS SDK to detect.
 * @param {String} [options.minWatchosVersion] - The minimum WatchOS SDK to detect.
 * @param {String} [options.sqlite] - Path to the <code>sqlite</code> executable (most likely named sqlite3)
 * @param {String} [options.supportedVersions] - A string with a version number or range to check if an Xcode install is supported.
 * @param {Function} [callback(err, results)] - A function to call with the Xcode information.
 *
 * @emits module:xcode#detected
 * @emits module:xcode#error
 *
 * @returns {Handle}
 */
exports.detect = function detect(options, callback) {
	var hopt = hash(JSON.stringify(options));
	if (detecting[hopt]) {
		waiting.push(callback);
		return detecting[hopt];
	}

	return detecting[hopt] = magik(options, callback, function (emitter, options, callback) {
		waiting.push(callback);

		function fireCallbacks(err, result) {
			delete detecting[hopt];
			var w;
			while (w = waiting.shift()) {
				w(err, result);
			}
		}

		if (cache && !options.bypassCache) {
			emitter.emit('detected', cache);
			return fireCallbacks(null, cache);
		}

		function findSimRuntimes(dir) {
			var runtimes = {};

			// regex to extract the version from the runtime name
			var runtimeNameRegExp = /\s(\d+(?:\.\d+(?:\.\d+)?)?)$/;

			fs.existsSync(dir) && fs.readdirSync(dir).forEach(function (name) {
				var x = path.join(dir, name, 'Contents', 'Info.plist');
				var plist = readPlist(path.join(dir, name, 'Contents', 'Info.plist'));
				if (plist) {
					var runtime = runtimes[plist.CFBundleIdentifier] = {
						name: plist.CFBundleName,
						version: null
					};
					var m = plist.CFBundleName.match(runtimeNameRegExp);
					if (m) {
						runtime.version = m[1];
					}

					plist = readPlist(path.join(dir, name, 'Contents', 'Resources', 'profile.plist'));
					if (plist) {
						if (!runtime.version || plist.defaultVersionString.startsWith(runtime.version)) {
							runtime.version = plist.defaultVersionString;
						}
					}
				}
			});
			return runtimes;
		}

		function findSDKs(dir, nameRegExp, minVersion) {
			var vers = [];

			fs.existsSync(dir) && fs.readdirSync(dir).forEach(function (name) {
				var file = path.join(dir, name);
				if (!fs.existsSync(file) || !fs.statSync(file).isDirectory()) return;
				var m = name.match(nameRegExp);
				if (m && (!minVersion || appc.version.gte(m[1], minVersion))) {
					var ver = m[1];
					file = path.join(file, 'System', 'Library', 'CoreServices', 'SystemVersion.plist');
					if (fs.existsSync(file)) {
						var p = new appc.plist(file);
						if (p.ProductVersion) {
							ver = p.ProductVersion;
						}
					}
					vers.push(ver);
				}
			});

			return vers.sort().reverse();
		}

		function findSims(dir, sdkRegExp, simRuntimeRegExp, minVer, xcodeVer) {
			var vers = findSDKs(dir, sdkRegExp),
				simRuntimesDir = '/Library/Developer/CoreSimulator/Profiles/Runtimes';

			// for Xcode >=6.2 <7.0, the simulators are in a global directory
			if (fs.existsSync(simRuntimesDir) && (!xcodeVer || appc.version.gte(xcodeVer, '6.2'))) {
				fs.readdirSync(simRuntimesDir).forEach(function (name) {
					var file = path.join(simRuntimesDir, name);
					if (!fs.existsSync(file) || !fs.statSync(file).isDirectory()) return;

					var m = name.match(simRuntimeRegExp);
					if (m && (!minVer || appc.version.gte(m[1], minVer))) {
						var ver = m[1];
						file = path.join(file, 'Contents', 'Resources', 'RuntimeRoot', 'System', 'Library', 'CoreServices', 'SystemVersion.plist');
						if (fs.existsSync(file)) {
							var p = new appc.plist(file);
							if (p.ProductVersion) {
								ver = p.ProductVersion;
							}
						}
						if (vers.indexOf(ver) === -1) {
							vers.push(ver);
						}
					}
				});
			}

			return vers.sort().reverse();
		}

		var searchPaths = {
				'/Applications': 1,
				'~/Applications': 1
			},
			results = {
				selectedXcode: null,
				xcode: {},
				iosSDKtoXcode: {},
				issues: []
			},
			selectedXcodePath = null,
			globalSimRuntimes = findSimRuntimes('/Library/Developer/CoreSimulator/Profiles/Runtimes'),
			xcodes = [];

		async.series([
			// build the list of searchPaths
			function detectOSXenv(next) {
				env.detect(options, function (err, env) {
					(Array.isArray(options.searchPath) ? options.searchPath : [ options.searchPath ]).forEach(function (p) {
						p && (searchPaths[p] = 1);
					});

					// resolve each of the paths
					Object.keys(searchPaths).forEach(function (p) {
						delete searchPaths[p];
						searchPaths[appc.fs.resolvePath(p)] = 1;
					});

					if (err || !env.executables.xcodeSelect) {
						return next();
					}

					appc.subprocess.run(env.executables.xcodeSelect, '--print-path', function (code, out, err) {
						if (!err) {
							searchPaths[selectedXcodePath = out.trim()] = 1;
						}
						next();
					});
				});
			},

			function findXcodes(next) {
				// scan all searchPaths for Xcode installs
				Object.keys(searchPaths).forEach(function (p) {
					if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
						// is this directory an Xcode dev dir?
						if (/\/Contents\/Developer\/?$/.test(p) && fs.existsSync(path.join(p, 'usr', 'bin', 'xcodebuild')) && xcodes.indexOf(p) === -1) {
							xcodes.push(p)
						} else {
							// is it the Xcode dir?
							var devDir = path.join(p, 'Contents', 'Developer');
							if (fs.existsSync(path.join(devDir, 'usr', 'bin', 'xcodebuild')) && xcodes.indexOf(devDir) === -1) {
								xcodes.push(devDir);
							} else {
								// possibly a parent folder, scan for Xcodes
								fs.readdirSync(p).forEach(function (name) {
									var dir = path.join(p, name, 'Contents', 'Developer');
									if (xcodes.indexOf(dir) === -1 && fs.existsSync(path.join(dir, 'usr', 'bin', 'xcodebuild'))) {
										xcodes.push(dir);
									}
								});
							}
						}
					}
				});
				next();
			},

			function loadXcodeInfo(next) {
				async.eachSeries(xcodes, function (dir, cb) {
					var p = new appc.plist(path.join(path.dirname(dir), 'version.plist')),
						version = p.CFBundleShortVersionString,
						selected = dir == selectedXcodePath,
						supported = options.supportedVersions ? appc.version.satisfies(version, options.supportedVersions, true) : true,
						id = version + ':' + p.ProductBuildVersion,
						f;

					if (results.xcode[id] && !selected && dir > results.xcode[id].path) {
						return cb();
					}

					var watchos = null;
					if (appc.version.gte(version, '7.0')) {
						watchos = {
							sdks: findSDKs(path.join(dir, 'Platforms', 'WatchOS.platform', 'Developer', 'SDKs'), /^WatchOS(.+)\.sdk$/, options.minWatchosVersion),
							sims: []
						};
					} else if (appc.version.gte(version, '6.2')) {
						watchos = {
							sdks: ['1.0'],
							sims: ['1.0']
						};
					}

					var tvos = {
						sdks: findSDKs(path.join(dir, 'Platforms', 'AppleTVOS.platform', 'Developer', 'SDKs'), /^AppleTVOS(.+)\.sdk$/, options.minTVosVersion),
						sims: [] // nobody cares
					};

					var xc = results.xcode[id] = {
						xcodeapp:       dir.replace(/\/Contents\/Developer\/?$/, ''),
						path:           dir,
						selected:       selected,
						version:        version,
						build:          p.ProductBuildVersion,
						supported:      supported,
						eulaAccepted:   false,
						sdks:           findSDKs(path.join(dir, 'Platforms', 'iPhoneOS.platform', 'Developer', 'SDKs'), /^iPhoneOS(.+)\.sdk$/, options.minIosVersion),
						sims:           [],
						simDeviceTypes: {},
						simRuntimes:    {},
						simDevicePairs: {},
						watchos:        watchos,
						tvos:           tvos,
						teams:          {},
						executables: {
							xcodebuild:     fs.existsSync(f = path.join(dir, 'usr', 'bin', 'xcodebuild')) ? f : null,
							clang:          fs.existsSync(f = path.join(dir, 'Toolchains', 'XcodeDefault.xctoolchain', 'usr', 'bin', 'clang')) ? f : null,
							clang_xx:       fs.existsSync(f = path.join(dir, 'Toolchains', 'XcodeDefault.xctoolchain', 'usr', 'bin', 'clang++')) ? f : null,
							libtool:        fs.existsSync(f = path.join(dir, 'Toolchains', 'XcodeDefault.xctoolchain', 'usr', 'bin', 'libtool')) ? f : null,
							lipo:           fs.existsSync(f = path.join(dir, 'Toolchains', 'XcodeDefault.xctoolchain', 'usr', 'bin', 'lipo')) ? f : null,
							otool:          fs.existsSync(f = path.join(dir, 'Toolchains', 'XcodeDefault.xctoolchain', 'usr', 'bin', 'otool')) ? f : null,
							pngcrush:       fs.existsSync(f = path.join(dir, 'Platforms', 'iPhoneOS.platform', 'Developer', 'usr', 'bin', 'pngcrush')) ? f : null,
							simulator:      null,
							watchsimulator: null,
							simctl:         fs.existsSync(f = path.join(dir, 'usr', 'bin', 'simctl')) ? f : null
						}
					};

					Object.keys(simulatorDevicePairCompatibility).some(function (xcodeRange) {
						if (appc.version.satisfies(xc.version, xcodeRange)) {
							xc.simDevicePairs = simulatorDevicePairCompatibility[xcodeRange];	

							// use the device pair compatibility to see if the simruntime is supported by
							// this Xcode as there isn't a way to programmatically do it
							Object.keys(globalSimRuntimes).forEach(function (runtime) {
								Object.keys(xc.simDevicePairs).forEach(function (iosRange) {
									if (/iOS/.test(runtime) && appc.version.satisfies(globalSimRuntimes[runtime].version, iosRange)) {
										xc.simRuntimes[runtime] = globalSimRuntimes[runtime];
									} else if (/watchOS/.test(runtime)) {
										// scan all iOS versions
										Object.keys(xc.simDevicePairs[iosRange]).forEach(function (watchosRange) {
											if (appc.version.satisfies(globalSimRuntimes[runtime].version, watchosRange)) {
												xc.simRuntimes[runtime] = globalSimRuntimes[runtime];
											}
										});
									}
								});
							});

							return true;
						}
					});

					// Read the device types and devices in one call using the `xcrun simctl list --json`
					// command. This not only improves performance (no device I/O required), but also combines
					// two command (`simctl list` and `simctl list devices`) into one.
					simctl.list({ simctl: xc.executables.simctl }, function (err, info) {
						if (err) {
							return next(err);
						}

						const devices = info.devices;
						const deviceTypes = info.devicetypes;
	
						deviceTypes.forEach(function(deviceType) {							
							if (!xc.simDeviceTypes[deviceType.identifier]) {
								xc.simDeviceTypes[deviceType.identifier] = {
									name: deviceType.name,
									model: deviceType.modelIdentifier || 'unknown',
									// Assume devices with Watch in name or model support watch pairing
									supportsWatch: /watch/i.test(deviceType.name) ? false : true
								};
							}
						});

						// Map the platform and version from CoreSimulator string like:
						// - com.apple.CoreSimulator.SimRuntime.iOS-17-0
						// - com.apple.CoreSimulator.SimRuntime.watchOS-10-0
						for (const key of Object.keys(devices)) {
							const [_, platform, rawVersion] = key.match(/\.SimRuntime\.(.*?)\-(.*)$/);
							const version = rawVersion.replace(/-/g, '.');

							const mapping = {
								name: `${platform} ${version}`,
								version
							}
							appc.util.mix(xc.simRuntimes, { [key]: mapping });
						}	
					});

					['Simulator', 'iOS Simulator'].some(function (name) {
						var p = path.join(dir, 'Applications', name + '.app', 'Contents', 'MacOS', name);
						if (fs.existsSync(p)) {
							xc.executables.simulator = p;
							return true;		
						}
					});

					if (appc.version.gte(xc.version, 9)) {
						xc.executables.watchsimulator = xc.executables.simulator;
					} else {
						var watchsim = path.join(dir, 'Applications', 'Simulator (Watch).app', 'Contents', 'MacOS', 'Simulator (Watch)');
						if (fs.existsSync(watchsim)) {
							xc.executables.watchsimulator = watchsim;
						}
					}

					// determine the compatible sims
					simctl.list({ simctl: xc.executables.simctl }, function (err, info) {
						if (err) {
							return next(err);
						}

						var rtRegExp = /(iOS|watchOS)-(.+)$/;
						Object.keys(info.devices).forEach(function (rt) {
							var m = rt.match(rtRegExp);
							if (m) {
								var dest = m[1] === 'iOS' ? xc.sims : xc.watchos.sims;
								var ver = m[2].replace(/-/g, '.');
								if (dest.indexOf(ver) === -1) {
									dest.push(ver);
								}
							}
						});	

						xc.sims.sort();
						xc.watchos.sims.sort();
						selected && (results.selectedXcode = xc);

						if (supported === false) {
							results.issues.push({
								id: 'IOS_XCODE_TOO_OLD',
								type: 'warning',
								message: __('Xcode %s is too old and is no longer supported.', '__' + version + '__') + '\n' +
									__('The minimum supported Xcode version is Xcode %s.', appc.version.parseMin(options.supportedVersions)),
								xcodeVer: version,
								minSupportedVer: appc.version.parseMin(options.supportedVersions)
							});
						} else if (supported === 'maybe') {
							results.issues.push({
								id: 'IOS_XCODE_TOO_NEW',
								type: 'warning',
								message: __('Xcode %s may or may not work as expected.', '__' + version + '__') + '\n' +
									__('The maximum supported Xcode version is Xcode %s.', appc.version.parseMax(options.supportedVersions, true)),
								xcodeVer: version,
								maxSupportedVer: appc.version.parseMax(options.supportedVersions, true)
							});
						}

						appc.subprocess.run(xc.executables.xcodebuild, [ '-checkFirstLaunchStatus' ], function (code, out, err) {
							xc.eulaAccepted = (code === 0);
							cb();
						});
					});
				}, next);
			},

			function findTeams(next) {
				appc.subprocess.findExecutable([options.sqlite, '/usr/bin/sqlite3', '/usr/bin/sqlite', 'sqlite3', 'sqlite'], function (err, sqlite) {
					if (err) {
						results.issues.push({
							id: 'IOS_SQLITE_EXECUTABLE_NOT_FOUND',
							type: 'error',
							message: __("Unable to find the 'sqlite' or 'sqlite3' executable.")
						});
						return next();
					}

					async.each(Object.keys(results.xcode), function (id, cb) {
						var xc = results.xcode[id],
							dbFile = appc.fs.resolvePath('~/Library/Developer/Xcode/DeveloperPortal ' + xc.version + '.db');

						if (!fs.existsSync(dbFile)) {
							return cb();
						}

						appc.subprocess.run(sqlite, [dbFile, '-separator', '|||', 'SELECT ZNAME, ZSTATUS, ZTEAMID, ZTYPE FROM ZTEAM'], function (code, out, err) {
							if (!code) {
								out.trim().split('\n').forEach(function (line) {
									var cols = line.trim().split('|||');
									if (cols.length === 4) {
										xc.teams[cols[2]] = {
											name: cols[0],
											status: cols[1] || 'unknown',
											type: cols[3]
										};
									}
								});
							}
							cb();
						});
					}, next);
				});
			}
		], function () {
			if (Object.keys(results.xcode).length) {
				var validXcodes = 0,
					xcodeIds = Object.keys(results.xcode),
					sdkCounter = 0,
					simCounter = 0,
					eulaNotAccepted = [];

				xcodeIds.forEach(function (xcodeId) {
					const xc = results.xcode[xcodeId];
					xc.sdks.forEach(function (iosVersion) {
						if (xc.selected || !results.iosSDKtoXcode[iosVersion]) {
							results.iosSDKtoXcode[iosVersion] = xcodeId;
						}
					});

					if (xc.supported) {
						// we're counting maybe's as valid
						validXcodes++;
					}
					if (xc.sdks) {
						sdkCounter += xc.sdks.length;
					}
					if (xc.sims) {
						simCounter += xc.sims.length;
					}
					if (!xc.eulaAccepted) {
						eulaNotAccepted.push(xc);
					}
				});

				if (eulaNotAccepted.length) {
					var message;

					if (xcodeIds.length === 1) {
						message = __('Xcode EULA has not been accepted.') + '\n' +
							__('Launch Xcode and accept the license.');
					} else {
						message = __('Multiple Xcode versions have not had their EULA accepted:') + '\n' +
							eulaNotAccepted.map(function (xc) {
								return '  ' + xc.version + ' (' + xc.xcodeapp + ')';
							}).join('\n') + '\n' +
							__('Launch each Xcode and accept the license.');
					}

					results.issues.push({
						id: 'IOS_XCODE_EULA_NOT_ACCEPTED',
						type: 'warning',
						message: message
					});
				}

				if (options.supportedVersions && !validXcodes) {
					results.issues.push({
						id: 'IOS_NO_SUPPORTED_XCODE_FOUND',
						type: 'warning',
						message: __('There are no supported Xcode installations found.')
					});
				}

				if (!sdkCounter) {
					results.issues.push({
						id: 'IOS_NO_IOS_SDKS',
						type: 'error',
						message: __('There are no iOS SDKs found') + '\n' +
							__('Launch Xcode and download the mobile support packages.')
					});
				}

				if (!sdkCounter) {
					results.issues.push({
						id: 'IOS_NO_IOS_SIMS',
						type: 'error',
						message: __('There are no iOS Simulators found') + '\n' +
							__('You can install them from the Xcode Preferences > Downloads tab.')
					});
				}
			} else {
				results.issues.push({
					id: 'IOS_XCODE_NOT_INSTALLED',
					type: 'error',
					message: __('No Xcode installations found.') + '\n' +
						__('You can download it from the %s or from %s.', '__App Store__', '__https://developer.apple.com/xcode/__')
				});
			}

			cache = results;
			emitter.emit('detected', results);
			return fireCallbacks(null, results);
		});
	});
};
