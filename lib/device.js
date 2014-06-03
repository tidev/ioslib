/**
 * iOS Device related functions
 */
var exec = require('child_process').exec,
	spawn = require('child_process').spawn,
	path = require('path'),
	fs = require('fs'),
	log = require('./log'),
	iOSLogger = require('./ioslog');

exports.detect = detect;
exports.stop = stop;
exports.install = install;

/**
 * detect and return device id or null if no device is connected
 *
 * returns an array of connected device UUIDs
 */
function detect (callback) {
	var cmd = "/usr/sbin/system_profiler SPUSBDataType | sed -n -e '/iPad/,/Serial/p' -e '/iPhone/,/Serial/p' | grep \"Serial Number:\" | awk -F \": \" '{print $2}'";
	exec(cmd, function(err,stdout,stderr){
		if (err) {
			return callback(stderr);
		}
		var uuids = stdout.trim().split('\n');
		callback(null, uuids.length && uuids[0] && Array.isArray(uuids) ? uuids : []);
	});
}

/**
 * stop a pending install
 */
function stop(next) {
	exec('/usr/bin/killall ios-deploy',function(){
		exec('/usr/bin/killall lldb',next || function(){});
	});
}

/**
 * install and then launch the application
 */
function install (obj) {
	if (!obj.callback) {
		throw new Error("missing callback");
	}
	if (!obj.build_dir) {
		throw new Error("missing build_dir");
	}
	// if no device_id is provided, then just detect it before running
	if (typeof obj.device_id === 'undefined') {
		return detect(function(err,devices){
			if (err) return callback(err);
			if (devices.length===0) return callback('no connected device');
			obj.device_id = devices[0];
			return install(obj);
		});
	}
	var times = 0,
		max = 10,
		callback = obj.callback;
	function next(err,delay) {
		if (err===true) {
			return callback(); // indicates we're done
		}
		if (!err && ++times < max) {
			return setTimeout(function(){
				obj.uninstall = times<=1;
				obj.callback = next;
				_install(obj);
			},delay||times*100);
		}
		else {
			callback(err || "timed out");
		}
	}
	stop(function(){
		// we do this because we want to ignore errors (since we might not have a process running and that's OK)
		next();
	});
}

function _install (obj) {

	var build_dir = obj.build_dir,
		device_id = obj.device_id, 
		uninstall = obj.uninstall, 
		quiet = obj.quiet,
		logCallback = obj.logger, 
		callback = obj.callback;

	var ios_deploy = path.join(__dirname,'..','node_modules','ios-deploy');

	if (!fs.existsSync(ios_deploy)) {
		if (!process.stdout.isTTY) {
			return callback("please run `npm install ios-deploy` to install the required library for iOS device routines");
		}
		function install() {
			var dir = path.resolve(process.cwd());
			process.chdir(__dirname);
			log.info('Installing .... Please enter your machine credentials when prompted.');
			var cmd = '/usr/bin/osascript "' + path.join(__dirname,'ios_deploy.scpt') + '"';
			exec(cmd, function(err,stdout,stderr){
				process.chdir(dir);
				if (err) { return callback(stderr || stdout || err); }
				log.info('Installed!');
				var license = path.join(ios_deploy,'LICENSE');
				if (fs.existsSync(license)) {
					log.info('ios-deploy license available in',license);
					log.info(fs.readFileSync(license,'utf8').toString().yellow.bold);
				}
				else {
					log.trace("Couldn't find license at",license);
					return callback("Couldn't install ios-deploy library. Manually install with `sudo npm install ios-deploy -g`");
				}
				run();
			});
		}
		if (quiet) {
			// skip the prompting
			return callback("please run `npm install ios-deploy` to install the required library for iOS device routines");
		}
		else {
			var prompt = require('prompt');
			prompt.start();
			prompt.message='';
			prompt.delimiter='';
			console.log('\nThe node library `ios-deploy` is required to install on iOS devices.\n'.red);
			var property = {
			  name: 'yesno',
			  message: 'Download and install (yes or no)?',
			  validator: /y[es]*|n[o]?/i,
			  warning: 'Must respond yes or no',
			  default: 'yes'
			};
			prompt.get(property, function(err,result){
				if (!/^y/.test(result.yesno)) {
					log.info("Exiting without continuing...");
					stopDevice();
					return callback('exiting without continuing');
				}
				else {
					install();
				}
			});
		}
	}	
	else {
		run();
	}

	function run () {
		var i = path.join(ios_deploy,'ios-deploy'),
			args = ['--debug', '--verbose',(uninstall ? '--uninstall':''), '--unbuffered','--noninteractive', '--bundle', build_dir, '--id', device_id],
			name = path.basename(build_dir).replace(/\.app$/,''),
			sigkill,
			finished;

		function finish() {
			if (!finished) {
				finished = true;
				stop();
				callback.apply(callback,arguments);
			}
		}

		function loggerCallback(label, message) {
			if (message.indexOf('stop reason = signal SIGKILL')!==-1) {
				sigkill = true;
			}
			else if (message.indexOf('process launch failed: Locked')!==-1) {
				return finish('device is locked, please unlock the device and try again');
			}
			else {
				if (logCallback) {
					logCallback(label,message);
				}
				else {
					log[label](message);
				}
			}
		}

		process.on('SIGINT', function(){
			finish(true); // indicate done
		});

		log.debug(i,args.join(' ').blue);

		var child = spawn(i, args),
			logger = new iOSLogger(name,loggerCallback);

		// attach our logger to our process
		logger.attach(child);

		child.on('error',function(buf){
			loggerCallback('error',String(buf));
		});

		child.on('close',function(exitCode,signal){
			if (signal=='SIGABRT') {
				// this usually means we the binary crashed.
				return finish('Error communicating with the device. Unplug and re-plug in your device and try again');
			}
			var msg;
			if (exitCode) {
				switch (exitCode) {
					case 253: {
						//exitcode_error
						msg = "The application exited with an error";
						break;
					}
					case 254: {
						//exitcode_app_crash
						if (sigkill) {
							msg = "The application was killed by the user";
						}
						else {
							msg = "The application crashed";
						}
						break;
					}
					default: {
						msg = true; // indicate success
						break;
					}
				}
			}
			finish(msg);
		});
	}
}