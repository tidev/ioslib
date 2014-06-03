/**
 * iOS Launching
 */
var path = require('path'),
	fs = require('fs'),
	log = require('./log'),
	IOSLogger = require('./ioslog'),
	xcode = require('./xcode'),
	exec = require('child_process').exec,
	spawn = require('child_process').spawn;

exports.stop = stop;
exports.launch = launch;

	
/**
 * stop a running ios simulator
 */ 
function stop (callback) {
	exec("/usr/bin/osascript -e 'tell app \"iPhone Simulator\" to quit'", callback || function(){});
}

/**
 * launch the ios simulator
 */
function launch(obj) {

	var build_dir = obj.build_dir, 
		callback_logger = obj.logger,
		callback = obj.callback,
		name = build_dir && path.basename(build_dir).replace(/\.app$/,''),
		hide = obj.hide,
		auto_exit = obj.auto_exit,
		unit = obj.unit,
		launch_timeout = obj.timeout,
		homeDir = process.env.HOME,
		timer = launch_timeout ? setInterval(checkTimeout,launch_timeout) : null,
		tiMochaResults = [],
		inTiMochaResult,
		_finished,
		lastLog = Date.now();

	if (auto_exit && hide === undefined) {
		hide = true;
	}

	function finished() {
		if (!_finished) {
			_finished = true;
			stop();
			if (callback) {
				var args = arguments,
					cb = callback;
				process.nextTick(function(){
					cb.apply(cb,args);
				});
				callback = null;
			}
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
		}
	}

	// stop signal if we ctrl-c from the console
	process.on('SIGINT', function() {
		stop();
		process.exit();
	});

	function checkTimeout() {
		if (Date.now()-lastLog >= launch_timeout) {
			finished("launch timed out");
		}
	}

	function logAdapter(label, message) {
		lastLog = Date.now();
		if (auto_exit && label==='debug' && message==='AUTO_EXIT') {
			return finished();
		}
		if (/Terminating in response to SpringBoard/.test(message)) {
			return finished();
		}
		// if in unit mode, check to see if we have results
		if (unit && message==='TI_MOCHA_RESULT_START'){
			inTiMochaResult = true;
			return;
		}
		else if (inTiMochaResult && message==='TI_MOCHA_RESULT_STOP') {
			inTiMochaResult = false;
			var result = tiMochaResults.length ? JSON.parse(tiMochaResults.join('\n').trim()) : {};
			return finished(null, result);
		}
		else if (inTiMochaResult) {
			tiMochaResults.push(message);
			return;
		}
		callback_logger && callback_logger(label,message);
	}

	// make sure we kill the simulator before we launch it
	stop(function(){
		xcode.settings(function(err,settings) {
			var ios_sim = path.join(__dirname, '..', 'support', 'ios-sim'),
				args = ['launch', build_dir, '--sdk', settings.version, '--retina'];

			log.debug('launch ios-sim with args:', args.join(' ').grey);

			var simulator = spawn(ios_sim, args),
				logger = new IOSLogger(name, logAdapter);

			// attach the logger
			logger.attach(simulator);

			// when the process closes, finish
			simulator.on('close', function(exitCode, signal){
				if (signal) {
					return finished('signal received: '+signal);
				}
				finished(exitCode===0 ? null : 'exited with '+exitCode);
			});

			var scpt = path.join(__dirname, 'iphone_sim_'+(hide?'hide':'activate')+'.scpt'),
				asa = path.join(settings.xcodePath, 'Platforms', 'iPhoneSimulator.platform', 'Developer', 'Applications', 'iPhone Simulator.app'),
				cmd = '/usr/bin/osascript "' + path.resolve(scpt) + '" "' + asa + '"';
			exec(cmd);
		});
	});
}
