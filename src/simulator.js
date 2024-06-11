import fs from 'fs';
import options from './options';
import path from 'path';
import plist from 'simple-plist';
import version from './version';
import Xcode from './xcode';

import { arrayify, cache, get } from 'appcd-util';
import { expandPath } from 'appcd-path';
import { isDir } from 'appcd-fs';

/**
 * A lookup table of Xcode supported iOS Simulators and watchOS Simulator device pairs.
 *
 * This table MUST be maintained!
 *
 * The actual device pairing is done by the CoreSimulator private framework and thus there's no way
 * to know definitively what the valid device pairs are.
 *
 * @type {Object}
 */
export const devicePairCompatibility = {
	'>=6.2 <7.0': {             // Xcode 6.2, 6.3, 6.4
		'>=8.2 <9.0': {         // iOS 8.2, 8.3, 8.4
			'1.x': true         // watchOS 1.0
		}
	},
	'7.x': {                    // Xcode 7.x
		'>=8.2 <9.0': {         // iOS 8.2, 8.3, 8.4
			'1.x': true         // watchOS 1.0
		},
		'>=9.0 <=9.2': {        // iOS 9.0, 9.1, 9.2
			'>=2.0 <=2.1': true // watchOS 2.0, 2.1
		},
		'>=9.3 <10': {          // iOS 9.3
			'2.2': true         // watchOS 2.2
		}
	},
	'8.x': {                    // Xcode 8.x
		'>=9.0 <=9.2': {        // iOS 9.0, 9.1, 9.2
			'>=2.0 <=2.1': true // watchOS 2.0, 2.1
		},
		'>=9.3 <10': {          // iOS 9.x
			'2.2': true,        // watchOS 2.2
			'3.x': true         // watchOS 3.x
		},
		'10.x': {               // iOS 10.x
			'2.2': true,        // watchOS 2.2
			'3.x': true         // watchOS 3.x
		}
	},
	'9.x': {                    // Xcode 9.x
		'>=9.0 <=9.2': {        // iOS 9.0, 9.1, 9.2
			'>=2.0 <=2.1': true // watchOS 2.0, 2.1
		},
		'>=9.3 <10': {          // iOS 9.x
			'2.2': true,        // watchOS 2.2
			'3.x': true         // watchOS 3.x
		},
		'10.x': {               // iOS 10.x
			'2.2': true,        // watchOS 2.2
			'3.x': true         // watchOS 3.x
		},
		'11.x': {               // iOS 11.x
			'>=3.2 <4.0': true, // watchOS 3.2
			'4.x': true         // watchOS 4.x
		}
	},
	'10.x <10.3': {             // Xcode 10.0-10.2.1
		'8.x': {},              // iOS 8.x
		'>=9.0 <=9.2': {        // iOS 9.0, 9.1, 9.2
			'>=2.0 <=2.1': true // watchOS 2.0, 2.1
		},
		'>=9.3 <10': {          // iOS 9.x
			'2.2': true,        // watchOS 2.2
			'3.x': true         // watchOS 3.x
		},
		'>=10.0 <=10.2': {      // iOS 10.0, 10.1, 10.2
			'2.2': true,        // watchOS 2.2
			'3.x': true         // watchOS 3.x
		},
		'>=10.3 <11': {         // iOS 10.3
			'3.x': true         // watchOS 3.x
		},
		'11.x': {               // iOS 11.x
			'>=3.2 <4.0': true, // watchOS 3.2
			'4.x': true         // watchOS 4.x
		},
		'12.x': {               // iOS 12.x
			'>=3.2 <4.0': true, // watchOS 3.2
			'4.x': true,        // watchOS 4.x
			'5.x': true         // watchOS 5.x
		}
	},
	'>=10.3 <11': {             // Xcode 10.3
		'>=10.3 <11': {         // iOS 10.3
			'3.x': true         // watchOS 3.x
		},
		'11.x': {		        // iOS 11.x
			'>=3.2 <4.0': true, // watchOS 3.2
			'4.x': true         // watchOS 4.x
		},
		'12.x': {		        // iOS 12.x
			'4.x': true,        // watchOS 4.x
			'5.x': true         // watchOS 5.x
		}
	},
	'11.x': {                   // Xcode 11.x
		'>=10.3 <11': {         // iOS 10.3
			'2.2': true,        // watchOS 2.2
			'3.x': true         // watchOS 3.x
		},
		'11.x': {               // iOS 11.x
			'>=3.2 <4.0': true, // watchOS 3.2
			'4.x': true         // watchOS 4.x
		},
		'12.x': {               // iOS 12.x
			'4.x': true,        // watchOS 4.x
			'5.x': true,        // watchOS 5.x
			'6.x': true         // watchOS 6.x
		},
		'13.x': {               // iOS 13.x
			'4.x': true,        // watchOS 4.x
			'5.x': true,        // watchOS 5.x
			'6.x': true         // watchOS 6.x
		}
	},
	'12.x': {                   // Xcode 12.x
		'>=10.3 <11': {         // iOS 10.x
			'2.2': true,        // watchOS 2.2
			'3.x': true         // watchOS 3.x
		},
		'11.x': {		        // iOS 11.x
			'>=3.2 <4.0': true, // watchOS 3.2
			'4.x': true         // watchOS 4.x
		},
		'12.x': {               // iOS 12.x
			'4.x': true,        // watchOS 4.x
			'5.x': true,        // watchOS 5.x
			'6.x': true,        // watchOS 6.x
			'7.x': true         // watchOS 7.x
		},
		'13.x': {               // iOS 13.x
			'4.x': true,        // watchOS 4.x
			'5.x': true,        // watchOS 5.x
			'6.x': true,        // watchOS 6.x
			'7.x': true         // watchOS 7.x
		},
		'14.x': {               // iOS 14.x
			'4.x': true,        // watchOS 4.x
			'5.x': true,        // watchOS 5.x
			'6.x': true,        // watchOS 6.x
			'7.x': true         // watchOS 7.x
		}
	},
	'13.x': {                   // Xcode 13.x
		'>=10.3 <11': {         // iOS 10.x
			'2.2': true,        // watchOS 2.2
			'3.x': true         // watchOS 3.x
		},
		'11.x': {               // iOS 11.x
			'>=3.2 <4.0': true, // watchOS 3.2
			'4.x': true         // watchOS 4.x
		},
		'12.x': {               // iOS 12.x
			'4.x': true,        // watchOS 4.x
			'5.x': true,        // watchOS 5.x
			'6.x': true,        // watchOS 6.x
			'7.x': true,        // watchOS 7.x
			'8.x': true         // watchOS 8.x
		},
		'13.x': {               // iOS 13.x
			'4.x': true,        // watchOS 4.x
			'5.x': true,        // watchOS 5.x
			'6.x': true,        // watchOS 6.x
			'7.x': true,        // watchOS 7.x
			'8.x': true         // watchOS 8.x
		},
		'14.x': {               // iOS 14.x
			'4.x': true,        // watchOS 4.x
			'5.x': true,        // watchOS 5.x
			'6.x': true,        // watchOS 6.x
			'7.x': true,        // watchOS 7.x
			'8.x': true         // watchOS 8.x
		},
		'15.x': {
			'4.x': true,        // watchOS 4.x
			'5.x': true,        // watchOS 5.x
			'6.x': true,        // watchOS 6.x
			'7.x': true,        // watchOS 7.x
			'8.x': true         // watchOS 8.x
		}
	},
	'14.x': {                   // Xcode 14.x
		'12.x': {               // iOS 12.x
			'7.x': true,        // watchOS 7.x
			'8.x': true,        // watchOS 8.x
			'9.x': true         // watchOS 9.x
		},
		'13.x': {               // iOS 13.x
			'7.x': true,        // watchOS 7.x
			'8.x': true,        // watchOS 8.x
			'9.x': true         // watchOS 9.x
		},
		'14.x': {               // iOS 14.x
			'7.x': true,        // watchOS 7.x
			'8.x': true,        // watchOS 8.x
			'9.x': true         // watchOS 9.x
		},
		'15.x': {
			'7.x': true,        // watchOS 7.x
			'8.x': true,        // watchOS 8.x
			'9.x': true         // watchOS 9.x
		},
		'16.x': {
			'7.x': true,        // watchOS 7.x
			'8.x': true,        // watchOS 8.x
			'9.x': true         // watchOS 9.x
		}
	},
	'15.x': {                   // Xcode 15.x
		'15.x': {
			'7.x': true,        // watchOS 7.x
			'8.x': true,        // watchOS 8.x
			'9.x': true,		// watchOS 9.x
			'10.x': true		// watchOS 10.x
		},
		'16.x': {
			'7.x': true,        // watchOS 7.x
			'8.x': true,        // watchOS 8.x
			'9.x': true,		// watchOS 9.x
			'10.x': true		// watchOS 10.x
		},
		'17.x': {
			'7.x': true,        // watchOS 7.x
			'8.x': true,        // watchOS 8.x
			'9.x': true,		// watchOS 9.x
			'10.x': true		// watchOS 10.x
		}
	},
	'16.x': {                   // Xcode 16.x
		'15.x': {				// iOS 15.x
			'8.x': true,        // watchOS 8.x
			'9.x': true,		// watchOS 9.x
			'10.x': true,		// watchOS 10.x
			'11.x': true,		// watchOS 11.x
		},
		'16.x': {				// iOS 16.x
			'8.x': true,        // watchOS 8.x
			'9.x': true,		// watchOS 9.x
			'10.x': true,		// watchOS 10.x
			'11.x': true,		// watchOS 11.x
		},
		'17.x': {				// iOS 18.x
			'8.x': true,        // watchOS 8.x
			'9.x': true,		// watchOS 9.x
			'10.x': true,		// watchOS 10.x
			'11.x': true,		// watchOS 11.x
		},
		'18.x': {				// iOS 18.x
			'8.x': true,        // watchOS 8.x
			'9.x': true,		// watchOS 9.x
			'10.x': true,		// watchOS 10.x
			'11.x': true,		// watchOS 11.x
		}
	}
};

/**
 * The path to the directory containing the simulator devices.
 * @type {String}
 */
const defaultDevicesDir = '~/Library/Developer/CoreSimulator/Devices';

/**
 * The path to the `device_set.plist` that contains all the simulators. `ioslib` does not parse this
 * file because the CoreSimulator service has a track record of not reporting (via `simctl`) the
 * same info that are in this file.
 * @type {String}
 */
const defaultDeviceSetFile = '~/Library/Developer/CoreSimulator/Devices/device_set.plist';

/**
 * Returns the path to the directory containing all of the simulators.
 *
 * @returns {String}
 */
export function getDevicesDir() {
	return expandPath(get(options, 'simulator.devicesDir') || defaultDevicesDir);
}

/**
 * Returns the path to the plist containing the list of simulators and their pairings.
 *
 * @returns {String}
 */
export function getDeviceSetFile() {
	return expandPath(get(options, 'simulator.deviceSetFile') || defaultDeviceSetFile);
}

/**
 * The simulator base class.
 */
export class Simulator {
	constructor(params) {
		Object.assign(this, params);
	}
}

/**
 * Describes an iOS Simulator.
 */
export class iOSSimulator extends Simulator {
	type = 'ios';
}

/**
 * Describes an watchOS Simulator.
 */
export class watchOSSimulator extends Simulator {
	type = 'watchos';
}

/**
 * A map of simulator types to the corresponding simulator class.
 * @type {Object}
 */
const typeMap = {
	ios:     iOSSimulator,
	watchos: watchOSSimulator
};

/**
 * A cached regex that parses the simulator type from the runtime.
 * For example, an iOS 10.3 simulator uses a `com.apple.CoreSimulator.SimRuntime.iOS-10-3` runtime.
 * @type {RegExp}
 */
const typeRegExp = /\.(\w+)(?:-\d+)*$/;

/**
 * Detects iOS and watchOS simulators.
 *
 * @param {Object} [opts] - Various options.
 * @param {Boolean} [opts.force=false] - When `true`, bypasses cache and forces redetection.
 * @returns {Promise<Array<Simulator>>}
 */
export function getSimulators({ force } = {}) {
	return cache('ioslib:simulators', force, () => {
		const simDevicesPath = getDevicesDir();
		const results = [];

		if (isDir(simDevicesPath)) {
			for (const dirname of fs.readdirSync(simDevicesPath)) {
				try {
					const deviceDir   = path.join(simDevicesPath, dirname);
					const deviceInfo  = plist.readFileSync(path.join(deviceDir, 'device.plist'));
					const info = {
						deviceDir,
						deviceType: deviceInfo.deviceType,
						name:       deviceInfo.name,
						runtime:    deviceInfo.runtime,
						udid:       deviceInfo.UDID
					};

					if (dirname !== info.udid) {
						// sanity check
						continue;
					}

					const m = info.runtime.match(typeRegExp);
					if (!m) {
						// can't figure out if it's a iOS or watchOS simulator
						continue;
					}

					switch (m[1].toLowerCase()) {
						case 'ios':
							results.push(new iOSSimulator(info));
							break;
						case 'watchos':
							results.push(new watchOSSimulator(info));
							break;
					}
				} catch (e) {
					// squelch
				}
			}
		}

		return results;
	});
}

/**
 * Generates an object with iOS and watchOS Simulators sorted and with all details populated.
 *
 * @param {Object} params - Various required parameters.
 * @param {Simulator|Array<Simulator>} params.simulators - An array of Simulator objects.
 * @param {Xcode|Array<Xcode>|Object} params.xcodes - An array of Xcode objects.
 * @returns {Promise<Object>}
 */
export function generateSimulatorRegistry({ simulators, xcodes }) {
	simulators = arrayify(simulators).filter(sim => sim instanceof iOSSimulator || sim instanceof watchOSSimulator);

	// coerce `xcodes` into something we can work with
	if (xcodes instanceof Xcode) {
		xcodes = {
			[xcodes.id]: xcodes
		};
	} else if (Array.isArray(xcodes)) {
		const tmp = {};
		for (const xcode of xcodes) {
			if (xcode instanceof Xcode) {
				tmp[xcode.id] = xcode;
			}
		}
		xcodes = tmp;
	} else if (!xcodes || typeof xcodes !== 'object') {
		xcodes = {};
	}

	const unsorted = {
		ios: {},
		watchos: {}
	};

	// loop over each simulator, then loop over each xcode and try to find the sim runtime and
	// populate the simulator details
	for (let orig of simulators) {
		const type = orig instanceof iOSSimulator ? 'ios' : 'watchos';

		// copy the simulator
		let sim;

		for (const xcode of Object.values(xcodes)) {
			const runtime = xcode.simRuntimes[orig.runtime];
			const deviceType = xcode.simDeviceTypes[orig.deviceType];

			if (!runtime || !deviceType) {
				continue;
			}

			if (!sim) {
				sim               = new typeMap[type](orig);
				sim.deviceName    = deviceType.name;
				sim.family        = deviceType.model.replace(/[\W0-9]/g, '').toLowerCase();
				sim.model         = deviceType.model;
				sim.runtimeName   = runtime.name;
				type === 'ios' && (sim.supportsWatch = {});
				sim.supportsXcode = {};
				sim.version       = runtime.version;
				type === 'ios' && (sim.watchCompanion = {});
				sim.simctl        = xcode.executables.simctl;
				sim.simulator     = type === 'ios' ? xcode.executables.simulator : xcode.executables.watchsimulator;

				if (!unsorted[type][sim.version]) {
					unsorted[type][sim.version] = [];
				}
				unsorted[type][sim.version].push(sim);
			}

			sim.supportsXcode[xcode.id] = true;
			if (type === 'ios') {
				sim.supportsWatch[xcode.id] = deviceType.supportsWatch;
			}
		}
	}

	// for iOS Simulators only, build the lookup of compatible watch companions
	for (const sims of Object.values(unsorted.ios)) { // array sim handles
		for (const sim of sims) { // sim handle
			for (const xcodeId of Object.keys(sim.supportsWatch).filter(xcodeId => sim.supportsWatch[xcodeId])) { // 11.0:11A419c
				const xcode = xcodes[xcodeId];
				for (const iosRange of Object.keys(xcode.simDevicePairs)) { // 13.x
					if (version.satisfies(sim.version, iosRange)) {
						for (const watchosRange of Object.keys(xcode.simDevicePairs[iosRange])) { // 6.x
							if (xcode.simDevicePairs[iosRange][watchosRange]) {
								for (const watchVersion of Object.keys(unsorted.watchos)) { // 6.x
									for (const watchSim of unsorted.watchos[watchVersion]) { // watch sim handle
										if (version.satisfies(watchSim.version, watchosRange)) {
											if (!sim.watchCompanion[xcodeId]) {
												sim.watchCompanion[xcodeId] = [ watchSim.udid ];
											} else if (!sim.watchCompanion[xcodeId].includes(watchSim.udid)) {
												sim.watchCompanion[xcodeId].push(watchSim.udid);
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}

	// sort the simulators
	const compareSims = (a, b) => {
		return a.model < b.model ? -1 : a.model > b.model ? 1 : 0;
	};
	const sorted = {
		ios: {},
		watchos: {}
	};
	for (const type of Object.keys(unsorted)) {
		for (const ver of Object.keys(unsorted[type]).sort(version.compare)) {
			sorted[type][ver] = unsorted[type][ver].sort(compareSims);
		}
	}

	return sorted;
}
