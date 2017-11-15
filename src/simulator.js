import options from './options';
import path from 'path';
import plist from 'simple-plist';
import Simctl from './simctl';
import version from './version';

import { expandPath } from 'appcd-path';
import { getDefaultXcodePath, getXcodes } from './xcode';

/**
 * The path to the directory containing the simulator instances.
 * @type {String}
 */
const defaultCoreSimulatorDevicesDir = '~/Library/Developer/CoreSimulator/Devices';

/**
 * Returns the path to the provisioning profiles directory.
 *
 * @returns {String}
 */
export function getCoreSimulatorDevicesDir() {
	return options.coreSimulatorDevicesDir || defaultCoreSimulatorDevicesDir;
}

/**
 * The path to the directory containing the simulator crash logs.
 * @type {String}
 */
export const crashPath = '~/Library/Logs/DiagnosticReports';

/**
 * A class to encapsulate iOS or watchOS simulator information.
 */
export class Simulator {
	udid = null;
	name = null;
	version = null;
	type = null;
	deviceType = null;
	deviceName = null;
	deviceDir = null;
	model = null;
	family = null;
	supportsXcode = null;
	supportsWatch = {};
	watchCompanion = {};
	runtime = null;
	runtimeName = null;
	systemLog = null;
	dataDir = null;

	constructor(params) {
		Object.assign(this, params);
	}
}

/**
 * Detects iOS and watchOS simulators.
 *
 * @param {Object} [xcodeInfo] - An object containing Xcode ids to Xcode info objects. If not
 * specified, it will fetch them itself.
 * @returns {Promise<Object>}
 */
export async function getSimulators(xcodeInfo) {
	if (!xcodeInfo) {
		xcodeInfo = await getXcodes();
	}

	const results = {
		ios: {},
		watchos: {}
	};

	let selectedXcode;
	let latestXcode;
	const defaultPath = await getDefaultXcodePath();

	// detect if we should inject fake watchOS simulators
	const xcodesThatSupportsWatchOS1 = {};

	for (const xcode of Object.values(xcodeInfo)) {
		if (!selectedXcode && xcode.xcodeapp === defaultPath) {
			selectedXcode = xcode;
		}

		if (!latestXcode || version.gt(xcode.version, latestXcode.version)) {
			latestXcode = xcode;
		}

		if (version.gte(xcode.version, '6.2') && version.lt(xcode.version, '7.0')) {
			xcodesThatSupportsWatchOS1[xcode.id] = 1;
		}
	}

	// if we didn't find an Xcode matching the default path, then pick the latest Xcode
	if (!selectedXcode) {
		selectedXcode = latestXcode;
	}

	// if we don't have any valid Xcodes, then we cannot proceed
	if (!selectedXcode || !selectedXcode.eulaAccepted) {
		return results;
	}

	if (Object.keys(xcodesThatSupportsWatchOS1).length) {
		results.watchos['1.0'] = [
			createWatchOS1Sim('Apple Watch - 38mm', '58045222-F0C1-41F7-A4BD-E2EDCFBCF5B9', 'Watch0,1', xcodesThatSupportsWatchOS1),
			createWatchOS1Sim('Apple Watch - 42mm', 'D5C1DA2F-7A74-49C8-809A-906E554021B0', 'Watch0,2', xcodesThatSupportsWatchOS1)
		];
	}

	const simctl = new Simctl(selectedXcode.executables.simctl);
	const simctlInfo = await simctl.list();

	// create a lookup of runtimes from simctl
	const simctlRuntimes = {};
	for (const runtime of simctlInfo.runtimes) {
		simctlRuntimes[runtime.identifier] = runtime;
	}

	const simPath = expandPath(getCoreSimulatorDevicesDir());

	for (const devices of Object.values(simctlInfo.devices)) {
		for (const { udid } of devices) {
			let deviceInfo;
			try {
				deviceInfo = plist.readFileSync(path.join(simPath, udid, 'device.plist'));
			} catch (e) {
				continue;
			}

			for (const [ xcodeId, xcode ] of Object.entries(xcodeInfo)) {
				const { simDeviceTypes, simRuntimes } = xcode;
				const deviceType = simDeviceTypes[deviceInfo.deviceType];
				let runtime = simctlRuntimes[deviceInfo.runtime];

				// This code finds the sim runtime and builds the list of associated
				// iOS SDKs which may be different based which Xcode's simctl is run.
				// For example, sim runtime 10.3 is associated with iOS 10.3 and 10.3.1.
				// Because of this, we define the same simulator for each associated
				// iOS SDK version.
				if (runtime) {
					runtime.versions = [ runtime.version ];
					if (simRuntimes[deviceInfo.runtime]) {
						const ver = simRuntimes[deviceInfo.runtime].version;
						if (ver !== runtime.version) {
							runtime.versions.push(ver);
						}
					}
				} else {
					runtime = simRuntimes[deviceInfo.runtime];
					if (runtime) {
						runtime.versions = [ runtime.version ];
					}
				}

				if (!deviceType || !runtime) {
					// wrong xcode, skip
					continue;
				}

				const family = deviceType.model.replace(/[\W0-9]/g, '').toLowerCase();
				const type = family === 'iphone' || family === 'ipad' ? 'ios' : 'watchos';

				for (const ver of runtime.versions) {
					let sim;
					let list = results[type][ver];

					if (list) {
						for (const simulator of list) {
							if (simulator.udid === deviceInfo.UDID) {
								sim = simulator;
								break;
							}
						}
					} else {
						list = results[type][ver] = [];
					}

					if (!sim) {
						const deviceDir = path.join(simPath, udid);

						sim = new Simulator({
							udid:           deviceInfo.UDID,
							name:           deviceInfo.name,
							version:        ver,
							type:           type,

							deviceType:     deviceInfo.deviceType,
							deviceName:     deviceType.name,
							model:          deviceType.model,
							family:         family,
							supportsXcode:  {},
							supportsWatch:  {},
							watchCompanion: {},

							runtime:        deviceInfo.runtime,
							runtimeName:    runtime.name,

							deviceDir,
							systemLog:      'system.log',
							dataDir:        'data'
						});

						list.push(sim);
					}

					sim.supportsXcode[xcodeId] = true;
					if (type === 'ios') {
						sim.supportsWatch[xcodeId] = deviceType.supportsWatch;
					}
				}
			}
		}
	}

	// this is pretty nasty, but necessary...
	// basically this will populate the watchCompanion property for each iOS Simulator
	// so that it makes choosing simulator pairs way easier
	for (const sims of Object.values(results.ios)) {
		for (const sim of sims) {
			for (const xcodeId of Object.keys(sim.supportsWatch)) {
				if (!sim.supportsWatch[xcodeId]) {
					continue;
				}

				const xcode = xcodeInfo[xcodeId];
				for (const iosRange of Object.keys(xcode.simDevicePairs)) {
					if (version.satisfies(sim.version, iosRange)) {
						for (const watchosRange of Object.keys(xcode.simDevicePairs[iosRange])) {
							for (const watchosSDK of Object.keys(results.watchos)) {
								for (const watchSim of results.watchos[watchosSDK]) {
									if (version.satisfies(watchSim.version, watchosRange)) {
										if (!sim.watchCompanion[xcodeId]) {
											sim.watchCompanion[xcodeId] = {};
										}
										sim.watchCompanion[xcodeId][watchSim.udid] = watchSim;
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
	for (const ver of Object.keys(results.ios)) {
		results.ios[ver].sort(compareSims);
	}
	for (const ver of Object.keys(results.watchos)) {
		results.watchos[ver].sort(compareSims);
	}

	return results;
}

/**
 * Compares two simulators so that a list of simulators can be sorted properly.
 *
 * @param {Simulator} sim1 - The first simulator to compare.
 * @param {Simulator} sim2 - The second simulator to compare.
 * @returns {Number}
 */
function compareSims(sim1, sim2) {
	return sim1.model < sim2.model ? -1 : sim1.model > sim2.model ? 1 : 0;
}

/**
 * Creates a new Simulator object that describes a watchOS 1 simulator since there is no such thing
 * as a watchOS 1 simulator. Xcode actually uses an "external display" to display the watch app.
 *
 * @param {String} name - The simulator name.
 * @param {String} udid - The simulator udid.
 * @param {String} model - The simulator model.
 * @param {Object} xcodes - A lookup map of supported Xcode ids.
 * @returns {Simulator}
 */
function createWatchOS1Sim(name, udid, model, xcodes) {
	return new Simulator({
		udid:           udid,
		name:           name,
		version:        '1.0',
		type:           'watchos',
		deviceName:     name,
		model:          model,
		family:         'watch',
		supportsXcode:  xcodes,
		runtimeName:    'watchOS 1.0'
	});
}
