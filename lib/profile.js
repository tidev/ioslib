/**
 * ios provisioning profiles
 */
var fs = require('fs'),
	path = require('path'),
	async = require('async'),
	exec = require('child_process').exec,
	minimatch = require('minimatch'),
	device = require('./device');


exports.find = find;
exports.findAll = findAll;

/** 
 * find all valid provisioning profiles that match appid.  if appid is null or the first argument is the callback,
 * return all valid provisioning profiles.
 *
 * will filter based on the connected ios device.  if no connected device, an error will be returned as the first 
 * parameter of the result callback.
 */
function find (appid, callback) {
	if (typeof appid === 'function') {
		callback = appid;
		appid = null;
	}
	findAll(appid, callback, false);
}

/**
 * find all provisioning profile
 */
function findAll (appid, callback, wildcard) {
	var provisionProfilesDir = path.join(process.env.HOME, 'Library','MobileDevice','Provisioning Profiles');
	device.detect(function(err,uuids) {
		if (err) { return callback(err); }
		if (!wildcard && uuids.length===0) {
			return callback("no connected ios device");
		}
		var tasks = [],
			device_id = uuids && uuids[0],
			identities = {};

		// look for iPhone Developer cert
		tasks.push(function(next){
			var cmd = '/usr/bin/security find-identity -v -p codesigning -v | /usr/bin/grep "iPhone Developer"';
			// console.log(cmd);
			exec(cmd, function(err,stdout,stderr) {
				if (err) { return callback(err); }
				stdout.trim().split(/\n/).forEach(function(k){
					var tok = k.trim().split('"'),
						key = tok[0].split(' ')[1].trim(),
						name = tok[1];
					identities[key] = {name:name, pem:null, profiles:[]};
				});
				next();
			});
		});
		tasks.push(function(next){
			var subtasks = [];
			Object.keys(identities).forEach(function(key){
				subtasks.push(function(_next){
					var identity = identities[key],
						cmd = '/usr/bin/security find-certificate -c "'+identity.name+'" -p';
					// console.log(cmd);
					exec(cmd, function(err,stdout,stderr){
						if (err) { return callback(err); }
						var split = stdout.trim().split(/\n/);
						identities[key].pem = split.splice(1,split.length-2).join('\n');
						_next();
					});
				});
			});
			async.series(subtasks,next);
		});
		
		tasks.push(function(next){
			fs.readdir(provisionProfilesDir, function(err, files){
				if (err) { return callback(err); }
				files.forEach(function(file){
					if (path.extname(file)!=='.mobileprovision') return;
					var fn = path.join(provisionProfilesDir, file),
						content = fs.readFileSync(fn).toString();
					Object.keys(identities).forEach(function(identity){
						var obj = identities[identity],
							pemStr = obj.pem.substring(0,40), // get enough uniqueness in the cert
							appidPattern = /<string>(.*?)<\/string>\s/,
							datePattern = /<date>(.*?)<\/date>\s/; 
						// look for our PEM certificate
						if (wildcard || content.indexOf(pemStr) > 0) {
							if (wildcard || content.indexOf(device_id) > 0) {
								var search = '<key>application-identifier</key>',
									idx = content.indexOf(search),
									identifier = appidPattern.exec(content.substring(idx+search.length))[1],
									pattern = identifier.split('.').splice(1).join('.');
								// make sure the application-identifier is valid for our appid
								if (!appid || minimatch(appid, pattern)) {
									search = '<key>ExpirationDate</key>',
									idx = content.indexOf(search);
									var expiry = Date.parse(datePattern.exec(content.substring(idx+search.length))[1]),
										expired = Date.now() > expiry;
									// make sure certificate hasn't expired
									if (wildcard || !expired) {
										var pn = path.basename(fn).replace(/\.mobileprovision$/,'');
										obj.profiles.push({
											uuid: pn,
											filename: fn,
											appPrefix: identifier.split('.')[0],
											appId: pattern,
											expirationDate: new Date(expiry),
											expired: expired
										});
									}
								}
							}
						}
					});
				});
				next();
			});
		});

		async.series(tasks, function(err){
			var result = {
				identities: identities
			};
			if (wildcard) {
				result.devices = uuids;
			}
			else {
				result.device_id = device_id;
			}
			callback(err, result);
		});
	});
}
