/**
 * Xcode utilities
 */
var exec = require('child_process').exec,
	fs = require('fs'),
	path = require('path'),
	xcodepath,
	sysframeworks,
	sysframeworkDir,
	xcodeSettings;

exports.detect = detect;
exports.settings = settings;
exports.systemFrameworks = systemFrameworks;
exports.frameworksFromDir = frameworksFromDir;
/**
 * return the currently configured active xcode path
 */
function detect(callback) {
	if (xcodepath) {
		return callback(null,xcodepath);
	}
	var cmd = "/usr/bin/xcode-select -print-path";
	exec(cmd, function(err, stdout, stderr){
		err && callback(new Error(stderr));
		callback(null,(xcodepath=stdout.trim()));
	});
}

/**
 * get the system frameworks
 */
function systemFrameworks(callback) {
	if (sysframeworks) {
		return callback(null, sysframeworks, sysframeworkDir);
	}
	settings(function(err,config){
		if (err) {
			return callback(err);	
		} 
		sysframeworkDir = path.join(config.simSDKPath,'System','Library','Frameworks');
		frameworksFromDir(sysframeworkDir, function(err, fm){
			sysframeworks = fm;
			callback(err, fm, sysframeworkDir);
		});
	});
}

/**
 * gets frameworks from a specific directory
 */
function frameworksFromDir(frameworkDir, callback) {
	if(frameworkDir == null || !fs.existsSync(frameworkDir)) {
		callback(null, []);
		return;
	}
	var r = /(.*)\.framework$/;
	fs.readdir(frameworkDir, function(err,paths) {
		if (err) return callback(err);
		var fw = paths
			.map(function(v) {
				var p = path.join(frameworkDir,v);
				if (r.test(v) && fs.existsSync(p)) {
					var module_map = path.join(p, 'module.map'),
						fw = r.exec(v)[1];
					if (fs.existsSync(module_map)) {
						var map = fs.readFileSync(module_map,'utf8').toString(),
							m = /umbrella header "(.*)"/.exec(map),
							header = m && m.length && m[1],
							headerPath = header && path.join(p,'Headers',header);
						if (header && fs.existsSync(headerPath)) {
							return {
								header: headerPath,
								directory: path.dirname(headerPath),
								relative: '<'+fw+'/'+m[1]+'>',
								name: fw
							};
						}
					}
					var headerPath = path.join(p, 'Headers', fw+'.h');
					if (fs.existsSync(headerPath)) {
						return {
							header: headerPath,
							directory: path.dirname(headerPath),
							relative: '<'+fw+'/'+fw+'.h>',
							name: fw
						};
					}
				}
			})
			.filter(function(v){
				return v && v.name!=='JavaScriptCore'; //FIXME: for now we have an issue compiling JSCore
			});
		callback(null, fw);
	});
}

/**
 * get the current Xcode settings such as paths for build tools
 */
function settings (callback) {
	if (xcodeSettings) {
		return callback(null,xcodeSettings);
	}
	detect(function(err,xcode){
		if (err) { return callback(err); }
		var devicePath = path.join(xcode,'Platforms','iPhoneOS.platform'),
			simPath = path.join(xcode,'Platforms','iPhoneSimulator.platform'),
			simSDKsDir = path.join(simPath,'Developer','SDKs'),
			deviceSDKsDir = path.join(devicePath,'Developer','SDKs'),
			usrbin = path.join(xcode,'Toolchains','XcodeDefault.xctoolchain','usr','bin'),
			clang = path.join(usrbin,'clang'),
			clang_xx = path.join(usrbin,'clang++'),
			libtool = path.join(usrbin, 'libtool'),
			lipo = path.join(usrbin, 'lipo'),
			otool = path.join(usrbin, 'otool'),
			sdks;

		try {
			sdks = fs.readdirSync(deviceSDKsDir);
		} catch (e) {
			log.error('iOS Developer directory not found at "' + xcode + '". Run:');
			log.error(' ');
			log.error('    /usr/bin/xcode-select -print-path');
			log.error(' ');
			log.error('and make sure it exists and contains your iOS SDKs. If it does not, run:');
			log.error(' ');
			log.error('    sudo /usr/bin/xcode-select -switch /path/to/Developer');
			log.error(' ');
			log.error('and try again. Here\'s some guesses:');
			return callback(JSON.stringify(['/Developer','/Library/Developer','/Applications/Xcode.app/Contents/Developer'], null, '  '));
		}
		if (sdks.length===0) {
			return callback(new Error('no SDKs found at '+deviceSDKsDir));
		}
		var versions = [];
		sdks.forEach(function(f){
			var v = f.replace('.sdk','').replace('iPhoneOS','');
			versions.push(v);
		});
		versions = versions.length > 1 ? versions.sort() : versions;
		var version = versions[versions.length-1],
			simSDKPath = path.join(simSDKsDir, 'iPhoneSimulator'+version+'.sdk'),
			deviceSDKPath = path.join(deviceSDKsDir, 'iPhoneOS'+version+'.sdk');

		callback(null,(xcodeSettings = {
			xcodePath: xcode,
			version: version,
			clang: clang,
			clang_xx: clang_xx,
			libtool: libtool,
			lipo: lipo,
			otool: otool,
			simSDKPath: simSDKPath,
			deviceSDKPath: deviceSDKPath
		}));
	});
}