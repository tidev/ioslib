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
	var provisionProfilesDir = path.join(process.env.HOME, 'Library','MobileDevice','Provisioning Profiles');
	device.detect(function(err,uuids) {
		if (err) { return callback(err); }
		if (uuids.length===0) {
			return callback("no connected ios device");
		}
		var tasks = [],
			device_id = uuids[0],
			codesign,
			pem;
		tasks.push(function(next){
			var cmd = '/usr/bin/security find-identity -v -p codesigning -v | /usr/bin/grep "iPhone" | /usr/bin/awk \'BEGIN {FS="\\""} {print $2}\' | /usr/bin/head -n1';
			// console.log(cmd);
			exec(cmd, function(err,stdout,stderr) {
				if (err) { return callback(err); }
				codesign = stdout.trim();
				next(null, codesign);
			});
		});
		tasks.push(function(next){
			var cmd = '/usr/bin/security find-certificate -c "'+codesign+'" -p';
			// console.log(cmd);
			exec(cmd, function(err,stdout,stderr){
				if (err) { return callback(err); }
				var split = stdout.trim().split(/\n/);
				pem = split.splice(1,split.length-2).join('\n');
				next(null, pem);
			});
		});
		tasks.push(function(next){
			var pemStr = pem.substring(0,20), // get enough uniqueness in the cert
				appidPattern = /<string>(.*?)<\/string>\s/,
				datePattern = /<date>(.*?)<\/date>\s/; 

			fs.readdir(provisionProfilesDir, function(err, files){
				if (err) { return callback(err); }
				var valid_profiles = files.map(function(file){
					if (path.extname(file)!=='.mobileprovision') return;
					var fn = path.join(provisionProfilesDir, file),
						content = fs.readFileSync(fn).toString();
					// look for our PEM certificate
					if (content.indexOf(pemStr) > 0) {
						if (content.indexOf(device_id) > 0) {
							var search = '<key>application-identifier</key>',
								idx = content.indexOf(search),
								pattern = appidPattern.exec(content.substring(idx+search.length))[1];
							pattern = pattern.split('.').splice(1).join('.');
							// make sure the application-identifier is valid for our appid
							if (!appid || minimatch(appid, pattern)) {
								search = '<key>ExpirationDate</key>',
								idx = content.indexOf(search),
								pattern = Date.parse(datePattern.exec(content.substring(idx+search.length))[1]);
								// make sure certificate hasn't expired
								if (Date.now() < pattern) {
									return path.basename(fn).replace(/\.mobileprovision$/,'');
								}
							}
						}
					}
				}).filter(function(v) { return v }); // filter out any undefined entries
				next(null, valid_profiles);
			});
		});

		async.series(tasks, function(err,results){
			callback(err, {
				profiles: err ? null : results[2],
				pem: err ? null : pem,
				device_id: device_id,
				developer_name: codesign
			});
		});
	});
}
