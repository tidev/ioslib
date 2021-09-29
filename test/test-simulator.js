/**
 * Tests ioslib's simulator module.
 *
 * @copyright
 * Copyright (c) 2014-2015 by Appcelerator, Inc. All Rights Reserved.
 *
 * @license
 * Licensed under the terms of the Apache Public License.
 * Please see the LICENSE included with this distribution for details.
 */

/**
 * To run these tests do the following:
 * 1. Update the xcVersion below
 * 2. Update the iphoneSim, ipadSim, and watchosSim to point to valid UDIDs for your machine. The UDIDs should come from the last simulator shown for a version in ti info output
 * 3. If you get provisioning profile errors, ensure that the TestApp project is setup correctly
*/

const
	appc = require('node-appc'),
	assert = require('assert'),
	async = require('async'),
	exec = require('child_process').exec,
	fs = require('fs'),
	ioslib = require('..'),
	path = require('path'),

	// these will vary by machine
	xcVersion = '13.0',
	iphoneSim = '2A1AB1A5-73BE-4536-93F2-BA20D307E1B4', // iPhone 12 Pro Max
	ipadSim = 'F3D0DAA8-7449-4D85-BAE5-278704A432B4', // iPad Pro (12.9-inch) (4th generation)
	watchosSim = '0E855BDE-862C-4360-8720-351785A5B201'; // Apple Watch Series 6 - 44mm (WatchOS 7.2)

function checkSims(sims) {
	should(sims).be.an.Array;
	sims.forEach(function (sim) {
		should(sim).be.an.Object;
		should(sim).have.keys('udid', 'name', 'version', 'type', 'deviceType', 'deviceName', 'deviceDir', 'model', 'family', 'supportsXcode', 'supportsWatch', 'watchCompanion', 'runtime', 'runtimeName', 'systemLog', 'dataDir');

		['udid', 'name', 'version', 'state', 'deviceType', 'deviceName', 'deviceDir', 'model', 'family', 'runtime', 'runtimeName', 'xcode', 'systemLog', 'dataDir'].forEach(function (key) {
			if (sim[key] !== null) {
				should(sim[key]).be.a.String;
				should(sim[key]).not.equal('');
			}
		});

		if (sim.supportsWatch !== null) {
			should(sim.supportsWatch).be.an.Object;
			Object.keys(sim.supportsWatch).forEach(function (xcodeId) {
				should(sim.supportsWatch[xcodeId]).be.a.Boolean;
			});
		}
	});
}

function build(app, iosVersion, defs, done){
	if (typeof defs === 'function') {
		done = defs;
		defs = [];
	}

	ioslib.xcode.detect(function (err, env) {
		if (err) {
			return done(err);
		}

		var xc = null,
			ios;

		Object.keys(env.xcode).sort().reverse().some(function (ver) {
			return env.xcode[ver].sdks.some(function (sdk) {
				if (!iosVersion || appc.version.satisfies(sdk, iosVersion)) {
					xc = env.xcode[ver];
					iosVersion = sdk;
					return true;
				}
			});
		});

		if (xc === null) {
			return done(new Error('No selected Xcode'));
		}

		if (!xc.eulaAccepted) {
			return done(new Error('Xcode must be launched and the EULA must be accepted before the iOS app can be compiled.'));
		}

		var args = [
			xc.executables.xcodebuild,
			'clean', 'build',
			'-configuration', 'Debug',
			'-scheme', app,
			'-destination', "platform='iOS Simulator',OS=" + appc.version.format(iosVersion, 2, 2) + ",name='iPhone 12 Pro Max'",
			'-derivedDataPath', path.join(__dirname, app),
			'GCC_PREPROCESSOR_DEFINITIONS="' + defs.join(' ') + '"'
		];

		exec(args.join(' '), {
			cwd: path.join(__dirname, app)
		}, function (err, stdout, stderr) {
			if (err) {
				return done(stdout + '\n' + stderr);
			}
			should(stdout).match(/BUILD SUCCEEDED/);
			var appPath = path.join(__dirname, app, 'build', 'Products', 'Debug-iphonesimulator', app + '.app');
			should(fs.existsSync(appPath)).be.true;
			done(null, appPath);
		});
	});
}

function timochaLogWatcher(emitter, callback) {
	typeof callback === 'function' || (callback = function () {});

	var inTiMochaResult = false,
		tiMochaResults = [],
		logLevelRegExp = /^\[\w+\]\s*/;

	function watch(line) {
		line = line.replace(logLevelRegExp, '');

		if (line === 'TI_MOCHA_RESULT_START') {
			inTiMochaResult = true;
		} else if (inTiMochaResult && line === 'TI_MOCHA_RESULT_STOP') {
			emitter.removeListener('log', watch);
			emitter.removeListener('log-file', watch);
			try {
				callback(null, tiMochaResults.length ? JSON.parse(tiMochaResults.join('\n').trim()) : {});
			} catch (ex) {
				callback(new Error('Results are not valid JSON'));
			}
		} else if (inTiMochaResult && line) {
			tiMochaResults.push(line);
		}
	}

	emitter.on('log', watch);
	emitter.on('log-file', watch);
}

describe('simulator', function () {
	var simHandlesToWipe = [];
	var logger = process.env.DEBUG ? console.log : function () {};

	afterEach(function (done) {
		this.timeout(60000);
		this.slow(60000);
		async.eachSeries(simHandlesToWipe, function (simHandle, next) {
			if (simHandle && simHandle.simctl) {
				appc.subprocess.run(simHandle.simctl, ['erase', simHandle.udid], function () {
					next();
				});
			} else {
				next();
			}
		}, function () {
			simHandlesToWipe = [];
			setTimeout(function () {
				done();
			}, 1000);
		});
	});

	it('namespace should be an object', function () {
		should(ioslib.simulator).be.an.Object;
	});

	it('detect iOS Simulators', function (done) {
		this.timeout(5000);
		this.slow(2000);

		ioslib.simulator.detect(function (err, results) {
			if (err) {
				return done(err);
			}

			should(results).be.an.Object;
			should(results).have.keys('simulators', 'issues');

			should(results.simulators).be.an.Object;
			should(results.simulators).have.keys('ios', 'watchos', 'crashDir');

			should(results.simulators.ios).be.an.Object;
			Object.keys(results.simulators.ios).forEach(function (ver) {
				checkSims(results.simulators.ios[ver]);
			});

			should(results.simulators.watchos).be.an.Object;
			Object.keys(results.simulators.watchos).forEach(function (ver) {
				checkSims(results.simulators.watchos[ver]);
			});

			should(results.simulators.crashDir).be.a.String;
			should(results.simulators.crashDir).not.equal('');
			if (fs.existsSync(results.simulators.crashDir)) {
				should(fs.statSync(results.simulators.crashDir).isDirectory()).be.true;
			}

			should(results.issues).be.an.Array;
			results.issues.forEach(function (issue) {
				should(issue).be.an.Object;
				should(issue).have.keys('id', 'type', 'message');
				should(issue.id).be.a.String;
				should(issue.type).be.a.String;
				should(issue.type).match(/^info|warning|error$/);
				should(issue.message).be.a.String;
			});

			done();
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('fail with bad iOS Sim UDID', function (done) {
		this.timeout(5000);
		this.slow(2000);

		ioslib.simulator.findSimulators({
			logger: logger,
			simHandleOrUDID: 'foo',
			watchAppBeingInstalled: false
		}, function (err, simHandle, watchSimHandle, selectedXcode, simInfo, xcodeInfo) {
			should(err).be.ok;
			should(err.message).equal('Unable to find an iOS Simulator with the UDID "foo".');
			done();
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('iOS Sim + bad Watch Sim UDID + no watch app is valid', function (done) {
		this.timeout(5000);
		this.slow(2000);

		ioslib.simulator.findSimulators({
			logger: logger,
			simHandleOrUDID: iphoneSim,
			watchAppBeingInstalled: false
		}, function (err, simHandle, watchSimHandle, selectedXcode, simInfo, xcodeInfo) {
			if (err) {
				return done(err);
			}

			should(simHandle).be.ok;
			should(simHandle.udid).equal(iphoneSim);
			assert(watchSimHandle === null);
			should(selectedXcode).be.ok;
			should(selectedXcode.version).equal(xcVersion);
			done();
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('fail with good iOS Sim UDID + bad Watch Sim UDID + watch app', function (done) {
		this.timeout(5000);
		this.slow(2000);

		ioslib.simulator.findSimulators({
			logger: logger,
			simHandleOrUDID: iphoneSim,
			watchAppBeingInstalled: true,
			watchHandleOrUDID: 'bar'
		}, function (err, simHandle, watchSimHandle, selectedXcode, simInfo, xcodeInfo) {
			should(err).be.ok;
			should(err.message).equal('Unable to find a Watch Simulator with the UDID "bar".');
			done();
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('iOS Sim + Watch Sim + no watch app is valid', function (done) {
		this.timeout(5000);
		this.slow(2000);

		ioslib.simulator.findSimulators({
			logger: logger,
			simHandleOrUDID: iphoneSim,
			watchAppBeingInstalled: false,
			watchHandleOrUDID: watchosSim
		}, function (err, simHandle, watchSimHandle, selectedXcode, simInfo, xcodeInfo) {
			if (err) {
				return done(err);
			}

			should(simHandle).be.ok;
			should(simHandle.udid).equal(iphoneSim);
			assert(watchSimHandle === null);
			should(selectedXcode).be.ok;
			should(selectedXcode.version).equal(xcVersion);
			done();
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('iOS Sim is valid', function (done) {
		this.timeout(5000);
		this.slow(2000);

		ioslib.simulator.findSimulators({
			logger: logger,
			simHandleOrUDID: iphoneSim,
			watchAppBeingInstalled: false
		}, function (err, simHandle, watchSimHandle, selectedXcode, simInfo, xcodeInfo) {
			if (err) {
				return done(err);
			}

			should(simHandle).be.ok;
			should(simHandle.udid).equal(iphoneSim);
			assert(watchSimHandle === null);
			should(selectedXcode).be.ok;
			should(selectedXcode.version).equal(xcVersion);
			done();
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('iOS Sim + Watch Sim + watch app is valid', function (done) {
		this.timeout(5000);
		this.slow(2000);

		ioslib.simulator.findSimulators({
			logger: logger,
			simHandleOrUDID: iphoneSim,
			watchAppBeingInstalled: true,
			watchHandleOrUDID: watchosSim
		}, function (err, simHandle, watchSimHandle, selectedXcode, simInfo, xcodeInfo) {
			if (err) {
				return done(err);
			}

			should(simHandle).be.ok;
			should(simHandle.udid).equal(iphoneSim);
			should(watchSimHandle).be.ok;
			should(watchSimHandle.udid).equal(watchosSim);
			should(selectedXcode).be.ok;
			should(selectedXcode.version).equal(xcVersion);
			done();
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('iOS Sim + watch app is valid', function (done) {
		this.timeout(5000);
		this.slow(2000);

		ioslib.simulator.findSimulators({
			logger: logger,
			simHandleOrUDID: iphoneSim,
			watchAppBeingInstalled: true
		}, function (err, simHandle, watchSimHandle, selectedXcode, simInfo, xcodeInfo) {
			if (err) {
				return done(err);
			}

			should(simHandle).be.ok;
			should(simHandle.udid).equal(iphoneSim);
			should(watchSimHandle).be.ok;
			should(watchSimHandle.udid).equal(watchosSim);
			should(selectedXcode).be.ok;
			should(selectedXcode.version).equal(xcVersion);
			done();
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('no iOS Sim + Watch Sim + no watch app is valid', function (done) {
		this.timeout(5000);
		this.slow(2000);

		ioslib.simulator.findSimulators({
			logger: logger,
			watchAppBeingInstalled: false,
			watchHandleOrUDID: watchosSim
		}, function (err, simHandle, watchSimHandle, selectedXcode, simInfo, xcodeInfo) {
			if (err) {
				return done(err);
			}

			should(simHandle).be.ok;
			should(simHandle.udid).equal(iphoneSim);
			assert(watchSimHandle === null);
			should(selectedXcode).be.ok;
			should(selectedXcode.version).equal(xcVersion);
			done();
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('no iOS Sim + no Watch Sim + no watch app is valid', function (done) {
		this.timeout(5000);
		this.slow(2000);

		ioslib.simulator.findSimulators({
			logger: logger,
			watchAppBeingInstalled: false
		}, function (err, simHandle, watchSimHandle, selectedXcode, simInfo, xcodeInfo) {
			if (err) {
				return done(err);
			}

			should(simHandle).be.ok;
			should(simHandle.udid).equal(iphoneSim);
			assert(watchSimHandle === null);
			should(selectedXcode).be.ok;
			should(selectedXcode.version).equal(xcVersion);
			done();
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('no iOS Sim + app + no Watch Sim + no watch app is valid', function (done) {
		this.timeout(5000);
		this.slow(2000);

		ioslib.simulator.findSimulators({
			logger: logger,
			appBeingInstalled: true,
			watchAppBeingInstalled: false
		}, function (err, simHandle, watchSimHandle, selectedXcode, simInfo, xcodeInfo) {
			if (err) {
				return done(err);
			}

			should(simHandle).be.ok;
			should(simHandle.udid).equal(iphoneSim);
			assert(watchSimHandle === null);
			should(selectedXcode).be.ok;
			should(selectedXcode.version).equal(xcVersion);
			done();
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('no iOS Sim + app + no Watch Sim + watch app is valid', function (done) {
		this.timeout(5000);
		this.slow(2000);

		ioslib.simulator.findSimulators({
			logger: logger,
			appBeingInstalled: true,
			watchAppBeingInstalled: true
		}, function (err, simHandle, watchSimHandle, selectedXcode, simInfo, xcodeInfo) {
			if (err) {
				return done(err);
			}

			should(simHandle).be.ok;
			should(simHandle.udid).equal(iphoneSim);
			should(watchSimHandle).be.ok;
			should(watchSimHandle.udid).equal(watchosSim);
			should(selectedXcode).be.ok;
			should(selectedXcode.version).equal(xcVersion);
			done();
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('no iOS Sim + app + Watch Sim + watch app is valid', function (done) {
		this.timeout(5000);
		this.slow(2000);

		ioslib.simulator.findSimulators({
			logger: logger,
			appBeingInstalled: true,
			watchAppBeingInstalled: true,
			watchHandleOrUDID: watchosSim
		}, function (err, simHandle, watchSimHandle, selectedXcode, simInfo, xcodeInfo) {
			if (err) {
				return done(err);
			}

			should(simHandle).be.ok;
			should(simHandle.udid).equal(iphoneSim);
			should(watchSimHandle).be.ok;
			should(watchSimHandle.udid).equal(watchosSim);
			should(selectedXcode).be.ok;
			should(selectedXcode.version).equal(xcVersion);
			done();
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('iPad Sim + Watch Sim + watch app is invalid', function (done) {
		this.timeout(5000);
		this.slow(2000);

		ioslib.simulator.findSimulators({
			logger: logger,
			appBeingInstalled: true,
			simHandleOrUDID: ipadSim,
			watchAppBeingInstalled: true,
			watchHandleOrUDID: watchosSim
		}, function (err, simHandle, watchSimHandle, selectedXcode, simInfo, xcodeInfo) {
			should(err).be.ok;
			should(err.message).equal(`Unable to find any Watch Simulators that can be paired with the specified iOS Simulator ${ipadSim}.`);
			done();
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('iPad Sim + watch app is invalid', function (done) {
		this.timeout(5000);
		this.slow(2000);

		ioslib.simulator.findSimulators({
			logger: logger,
			appBeingInstalled: true,
			simHandleOrUDID: ipadSim,
			watchAppBeingInstalled: true
		}, function (err, simHandle, watchSimHandle, selectedXcode, simInfo, xcodeInfo) {
			should(err).be.ok;
			should(err.message).equal(`Unable to find any Watch Simulators that can be paired with the specified iOS Simulator ${ipadSim}.`);
			done();
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('find a iOS and Watch Sim', function (done) {
		this.timeout(5000);
		this.slow(2000);

		ioslib.simulator.findSimulators({
			logger: logger,
			appBeingInstalled:      true,
			simType:                'iphone',
			watchAppBeingInstalled: true,
			watchMinOSVersion:      '2.0'
		}, function (err, simHandle, watchSimHandle, selectedXcode, simInfo, xcodeInfo) {
			if (err) {
				return done(err);
			}

			should(simHandle).be.ok;
			should(simHandle.udid).equal(iphoneSim);
			should(watchSimHandle).be.ok;
			should(watchSimHandle.udid).equal(watchosSim);
			should(selectedXcode).be.ok;
			should(selectedXcode.version).equal(xcVersion);
			done();
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('should launch the default simulator and stop it', function (done) {
		this.timeout(120000);
		this.slow(60000);

		ioslib.simulator.launch(iphoneSim, null, function (err, simHandle, watchSimHandle) {
			simHandlesToWipe.push(simHandle, watchSimHandle);

			if (err) {
				return done(err);
			}

			appc.subprocess.run('ps', '-ef', function (code, out, err) {
				if (code) {
					return done(new Error('Failed to get process list: ' + code));
				}

				should(out.split('\n').filter(function (line) { return line.indexOf(simHandle.simulator) !== -1; })).not.length(0);

				ioslib.simulator.stop(simHandle, function () {
					done();
				});
			});
		}).on('log-debug', function (line, simHandle) {
			logger((simHandle ? '[' + simHandle.family.toUpperCase() + '] ' : '') + '[DEBUG]', line);
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('should be able to launch simulator and log basic logs', function (done) {
		this.timeout(120000);
		this.slow(60000);

		build('TestApp', null, ['TEST_BASIC_LOGGING'], function (err, appPath) {
			if (err) {
				return done(err);
			}

			should(appPath).be.a.String;
			should(fs.existsSync(appPath)).be.ok;

			var counter = 0,
				launched = false,
				started = false;

			ioslib.simulator.launch(null, {
				appPath: appPath,
				autoExit: true,
				hide: true,
				logFilename: 'TestApp.log'
			}).on('log-file', function (line) {
				counter++;
			}).on('log-debug', function (line, simHandle) {
				logger((simHandle ? '[' + simHandle.family.toUpperCase() + '] ' : '') + '[DEBUG]', line);
			}).on('launched', function (simHandle, watchSimHandle) {
				launched = true;
				simHandlesToWipe.push(simHandle, watchSimHandle);
			}).on('error', function (err) {
				done(err);
			}).on('app-started', function (simHandle) {
				started = true;
			}).on('app-quit', function (err) {
				should(err).not.be.ok();
				should(launched).equal(true);
				should(started).equal(true);
				should(counter).not.equal(0);
				done();
			});
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('should be able to launch simulator and log ti mocha results', function (done) {
		this.timeout(60000);
		this.slow(60000);

		build('TestApp', null, ['TEST_TIMOCHA'], function (err, appPath) {
			if (err) {
				return done(err);
			}

			should(appPath).be.a.String;
			should(fs.existsSync(appPath)).be.ok;

			var simHandle,
				n = 0,
				emitter = ioslib.simulator.launch(null, {
					appPath: appPath,
					hide: true,
					logFilename: 'TestApp.log'
				});

			function stop() {
				if (++n === 2) {
					ioslib.simulator.stop(simHandle, function () {
						done();
					});
				}
			}

			emitter.on('app-started', function (handle) {
				simHandle = handle;
				stop();
			}).on('log-debug', function (line, simHandle) {
				logger((simHandle ? '[' + simHandle.family.toUpperCase() + '] ' : '') + '[DEBUG]', line);
			}).on('launched', function (simHandle, watchSimHandle) {
				simHandlesToWipe.push(simHandle, watchSimHandle);
			}).on('error', function (err) {
				done(err);
			});

			timochaLogWatcher(emitter, function (err, results) {
				should(err).not.be.ok;
				should(results).be.an.Object;
				should(results).have.property('foo', 'bar');
				stop();
			});
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('should be able to launch simulator and log ti mocha results with multiple lines', function (done) {
		this.timeout(120000);
		this.slow(60000);

		build('TestApp', null, ['TEST_TIMOCHA_MULTIPLE_LINES'], function (err, appPath) {
			if (err) {
				return done(err);
			}

			should(appPath).be.a.String;
			should(fs.existsSync(appPath)).be.ok;

			var simHandle,
				n = 0,
				emitter = ioslib.simulator.launch(null, {
					appPath: appPath,
					hide: true,
					logFilename: 'TestApp.log'
				});

			function stop() {
				if (++n === 2) {
					ioslib.simulator.stop(simHandle, function () {
						done();
					});
				}
			}

			emitter.on('app-started', function (handle) {
				simHandle = handle;
				stop();
			}).on('log-debug', function (line, simHandle) {
				logger((simHandle ? '[' + simHandle.family.toUpperCase() + '] ' : '') + '[DEBUG]', line);
			}).on('launched', function (simHandle, watchSimHandle) {
				simHandlesToWipe.push(simHandle, watchSimHandle);
			}).on('error', function (err) {
				done(err);
			});

			timochaLogWatcher(emitter, function (err, results) {
				should(err).not.be.ok;
				should(results).be.an.Object;
				should(results).have.property('foo', 'bar');
				stop();
			});
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('should be able to launch simulator and detect crash with Objective-C exception', function (done) {
		this.timeout(60000);
		this.slow(60000);

		build('TestApp', null, ['TEST_OBJC_CRASH'], function (err, appPath) {
			if (err) {
				return done(err);
			}

			should(appPath).be.a.String;
			should(fs.existsSync(appPath)).be.ok;

			var simHandle;

			ioslib.simulator.launch(null, {
				appPath: appPath,
				hide: true,
				logFilename: 'TestApp.log'
			}).on('app-started', function (handle) {
				simHandle = handle;
			}).on('log-debug', function (line, simHandle) {
				logger((simHandle ? '[' + simHandle.family.toUpperCase() + '] ' : '') + '[DEBUG]', line);
			}).on('launched', function (simHandle, watchSimHandle) {
				simHandlesToWipe.push(simHandle, watchSimHandle);
			}).on('error', function (err) {
				done(err);
			}).on('app-quit', function (crash) {
				// stop the simulator before we start throwing exceptions
				ioslib.simulator.stop(simHandle, function () {
					try {
						should(crash).be.an.instanceOf(ioslib.simulator.SimulatorCrash);
						should(crash.toString()).eql('SimulatorCrash: App crashed in the iOS Simulator');
						should(crash).have.property('crashFiles');
						should(crash.crashFiles).be.an.Array;
						crash.crashFiles.forEach(function (file) {
							should(fs.existsSync(file)).be.ok;
						});
					} finally {
						if (crash && Array.isArray(crash.crashFiles)) {
							crash.crashFiles.forEach(function (file) {
								fs.existsSync(file) && fs.unlinkSync(file);
							});
						}
					}

					done();
				});
			});
		});
	});

	// EH 19/3/2021 - I'm unable to capture the C exception here with the new logfile system, it
	// appears that the C exception does not get written to the logfile or the system log. But leaving
	// this test here skipped incase someone more familiar wants to poke around
	 it.skip('should be able to launch simulator and detect crash with C exception', function (done) {
		this.timeout(120000);
		this.slow(60000);

		build('TestApp', null, ['TEST_C_CRASH'], function (err, appPath) {
			if (err) {
				return done(err);
			}

			should(appPath).be.a.String;
			should(fs.existsSync(appPath)).be.ok;

			var simHandle;

			ioslib.simulator.launch(null, {
				appPath: appPath,
				hide: true,
				logFilename: 'TestApp.log'
			}).on('app-started', function (handle) {
				simHandle = handle;
			}).on('launched', function (simHandle, watchSimHandle) {
				simHandlesToWipe.push(simHandle, watchSimHandle);
			}).on('log-debug', function (line, simHandle) {
				logger((simHandle ? '[' + simHandle.family.toUpperCase() + '] ' : '') + '[DEBUG]', line);
			}).on('error', function (err) {
				done(err);
			}).on('app-quit', function (crash) {
				// stop the simulator before we start throwing exceptions
				ioslib.simulator.stop(simHandle, function () {
					try {
						should(crash).be.an.instanceOf(ioslib.simulator.SimulatorCrash);
						should(crash.toString()).eql('SimulatorCrash: App crashed in the iOS Simulator');

						should(crash).have.property('crashFiles');
						should(crash.crashFiles).be.an.Array;
						crash.crashFiles.forEach(function (file) {
							should(fs.existsSync(file)).be.ok;
						});
					} finally {
						if (crash && Array.isArray(crash.crashFiles)) {
							crash.crashFiles.forEach(function (file) {
								fs.existsSync(file) && fs.unlinkSync(file);
							});
						}
					}

					done();
				});
			});
		});
	});

	(process.env.TRAVIS || process.env.JENKINS ? it.skip : it)('should launch the default simulator and launch the watchOS 2 app', function (done) {
		this.timeout(120000);
		this.slow(60000);

		build('TestWatchApp2', undefined, ['TEST_BASIC_LOGGING'], function (err, appPath) {
			if (err) {
				return done(err);
			}

			should(appPath).be.a.String;
			should(fs.existsSync(appPath)).be.ok;

			ioslib.simulator.detect(function (err, simInfo) {
				ioslib.simulator.launch(iphoneSim, {
					appPath: appPath,
					hide: true,
					launchWatchApp: true,
					logFilename: 'TestApp.log'
				}).on('log-debug', function (line, simHandle) {
					logger((simHandle ? '[' + simHandle.family.toUpperCase() + '] ' : '') + '[DEBUG]', line);
				}).on('launched', function (simHandle, watchSimHandle) {
					simHandlesToWipe.push(simHandle, watchSimHandle);
				}).on('app-started', function (simHandle, watchSimHandle) {
					ioslib.simulator.stop(simHandle, function () {
						if (watchSimHandle) {
							ioslib.simulator.stop(watchSimHandle, function () {
								done();
							});
						} else {
							done();
						}
					});
				}).on('error', function (err) {
					done(err);
				});
			});
		});
	});

});
