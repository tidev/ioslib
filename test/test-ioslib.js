/**
 * Tests ioslib main detect function.
 *
 * @copyright
 * Copyright (c) 2014 by Appcelerator, Inc. All Rights Reserved.
 *
 * @license
 * Licensed under the terms of the Apache Public License.
 * Please see the LICENSE included with this distribution for details.
 */

var ioslib = require('..'),
	fs = require('fs');

describe('ioslib', function () {
	it('namespace should be an object', function () {
		should(ioslib).be.an.Object;
		should(ioslib.detect).be.a.Function;
	});

	it('detect all iOS information', function (done) {
		this.timeout(30000);
		this.slow(25000);

		ioslib.detect(function (err, results) {
			if (err) {
				return done(err);
			}

			should(results).be.an.Object;
			should(results).have.keys('detectVersion', 'issues', 'devices', 'provisioning', 'executables', 'selectedXcode',
				'xcode', 'certs', 'teams', 'simulators');

			should(results.detectVersion).be.a.String;

			should(results.issues).be.an.Array;
			results.issues.forEach(function (issue) {
				should(issue).be.an.Object;
				should(issue).have.property('id');
				should(issue).have.property('type');
				should(issue).have.property('message');
				should(issue.id).be.a.String;
				should(issue.type).be.a.String;
				should(issue.type).match(/^info|warning|error$/);
				should(issue.message).be.a.String;
			});

			should(results.devices).be.an.Array;
			results.devices.forEach(function (dev) {
				should(dev).be.an.Object;
				should(dev).have.keys('udid', 'name', 'buildVersion', 'cpuArchitecture', 'deviceClass', 'deviceColor',
					'hardwareModel', 'modelNumber', 'productType', 'productVersion', 'serialNumber');

				should(dev.udid).be.a.String;
				should(dev.udid).not.equal('');

				should(dev.name).be.a.String;
				should(dev.name).not.equal('');

				should(dev.buildVersion).be.a.String;
				should(dev.buildVersion).not.equal('');

				should(dev.cpuArchitecture).be.a.String;
				should(dev.cpuArchitecture).not.equal('');

				should(dev.deviceClass).be.a.String;
				should(dev.deviceClass).not.equal('');

				should(dev.deviceColor).be.a.String;
				should(dev.deviceColor).not.equal('');

				should(dev.hardwareModel).be.a.String;
				should(dev.hardwareModel).not.equal('');

				should(dev.modelNumber).be.a.String;
				should(dev.modelNumber).not.equal('');

				should(dev.productType).be.a.String;
				should(dev.productType).not.equal('');

				should(dev.productVersion).be.a.String;
				should(dev.productVersion).not.equal('');

				should(dev.serialNumber).be.a.String;
				should(dev.serialNumber).not.equal('');
			});

			should(results.provisioning).be.an.Object;
			should(results.provisioning).have.keys('profileDir', 'development', 'distribution', 'adhoc');

			should(results.provisioning.profileDir).be.a.String;
			should(results.provisioning.profileDir).not.equal('');

			function checkProfiles(list) {
				list.forEach(function (pp) {
					should(pp).be.an.Object;
					should(pp).have.keys('file', 'uuid', 'name', 'appPrefix', 'creationDate', 'expirationDate', 'expired', 'certs', 'devices', 'team', 'appId', 'getTaskAllow', 'apsEnvironment');

					should(pp.file).be.a.String;
					should(pp.file).not.equal('');

					should(pp.uuid).be.a.String;
					should(pp.uuid).not.equal('');

					should(pp.name).be.a.String;
					should(pp.name).not.equal('');

					should(pp.appPrefix).be.a.String;
					should(pp.appPrefix).not.equal('');

					should(pp.creationDate).be.a.Date;
					should(pp.expirationDate).be.a.Date;

					should(pp.expired).be.a.Boolean;

					should(pp.certs).be.an.Array;
					pp.certs.forEach(function (s) {
						should(s).be.a.String;
						should(s).not.equal('');
					});

					if (pp.devices !== null) {
						should(pp.devices).be.an.Array;
						pp.devices.forEach(function (s) {
							should(s).be.a.String;
							should(s).not.equal('');
						});
					}

					should(pp.team).be.an.Array;
					pp.team.forEach(function (s) {
						should(s).be.a.String;
						should(s).not.equal('');
					});

					should(pp.appId).be.a.String;
					should(pp.appId).not.equal('');

					should(pp.getTaskAllow).be.a.Boolean;

					should(pp.apsEnvironment).be.a.String;
				});
			}

			should(results.provisioning.development).be.an.Array;
			checkProfiles(results.provisioning.development);

			should(results.provisioning.distribution).be.an.Array;
			checkProfiles(results.provisioning.distribution);

			should(results.provisioning.adhoc).be.an.Array;
			checkProfiles(results.provisioning.adhoc);

			should(results.executables).be.an.Object;
			should(results.executables).have.keys('xcodeSelect', 'security');

			should(results.executables.xcodeSelect).be.a.String;
			should(results.executables.xcodeSelect).not.equal('');

			should(results.executables.security).be.a.String;
			should(results.executables.security).not.equal('');

			function checkXcode(xcode) {
				should(xcode).be.an.Object;
				should(xcode).have.keys('xcodeapp', 'path', 'selected', 'version', 'build', 'supported', 'eulaAccepted', 'sdks', 'sims', 'simDeviceTypes', 'simRuntimes', 'watchos', 'tvos', 'teams', 'executables');

				should(xcode.xcodeapp).be.a.String;
				should(xcode.xcodeapp).not.equal('');
				should(fs.existsSync(xcode.xcodeapp)).be.true;
				should(fs.statSync(xcode.xcodeapp).isDirectory()).be.true;

				should(xcode.path).be.a.String;
				should(xcode.path).not.equal('');
				should(fs.existsSync(xcode.path)).be.true;
				should(fs.statSync(xcode.path).isDirectory()).be.true;

				should(xcode.selected).be.a.Boolean;

				should(xcode.version).be.a.String;
				should(xcode.version).not.equal('');

				should(xcode.build).be.a.String;
				should(xcode.build).not.equal('');

				should([null, true, false, 'maybe']).containEql(xcode.supported);

				should(xcode.sdks).be.an.Array;
				xcode.sdks.forEach(function (s) {
					should(s).be.a.String;
					should(s).not.equal('');
				});

				should(xcode.sims).be.an.Array;
				xcode.sims.forEach(function (s) {
					should(s).be.a.String;
					should(s).not.equal('');
				});

				var keys = ['xcodebuild', 'clang', 'clang_xx', 'libtool', 'lipo', 'otool', 'pngcrush', 'simulator', 'watchsimulator', 'simctl'];
				should(xcode.executables).be.an.Object;
				keys.forEach(function (key) {
					should(xcode.executables).have.property(key);
					if (xcode.executables[key] !== null) {
						should(xcode.executables[key]).be.a.String;
						should(xcode.executables[key]).not.equal('');
						should(fs.existsSync(xcode.executables[key])).be.true;
						should(fs.statSync(xcode.executables[key]).isDirectory()).be.false;
					}
				});
			}

			should(results.selectedXcode).be.an.Object;
			checkXcode(results.selectedXcode);

			should(results.xcode).be.an.Object;
			Object.keys(results.xcode).forEach(function (ver) {
				checkXcode(results.xcode[ver]);
			});

			should(results.certs).have.keys('keychains', 'wwdr');
			should(results.certs.keychains).be.an.Object;
			should(results.certs.wwdr).be.a.Boolean;

			Object.keys(results.certs.keychains).forEach(function (keychain) {
				should(results.certs.keychains[keychain]).be.an.Object;
				should(results.certs.keychains[keychain]).have.keys('developer', 'distribution');
				should(results.certs.keychains[keychain].developer).be.an.Array;
				results.certs.keychains[keychain].developer.forEach(function (d) {
					should(d).be.an.Object;
					should(d).have.keys('name', 'fullname', 'pem', 'before', 'after', 'expired', 'invalid');
					should(d.name).be.a.String;
					should(d.pem).be.a.String;
					should(d.before).be.a.Date;
					should(d.after).be.a.Date;
					should(d.expired).be.a.Boolean;
					should(d.invalid).be.a.Boolean;
				});
				should(results.certs.keychains[keychain].distribution).be.an.Array;
				results.certs.keychains[keychain].distribution.forEach(function (d) {
					should(d).be.an.Object;
					should(d).have.keys('name', 'fullname', 'pem', 'before', 'after', 'expired', 'invalid');
					should(d.name).be.a.String;
					should(d.pem).be.a.String;
					should(d.before).be.a.Date;
					should(d.after).be.a.Date;
					should(d.expired).be.a.Boolean;
					should(d.invalid).be.a.Boolean;
				});
			});

			done();
		});
	});

	(process.env.CI ? it.skip : it)('should find a device/cert/profile combination', function (done) {
		this.timeout(10000);
		this.slow(10000);

		ioslib.findValidDeviceCertProfileCombos({
			appId: 'com.appcelerator.TestApp'
		}, function (err, results) {
			if (err) {
				return done(err);
			}

			should(results).be.an.Array;
			results.forEach(function (combo) {
				should(combo).be.an.Object;
				should(combo).have.keys('ppUUID', 'certName', 'deviceUDID');

				should(combo.ppUUID).be.a.String;
				should(combo.ppUUID).not.equal('');

				should(combo.certName).be.a.String;
				should(combo.certName).not.equal('');

				should(combo.deviceUDID).be.a.String;
				should(combo.deviceUDID).not.equal('');
			});

			done();
		});
	});
});
