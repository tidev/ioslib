/**
 * log utility
 */
var os = require('os'),
	fs = require('fs'),
	utils = require('util'),
	exec = require('child_process').exec,
	colors = require('colors');

var RESET = '\x1b[39m';
var levels = {
	trace: {
		prefix: '[TRACE] ',
		color: '\x1B[90m',
		level: 1
	},
	debug: {
		prefix: '[DEBUG] ',
		color: '\x1b[36m',
		level: 2
	},
	info: {
		prefix: '[INFO]  ',
		color: '\x1b[32m',
		level: 3
	},
	log: {
		prefix: '',
		color: '\x1b[37m',
		level: 3
	},
	warn: {
		prefix: '[WARN]  ',
		color: '\x1b[33m',
		level: 4
	},
	error: {
		prefix: '[ERROR] ',
		color: '\x1b[31m',
		level: 5
	},
	fatal: {
		prefix: '[ERROR] ',
		color: '\x1b[31m',
		level: 5
	},
	quiet: {
		level: 99
	}
};

var reportBuffer = [];

exports.report = false;
exports.level = 'info';
exports.useColor = true;
exports.shouldLog = shouldLog;
exports.exit = exit;

// export log functions based on level definitions
Object.keys(levels).forEach(function(key) {
	if (key === 'quiet') { return; }
	exports[key] = function() {
		log.apply(this, [key].concat(Array.prototype.slice.call(arguments)));
		if (key === 'fatal') {
			// If debugging,
			if (shouldLog('debug')) {
				// Let's output a stack trace, one way or another.
				for (var i = 0, iL = arguments.length; i < iL; i++) {
					arguments[i] && arguments[i].stack && exports.debug('Trace: Argument ' + i + ':', arguments[i].stack);
				}
				console.trace('to log.fatal:');
			}
			exit(1);
		}
	};
});

/**
 * Check if the passed in logging level (such as trace, debug, etc) should be output, based on the currently set global
 * log-level.
 * @param key
 * @returns {boolean}
 */
function shouldLog(key) {
	var thisLevel = levels[key].level,
		globalLevel = levels[exports.level].level;
	return thisLevel >= globalLevel;
}

/**
 * Exits the process, giving the logger an opportunity to --report, if necessary.
 * @param statusCode
 */
function exit(statusCode) {
	function indentify(text) {
		return '\t' + text.split('\n').join('\n\t');
	}
	// if (statusCode !== undefined && statusCode !== 0 && !exports.report) {
	// 	exports.error('Hint: If you think you have found a bug, run again with '.grey + '--report'.bold + ' to report it.'.grey);
	// 	!shouldLog('debug') && exports.error('Running with '.grey + '--debug'.bold + ' can also give you more information on what is going wrong.'.grey);
	// }
	if (exports.report) {
		// TODO: Use the --platform= to determine the label.
		var platform = process.platform,
			isWindows = platform === 'win32',
			isMac = platform === 'darwin',
			programToCopy = isWindows ? 'clip' : isMac ? 'pbcopy' : 'xclip',
			programToOpenBrowser = isWindows ? 'start' : isMac ? 'open' : 'xdg-open',
			labels = isWindows ? 'win8' : isMac ? 'ios' : 'android',
			body = '',
			xcodeSettingsCached = isMac && require('../../platforms/ios/lib/buildlib').getXcodeSettingsCached();

		body += '## Please Describe Your Issue\n\n\n';
		body += '\n\n## Log Trace\nPlease paste your log trace between the quotes below (hint: it should already be in your clipboard).\n```\n\n```\n';
		body += '\n\n### When Running Command\n\t' + process.argv.join(' ');
		body += '\n\n### Node Versions\n' + indentify(JSON.stringify(process.versions, undefined, 4));
		if (xcodeSettingsCached) {
			body += '\n\n### Xcode';
			Object.keys(xcodeSettingsCached).forEach(function(key) {
				body += '\n**' + key + '**: ' + xcodeSettingsCached[key];
			});
		}
		body += '\n\n### OS';
		[ 'type', 'platform', 'arch', 'release' ].forEach(function(key) {
			body += '\n**' + key + '**: ' + os[key]();
		});
		[ 'freemem', 'totalmem' ].forEach(function(key) {
			body += '\n**' + key + '**: ' + bytesToSize(os[key]());
		});

		var url = 'https://github.com/appcelerator/hyperloop/issues/new?' +
				'labels=' + labels + '&' +
				'body=' + encodeURIComponent(body),
			trace = reportBuffer.join(os.EOL);

		if (isWindows) {
			url = url.replace(/&/g, '^&');
		}
		else if (isMac) {
			url = "'" + url.replace(/'/g, "'\''") + "'";
		}

		fs.writeFileSync('./trace.log', trace, 'utf8');
		console.log('Copying log trace to your clipboard, and then opening GitHub issues for Hyperloop.');
		exec(programToCopy + ' < trace.log');
		exec(programToOpenBrowser + ' ' + url);

		// Busy wait for 1 second to give the browser time to launch.
		var until = Date.now() + 2000;
		while (until > Date.now()) {}
	}
	process.exit(statusCode);
}

/**
 * Converts an integer number of bytes to a nicely formatted string.
 * Original: http://stackoverflow.com/questions/15900485/correctly-way-to-convert-size-in-bytes-to-kb-mb-gb-in-javascript
 * @param bytes
 * @returns {string}
 */
function bytesToSize(bytes) {
	var sizes = [ 'Bytes', 'KB', 'MB', 'GB', 'TB' ];
	if (bytes == 0) {
		return '0 Bytes';
	}
	var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
	return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}

/**
 * remove any ANSI color codes from the string
 */
function stripColors(str) {
  return String(str).replace(/\u001b\[\d+m/g,'');
}

function rtrim(line) {
	return line.replace(/[\n\r]+$/,'');
}

// main log function
function log() {
	var key  = arguments[0];
	var args = Array.prototype.slice.call(arguments, 1) || [];
	var obj = levels[key];

	exports.report && reportBuffer.push(obj.prefix + stripColors(args.join(' ')));

	// skip logging if log level is too low
	if (!shouldLog(key)) return;

	// we want to dump objects
	args = args.map(function(a){ if (typeof(a)==='object') { return utils.inspect(a) } return String(a) });

	// trim end string
	args.length && (args[args.length-1] = rtrim(args[args.length-1]));

	// add prefix to first argument
	if (args[0]) {
		args[0] = obj.color + obj.prefix + RESET + args[0];
	}

	// strip color, if necessary (either explicitly disabled or if not attached to tty)
	if ((typeof(exports.useColor)!=='undefined' && exports.useColor===false) || 
		exports.useColor === false ||
		(!process.stdout.isTTY && exports.useColor===false)) {
		for (var i = 0; i < args.length; i++) {
			args[i] = stripColors(args[i]);
		}
	}

	// execute the log call
	console.log.apply(this, args);
}
