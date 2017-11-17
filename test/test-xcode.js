import path from 'path';

import * as ioslib from '../dist/index';

describe('Xcode', () => {
	it('should error if dir is not valid', () => {
		expect(() => {
			new ioslib.xcode.Xcode();
		}).to.throw(TypeError, 'Expected directory to be a valid string');

		expect(() => {
			new ioslib.xcode.Xcode('');
		}).to.throw(TypeError, 'Expected directory to be a valid string');
	});

	it('should error if dir does not exist', () => {
		expect(() => {
			new ioslib.xcode.Xcode(path.join(__dirname, 'does_not_exist'));
		}).to.throw(Error, 'Directory does not exist');
	});

	it('should fail if xcodebuild not found', () => {
		expect(() => {
			new ioslib.xcode.Xcode(path.join(__dirname, 'fixtures', 'BadXcode.app'));
		}).to.throw(Error, '"xcodebuild" not found');
	});

	it('should fail if the version.plist is not found', () => {
		expect(() => {
			new ioslib.xcode.Xcode(path.join(__dirname, 'fixtures', 'IncompleteXcode.app'));
		}).to.throw(Error, '"version.plist" not found');
	});

	it('should fail if the Xcode version is too old', () => {
		expect(() => {
			new ioslib.xcode.Xcode(path.join(__dirname, 'fixtures', 'OldXcode.app'));
		}).to.throw(Error, 'Found Xcode 5.0, but it is too old and unsupported');
	});

	it('should detect a Xcode 8 install', () => {
		const dir = path.join(__dirname, 'fixtures/Xcode8.app');
		const simapp = path.join(dir, 'Contents/Developer/Applications/Simulator.app/Contents/MacOS/Simulator');
		const simwatchapp = path.join(dir, 'Contents/Developer/Applications/Simulator (Watch).app/Contents/MacOS/Simulator (Watch)');
		const xcode = new ioslib.xcode.Xcode(dir);

		expect(xcode).to.be.an('object');

		// the Xcode object will merge 'global' sim device types and runtimes with those found in
		// the path and this can make testing difficult, so just remove them and manually check
		const { simDeviceTypes, simRuntimes } = xcode;
		xcode.simDeviceTypes = {};
		xcode.simRuntimes = {};
		xcode.simDevicePairs = {};

		expect(xcode).to.deep.equal({
			path: path.join(dir, 'Contents/Developer'),
			xcodeapp: dir,
			version: '8.3.3',
			build: '8E3004b',
			id: '8.3.3:8E3004b',
			executables: {
				simulator: simapp,
				watchsimulator: simwatchapp,
				xcodebuild: path.join(dir, 'Contents/Developer/usr/bin/xcodebuild')
			},
			eulaAccepted: true,
			sdks: {
				ios: [ '10.3.1' ],
				watchos: []
			},
			simctl: {
				bin: path.join(dir, 'Contents/Developer/usr/bin/simctl')
			},
			simDeviceTypes: {},
			simRuntimes: {},
			simDevicePairs: {}
		});

		expect(simDeviceTypes).to.be.an('object');
		for (const id of Object.keys(simDeviceTypes)) {
			expect(simDeviceTypes[id]).to.be.an('object');
			expect(simDeviceTypes[id]).to.have.keys('name', 'model', 'supportsWatch');
		}

		expect(simRuntimes).to.be.an('object');
		for (const id of Object.keys(simRuntimes)) {
			expect(simRuntimes[id]).to.be.an('object');
			expect(simRuntimes[id]).to.have.keys('name', 'version');
		}
	});

	it('should detect a Xcode 9 install', () => {
		const dir = path.join(__dirname, 'fixtures/Xcode9.app');
		const simapp = path.join(dir, 'Contents/Developer/Applications/Simulator.app/Contents/MacOS/Simulator');
		const xcode = new ioslib.xcode.Xcode(dir);

		expect(xcode).to.be.an('object');

		// the Xcode object will merge 'global' sim device types and runtimes with those found in
		// the path and this can make testing difficult, so just remove them and manually check
		const { simDeviceTypes, simRuntimes } = xcode;
		xcode.simDeviceTypes = {};
		xcode.simRuntimes = {};
		xcode.simDevicePairs = {};

		expect(xcode).to.deep.equal({
			path: path.join(dir, 'Contents/Developer'),
			xcodeapp: dir,
			version: '9.0',
			build: '9A235',
			id: '9.0:9A235',
			executables: {
				simulator: simapp,
				watchsimulator: simapp,
				xcodebuild: path.join(dir, 'Contents/Developer/usr/bin/xcodebuild')
			},
			eulaAccepted: true,
			sdks: {
				ios: [ '11.0', '10.3.1' ],
				watchos: []
			},
			simctl: {
				bin: path.join(dir, 'Contents/Developer/usr/bin/simctl')
			},
			simDeviceTypes: {},
			simRuntimes: {},
			simDevicePairs: {}
		});

		expect(simDeviceTypes).to.be.an('object');
		for (const id of Object.keys(simDeviceTypes)) {
			expect(simDeviceTypes[id]).to.be.an('object');
			expect(simDeviceTypes[id]).to.have.keys('name', 'model', 'supportsWatch');
		}

		expect(simRuntimes).to.be.an('object');
		for (const id of Object.keys(simRuntimes)) {
			expect(simRuntimes[id]).to.be.an('object');
			expect(simRuntimes[id]).to.have.keys('name', 'version');
		}
	});
});
