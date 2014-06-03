/**
 * iOS Launching
 */
var path = require('path'),
	fs = require('fs'),
	wrench = require('wrench'),
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
			var sdk = obj.sdk || settings.version,
				retina = obj.retina || '--retina',
				tall = obj.tall || '--tall',
				sim64bit = obj.sim64bit || '--sim-64bit',
				simAppDir = path.join("/Users",process.env.USER,"Library","Application Support","iPhone Simulator");

			// delete any stale applications and their logs
			exec('find "'+simAppDir+'" -name "'+name+'.app"', function(err,stdout,stderr){
				if (stdout) {
					stdout.trim().split('\n').forEach(function(dir){
						dir = path.join(simAppDir,dir);
						if (fs.existsSync(dir)) {
							wrench.rmdirSyncRecursive(dir);
						}
					});
				}
				var ios_sim = path.join(__dirname, '..', 'support', 'ios-sim'),
					args = ['launch', build_dir, '--sdk', sdk, retina, tall, sim64bit];

				log.debug('launch ios-sim with args:', args.join(' ').grey);

				var simulator = spawn(ios_sim, args),
					processLogger = new IOSLogger(name, logAdapter),
					streamLogger = new IOSLogger(name, logAdapter),
					logStream;

				// attach the logger to the process for output
				processLogger.attach(simulator);

				// if error, finish
				simulator.on('error',finished);

				// when the process closes, finish
				simulator.on('close', function(exitCode, signal){
					if (logStream) {
						try {
							logStream.close();
						}
						catch (e) {
						}
						finally {
							logStream = null;
						}
					}
					if (signal) {
						return finished('signal received: '+signal);
					}
					finished(exitCode===0 ? null : 'exited with '+exitCode);
				});

				var scpt = path.join(__dirname, 'iphone_sim_'+(hide?'hide':'activate')+'.scpt'),
					asa = path.join(settings.xcodePath, 'Platforms', 'iPhoneSimulator.platform', 'Developer', 'Applications', 'iPhone Simulator.app'),
					cmd = '/usr/bin/osascript "' + path.resolve(scpt) + '" "' + asa + '"';

				// now look for a log (titanium) and read it as well
				function findLog() {
					// search for our app again to find our app
					exec('find "'+simAppDir+'" -name "'+name+'.app"', function(err,stdout,stderr){
						stdout = stdout.trim();
						if (!stdout) {
							return setTimeout(findLog,50);
						}
						var logDir = path.join(stdout,'..','Documents');
						if (fs.existsSync(logDir)) {
							var logFile = fs.readdirSync(logDir).filter(function(v){return path.extname(v)=='.log'; })[0];
							if (logFile) {
								logFile = path.join(logDir,logFile);
								logStream = fs.createReadStream(logFile);
								streamLogger.attach(stream);
							}
						}
					});
				}

				findLog();
			});
		});
	});
}
