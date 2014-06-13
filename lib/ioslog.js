/**
 * iOS log stream class
 */
var log = require('./log'),
	logRegex = /^\[(INFO|DEBUG|ERROR|FATAL|WARN|TRACE)\]\s+(.*)/;


module.exports = exports = IOSLogger;

/**
 * name should be the name of the application and callback is an optional function
 * which should be called instead of calling log.  The callback will be called with
 * the level and message as arguments.
 */
function IOSLogger(name, callback, stderr_is_output, default_level) {
	if (!name) throw new Error("missing application name");
	this.name = name;
	this.logRE = new RegExp(name+'\\[\\w+\\:\\w+\\]\\s+(.*)'),
	this.logs = {};
	this.callback = callback;
	this.stderr_is_output = stderr_is_output;
	this.default_level = default_level || 'debug';
}

/**
 * attach this logger to stream's stderr and stdout data event and will
 * automatically attach to end to flush any remaining data in the buffer
 */
IOSLogger.prototype.attach = function(stream) {
	if (stream.stderr) {
		stream.stderr.on('data', this.stderr.bind(this));
		stream.stderr.on('end', this.flush.bind(this));
	}
	if (stream.stdout) {
		stream.stdout.on('data', this.stdout.bind(this));
		stream.stdout.on('end', this.flush.bind(this));
	}
	// if a tail stream, listen for line event
	if (!stream.stdout && !stream.stderr && stream.watch) {
		stream.on('line', this.stdout.bind(this));
		return;
	}
	// if a direct stream, just attach
	if (!stream.stdout && !stream.stderr && stream.on) {
		stream.on('data', this.stdout.bind(this));
		stream.on('end', this.flush.bind(this));
	}
};

IOSLogger.prototype.stdout = function(buf) {
	performLog(this,'stdout',String(buf), this.default_level);
};

IOSLogger.prototype.stderr = function(buf) {
	performLog(this, this.stderr_is_output ? 'stdout' : 'stderr',String(buf), this.default_level);
};

IOSLogger.prototype.flush = function() {
	performLog(this,'stdout','\n',this.default_level);
	performLog(this,'stderr','\n',this.default_level);
};

function parseLogLine(logger, buf) {
	var m = logger.logRE.exec(buf),
		label;

	if (m) {
		buf = m[1];
	}

	m = logRegex.exec(buf);

	if (m) {
		label = m[1].toLowerCase();
		buf = m[2];
	}
	return {
		label: label,
		buffer: buf
	};
}

function handle(logger, label, message) {
	if (!message) return;
	if (logger.callback) {
		logger.callback(label,message);
	}
	else {
		log[label](message);
	}
}

function performLog (logger, label, buf, default_level) {
	if (!buf || buf==='\n') return;
	var entry = logger.logs[label],
		lbl = (label === 'stderr' ? 'error' : default_level);
	if (entry) {
		buf = entry.buf + buf;
		lbl = entry.lbl;
	} 
	// console.log('performLog','['+buf+']')
	var lines = buf.split(/[\n\r]/),
		lastLabel,
		pending = [];
	// console.log('lines=',lines)
	// the basic logic is that we try and keep lines collated together.
	// if a line starts with a label (such as [DEBUG]) and subsequent lines don't have a label, 
	// we try and join them together as one buffer line (for example, a multi-line stack trace coming 
	// out as part of one log.debug).  however, if a subsequent line has a label, then it should get sent
	// separately
	for (var c=0;c<lines.length;c++) {
		var line = lines[c],
			obj = parseLogLine(logger,line);
		// console.log(c+',',obj)
		if (obj.buffer) {
			if (obj.label && pending.length || !lastLabel && pending.length) {
				handle(logger,lastLabel||lbl,pending.join('\n'));
				pending=[];
			}
			pending.push(obj.buffer);
			obj.label && (lastLabel = obj.label);
		}
	}
	// flush remaining buffer
	pending.length && handle(logger,lastLabel||lbl,pending.join('\n'));
}
