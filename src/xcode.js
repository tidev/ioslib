import fs from 'fs';
import options from './options';
import path from 'path';
import plist from 'simple-plist';

import { expandPath } from 'appcd-path';
import { isDir, isFile } from 'appcd-fs';
import { spawnSync } from 'child_process';

const version = {
	gte(a, b) {
		a = [ ...String(a).split('.'), 0, 0, 0 ].slice(0, 3).map(n => parseInt(n));
		b = [ ...String(b).split('.'), 0, 0, 0 ].slice(0, 3).map(n => parseInt(n));
		return a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2])));
	},

	lt(a, b) {
		return !version.gte(a, b);
	},

	rcompare(a, b) {
		return a === b ? 0 : a < b ? 1 : -1;
	}
};

/**
 * Directories to scan for Xcode installations.
 * @type {Array.<String>}
 */
export const xcodeLocations = [
	'/Applications',
	'~/Applications'
];

export const globalSimProfilesPath = '/Library/Developer/CoreSimulator/Profiles';

/**
 * Xcode information object.
 */
export class Xcode {
	/**
	 * Checks if the specified directory is an Xcode.
	 *
	 * @param {String} dir - The directory to check.
	 * @access public
	 */
	constructor(dir) {
		if (typeof dir !== 'string' || !dir) {
			throw new TypeError('Expected directory to be a valid string');
		}

		dir = expandPath(dir);
		if (!isDir(dir)) {
			throw new Error('Directory does not exist');
		}

		let xcodebuild = path.join(dir, 'usr', 'bin', 'xcodebuild');
		if (!isFile(xcodebuild)) {
			xcodebuild = path.join(dir, 'Developer', 'usr', 'bin', 'xcodebuild');
		}
		if (!isFile(xcodebuild)) {
			xcodebuild = path.join(dir, 'Contents', 'Developer', 'usr', 'bin', 'xcodebuild');
		}
		if (!isFile(xcodebuild)) {
			throw new Error('"xcodebuild" not found');
		}

		// now that we've found xcodebuild, trim off all the directories to get us to the Xcode path
		dir = path.resolve(path.dirname(xcodebuild), '../..');

		const versionPlistFile = path.resolve(dir, '../version.plist');
		if (!isFile(versionPlistFile)) {
			throw new Error('"version.plist" not found');
		}
		const versionPlist = plist.readFileSync(versionPlistFile);

		if (version.lt(versionPlist.CFBundleShortVersionString, 6)) {
			throw new Error(`Found Xcode ${versionPlist.CFBundleShortVersionString}, but it is too old and unsupported`);
		}

		this.path         = dir;
		this.xcodeapp     = path.resolve(this.path, '../..');
		this.version      = versionPlist.CFBundleShortVersionString;
		this.build        = versionPlist.ProductBuildVersion;
		this.id           = `${this.version}:${this.build}`;
		this.executables = {
			simulator: null,
			watchsimulator: null,
			xcodebuild
		};
		this.eulaAccepted = spawnSync(xcodebuild, [ '-checkFirstLaunchStatus' ]).status === 0;
		this.sdks = {
			ios:     this.findSDKs('iPhoneOS'),
			watchos: this.findSDKs('WatchOS')
		};
		this.simDeviceTypes = {};
		this.simRuntimes = {};

		// loop over the names and scan the derived path for simulator device types and runtimes
		// note: Xcode 9 moved CoreSimulator into the "xxxxOS" directory instead of the "xxxxSimulator" directory
		this.findDeviceTypesAndRuntimes(globalSimProfilesPath);
		for (const name of [ 'iPhoneSimulator', 'iPhoneOS', 'WatchSimulator', 'WatchOS' ]) {
			this.findDeviceTypesAndRuntimes(path.join(this.path, `Platforms/${name}.platform/Developer/Library/CoreSimulator/Profiles`));
		}

		for (const name of [ 'Simulator', 'iOS Simulator' ]) {
			const app = path.join(this.path, `Applications/${name}.app/Contents/MacOS/${name}`);
			if (isFile(app)) {
				this.executables.simulator = app;
				break;
			}
		}

		if (version.gte(this.version, 9)) {
			// there's no more watch simulator
			this.executables.watchsimulator = this.executables.simulator;
		} else {
			const app = path.join(dir, 'Applications/Simulator (Watch).app/Contents/MacOS/Simulator (Watch)');
			if (isFile(app)) {
				this.executables.watchsimulator = app;
			}
		}
	}

	/**
	 * Detects all SDK versions in the current Xcode path and the specified SDK type name.
	 *
	 * @param {String} sdkTypeName - The name of the SDK to scan.
	 * @returns {Array.<String>}
	 * @access private
	 */
	findSDKs(sdkTypeName) {
		const results = [];
		const dir = path.join(this.path, `Platforms/${sdkTypeName}.platform/Developer/SDKs`);

		if (!isDir(dir)) {
			return results;
		}

		const nameRegExp = new RegExp(`^${sdkTypeName}(.*).sdk$`);

		for (const name of fs.readdirSync(dir)) {
			const m = name.match(nameRegExp);
			const subdir = m && path.join(dir, name);
			if (!m || !isDir(subdir)) {
				continue;
			}
			let ver = m[1] || null;
			try {
				const plistFile = path.join(subdir, 'System/Library/CoreServices/SystemVersion.plist');
				const info = plist.readFileSync(plistFile);
				if (info.ProductVersion) {
					ver = info.ProductVersion;
				}
			} catch (e) {
				// squelch
			}
			results.push(ver);
		}

		return results.sort(version.rcompare);
	}

	/**
	 * Finds all simulator device types and runtimes in the given Xcode dir.
	 *
	 * @param {String} dir - The directory to scan for device types and runtimes.
	 * @access private
	 */
	findDeviceTypesAndRuntimes(dir) {
		if (!isDir(dir)) {
			return;
		}

		// device types
		const deviceTypesDir = path.join(dir, 'DeviceTypes');
		if (isDir(deviceTypesDir)) {
			for (const name of fs.readdirSync(deviceTypesDir)) {
				try {
					let info = plist.readFileSync(path.join(deviceTypesDir, name, 'Contents/Info.plist'));
					const deviceType = {
						name: info.CFBundleName,
						model: 'unknown',
						supportsWatch: false
					};
					const id = info.CFBundleIdentifier;

					try {
						info = plist.readFileSync(path.join(deviceTypesDir, name, 'Contents/Resources/profile.plist'));
						if (info.modelIdentifier) {
							deviceType.model = info.modelIdentifier;
						}
					} catch (e) {
						// squelch
					}

					try {
						info = plist.readFileSync(path.join(deviceTypesDir, name, 'Contents/Resources/capabilities.plist'));
						deviceType.supportsWatch = !!info.capabilities['watch-companion'];
					} catch (e) {
						// squelch
					}

					this.simDeviceTypes[id] = deviceType;
				} catch (e) {
					// squelch
				}
			}
		}

		// runtimes
		const runtimesDir = path.join(dir, 'Runtimes');
		if (isDir(runtimesDir)) {
			for (const name of fs.readdirSync(runtimesDir)) {
				try {
					let info = plist.readFileSync(path.join(runtimesDir, name, 'Contents/Info.plist'));
					const runtime = {
						name: info.CFBundleName,
						version: null
					};
					const id = info.CFBundleIdentifier;

					try {
						info = plist.readFileSync(path.join(runtimesDir, name, 'Contents/Resources/profile.plist'));
						runtime.version = info.defaultVersionString;
					} catch (e) {
						// squelch
					}

					this.simRuntimes[id] = runtime;
				} catch (e) {
					// squelch
				}
			}
		}
	}
}
