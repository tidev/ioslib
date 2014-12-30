/**
* Launches simulator, installs applicaion and launches application
*
* @module simctl
*
* @copyright
* Copyright (c) 2014 by Appcelerator, Inc. All Rights Reserved.
*
* @license
* Licensed under the terms of the Apache Public License.
* Please see the LICENSE included with this distribution for details.
*/
const 
	exec = require('child_process').exec,
	async = require('async'),
	path = require('path'),
	appc = require('node-appc'),
	fs = require('fs'),
	bplistParse = require('bplist-parser'),
	Tail = require('tail').Tail,
	spawn = require('child_process').spawn,
	_ = require("underscore"),
	EventEmitter = require('events').EventEmitter,
	emitter = new EventEmitter;

var simulatorInstance = null,
	developerDir = null,
	verbose = true;

exports.launch = launch;
exports.launchAppInSimulator = launchAppInSimulator;
exports.installApp = installApp;
exports.launchSimulator = launchSimulator;
exports.exit =  exit;

/**
 * Finds the developer directory using xcode-select
 *
 * @param {Function} [callback(output)] - A function to call when exec has finished
 * @param {String} callback().output - Current Xcode path
 *
 */
function FindDeveloperDir(callback) {
	exec("/usr/bin/xcode-select -print-path", function(error, stdout, stderr) {
		var output = stdout.replace(/(\r\n|\n|\r)/gm,"");
		if (output.length==0) output = null;
		callback(output);
	});
};

/**
 * Detects simulators available
 *
 * @param {Function} [callback(devices)] - A function to call with the simulator information.
 * @param {Object[]} [callback().devices] - List of devices available
 * @param {String} [Object.state] - device state [Booted | Shutdown]
 * @param {String} [Object.udid] - device udid
 * @param {String} [Object.name] - device name
 *
 */
function getAllDevices(callback) {
	exec("xcrun simctl list devices", function(error, stdout, stderr) {
		if (error) {
			emitter.emit('error', 'Could not list devices', error); 
			return;
		}
		var deviceSecRe = /-- iOS (.+) --(\n .+)*/mg;
		var matches = [];
		var devices = {};
		var match = deviceSecRe.exec(stdout);

		while (match !== null) {
			matches.push(match);
			match = deviceSecRe.exec(stdout);
		}

		if (matches.length < 1) {
			emitter.emit('error', 'Could not find device section', error); 
			return;
		}

		_.each(matches, function (match) {
			var sdk = match[1];
			devices[sdk] = [];
			_.each(match[0].split("\n").slice(1), function (line) {
				var lineRe = /^ (.+) \((.+)\) \((.+)\)/;
				var match = lineRe.exec(line);

				if (match === null) {
					emitter.emit('error', 'Could not match line', error); 
					return;
				}

				var device = {};
				device.name = match[1];
				device.udid = match[2];
				device.state = match[3];
				devices[sdk].push(device);
			});
		});
		callback(devices);
	});
};

/**
 * Get plist information from a built application
 *
 * @param {String} [filePath] - Path to the built application
 *
 * @returns {Object} [plistData] - Object representation for the plist data
 */
function getPlistData(filePath) {
	var plistData;

	if (fs.existsSync(filePath)) {
		var fileData = fs.readFileSync(filePath);
		try {
			plistData = bplistParse.parseBuffer(fileData)[0];
		} catch (err) {
			if (err.message.indexOf("Invalid binary plist") !== -1) {
				plistData = xmlplist(filePath)[0];
			} else {
				emitter.emit('error', err);
				exit();
			}
		}
	} else {
		emitter.emit('error', 'File not found');
		exit();
	}

	return plistData;
};

/**
 * Launches simulator
 *
 * @param {String} udid - Device Identifier
 * @param {Function} [callback()] - A function to call when the simulator has launched.
 *
 */
function launchSimulator(udid, callback) {
	// Get list of devices available
	getAllDevices(function(devices) {
		var deviceToLaunch = null;

		Object.keys(devices).forEach(function(sdk) {
			devices[sdk].forEach(function(simulatorDevice) {
				if (simulatorDevice.udid != udid && simulatorDevice.state == 'Booted') {
					emitter.emit('error', "Device in invalid state");
					exit(1);
				}
				if (simulatorDevice.udid == udid) {
					deviceToLaunch = simulatorDevice;
				}
			});
		});

		if (deviceToLaunch.uuid=='undefined') {
			emitter.emit('error', 'Device not found');
			exit(0);
		}

		var iosSimPath = path.resolve(developerDir, "Applications/iOS Simulator.app/Contents/MacOS/iOS Simulator");
		simulatorInstance = spawn(iosSimPath,['--args', '-CurrentDeviceUDID', deviceToLaunch.udid]);

		if (verbose) {
			emitter.emit('log', 'Launching Simulator');
		}

		callback(); // Simulator has launched
	});
};


/**
 * Closes simulator by checking for an instance
 */
function closeSimulator() {
	if (simulatorInstance != null) {
		simulatorInstance.kill();
	}
};

/**
* Installs application in simulator
*
* @param {String} appPath - Path to the built application
* @param {String} udid - Device Identifier
* @param {Function} [callback()] - A function to call when successfully installed
*
*/
function installApp(appPath, udid, callback) {
	exec("xcrun simctl install "+udid+" '"+appPath+"'", function(err, stdout, stderr) {
		if (!err) {
			emitter.emit('log', "App Installed");
			callback();
		} else if (err.code == '146') { //Invalid Device State (Waiting for boot)
			setTimeout(function() {
				installApp(appPath, udid, callback);
			},3000);
		} else {
			emitter.emit('log', err);
			exit(err.code, err.signal);
		}
	});
};

/**
* Launches application in simulator
*
* @param {String} [udid] - Device Identifier
* @param {String} [CFBundleIdentifier] - Application bundle id
* @param {Function} [callback()] - A function to call when application has successfully launched
*
*/
function launchAppInSimulator(udid, CFBundleIdentifier, callback) {
	exec("xcrun simctl launch "+udid+" "+CFBundleIdentifier, function(error, stdout, stderr) {
		if (error==null) {
			emitter.emit('log', 'Session started');
			callback();
		} else if (error.code == 4) {
			emitter.emit('error', 'Application not found on device');
			exit(error.code, error.signal);
		} else if (error.code == '146') {  //Invalid Device State (Waiting for boot)
			setTimeout(function() {
				launchAppInSimulator(udid, CFBundleIdentifier, callback);
			},3000);
		} else if (error.code == '145') {
			emitter.emit('error', "Device not found");
			exit(error.code, error.signal);
		} else {
			emitter.emit('error', error);
			exit(error.code, error.signal);
		}
	});
};

/**
 * Launches the specified iOS Simulator.
 *
 * @param {String} [udid] - Device Identifier
 * @param {Object} [options] - Object that holds launch configuration
 * @param {String} [options.appPath] - Path to build iOS application
 * @param {String} [options.developerDir] - Path to xCode
 * @param {String} [options.timout] - timeout value for launching the application on device
 * @param {String} [options.CFBundleIdentifier] - if defined overides installation and launches application
 *
 * @emits module:simctl#log
 * @emits module:simctl#error
 * @emits module:simctl#close
 *
 * @returns {EventEmitter}
 */
function launch(udid, options) {
	var CFBundleIdentifier = options.hasOwnProperty('CFBundleIdentifier') ? options.CFBundleIdentifier : null,
		logPath=null,
		tail=null,
		timeoutId = null;

	// Configure timeout
	if (options.hasOwnProperty('timeout')) {
		timeoutId = setTimeout(function() {
			emitter.emit('error', 'timeout');
			exit();
		}, options.timeout*1000);
	}

	async.series([
		function(next) {
			//check for developer dir
			if (options.hasOwnProperty(developerDir)) {
				developerDir = options.developerDir;
				next();
			} else {
				FindDeveloperDir(function(result) {
					developerDir = result;
					next();
				});
			}
		},
		function(next) {
			launchSimulator(udid,next);
		},
		function(next) {
			if (CFBundleIdentifier == null && options.appPath != null) {
				options.appPath = path.resolve(options.appPath);
				// Get CFBundleIdentifier from application for launching
				CFBundleIdentifier = getPlistData(path.join(options.appPath+'/info.plist')).CFBundleIdentifier;
				installApp(options.appPath, udid, next);
			} else next();
		},
		function(next) {
			if (CFBundleIdentifier!=null) {
				// NSLogs get stored here
				logPath = appc.fs.resolvePath("~/Library/Logs/CoreSimulator/"+udid+"/system.log");

				launchAppInSimulator(udid, CFBundleIdentifier, function() {
					// clear timeout
					timeoutId && clearTimeout(timeoutId);
					// Start tail on log file
					tail = new Tail(logPath);
					tail.on("line", function(data) {
						emitter.emit('log', data.trim());
					});
				});
			}
		}
	]);
	return emitter;
};

/**
* Stops the specified iOS Simulator.
*
* @param {String} [code]
* @param {String} [signal]
*/
function exit(code, signal) {
	code = code || 0;
	signal = signal || '';
	emitter.emit('close', {code:code, signal:signal});
	closeSimulator();
};