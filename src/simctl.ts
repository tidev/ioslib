import { ErrorWithCode } from './util/error.ts';
import { snooplogg } from 'snooplogg';

const log = snooplogg('ioslib')('simctl').debug;

type TrySimctlParams = {
	simctl: string;
	tries?: number;
	args: string[];
};

/**
 * Activates an existing device pair.
 *
 * @param params - Various parameters.
 * @param params.simctl - The path to the `simctl` executable.
 * @param params.udid - The pair udid to activate.
 */
export async function activatePair(params: TrySimctlParams & { udid: string }): Promise<void> {
	try {
		await trySimctl(params, ['pair_activate', params.udid]);
	} catch (err) {
		// code 37 means the pair is already active
		if (err instanceof ErrorWithCode && err.code !== 37) {
			throw new Error(`Failed to activate pair: ${err.message}`);
		}
	}
}

/**
 * Creates a new simulator.
 *
 * @param params - Various parameters.
 * @param params.deviceType - The device type to use such as
 * `com.apple.CoreSimulator.SimDeviceType.iPhone-7-Plus`.
 * @param params.name - The name of the simulator.
 * @param params.runtime - The runtime to use such as
 * `com.apple.CoreSimulator.SimRuntime.iOS-10-2`.
 * @param params.simctl - The path to the `simctl` executable.
 */
export async function create(
	params: TrySimctlParams & { name: string; deviceType: string; runtime: string }
): Promise<string | null> {
	if (!params || typeof params !== 'object') {
		throw new TypeError('Expected params to be an object');
	}
	if (!params.name || typeof params.name !== 'string') {
		throw new TypeError('Expected name to be a string');
	}
	if (!params.deviceType || typeof params.deviceType !== 'string') {
		throw new TypeError('Expected deviceType to be a string');
	}
	if (!params.runtime || typeof params.runtime !== 'string') {
		throw new TypeError('Expected runtime to be a string');
	}

	const output = await trySimctl(params, [
		'create',
		params.name,
		params.deviceType,
		params.runtime,
	]);
	return output.split('\n').shift()?.trim() ?? null;
}

/**
 * Installs an app in the specified simulator. Simulator must be running.
 *
 * @param params - Various parameters.
 * @param params.appPath - The full path to the `.app` directory.
 * @param params.simctl - The path to the `simctl` executable.
 * @param params.udid - The simulator udid to install the app on.
 */
export async function install(
	params: TrySimctlParams & { appPath: string; udid: string }
): Promise<void> {
	if (!params || typeof params !== 'object') {
		throw new TypeError('Expected params to be an object');
	}
	if (!params.appPath || typeof params.appPath !== 'string') {
		throw new TypeError('Expected appPath to be a string');
	}
	if (!params.udid || typeof params.udid !== 'string') {
		throw new TypeError('Expected udid to be a string');
	}
	await trySimctl(params, ['install', params.udid, params.appPath]);
}

/**
 * Launches an app in the specified simulator. Simulator must be running.
 *
 * @param params - Various parameters.
 * @param params.appId - The id of the app to launch.
 * @param params.simctl - The path to the `simctl` executable.
 * @param params.udid - The simulator udid to launch the app on.
 */
export async function launch(
	params: TrySimctlParams & { appId: string; udid: string }
): Promise<void> {
	if (!params || typeof params !== 'object') {
		throw new TypeError('Expected params to be an object');
	}
	if (!params.appId || typeof params.appId !== 'string') {
		throw new TypeError('Expected appId to be a string');
	}
	if (!params.udid || typeof params.udid !== 'string') {
		throw new TypeError('Expected udid to be a string');
	}
	await trySimctl(params, ['launch', '--terminate-running-process', params.udid, params.appId]);
}

/**
 * Boots an simulator runtime. Simulator must be running.
 *
 * @param params - Various parameters.
 * @param params.simctl - The path to the `simctl` executable.
 * @param params.udid - The simulator udid to launch the app on.
 */
export async function boot(params: TrySimctlParams & { udid: string }): Promise<void> {
	if (!params || typeof params !== 'object') {
		throw new TypeError('Expected params to be an object');
	}
	if (!params.udid || typeof params.udid !== 'string') {
		throw new TypeError('Expected udid to be a string');
	}
	await trySimctl(params, ['boot', params.udid]);
}

type SimRuntimeName = string;
type SimUdid = string;

type SimctlDevice = {
	dataPath: string;
	dataPathSize: number;
	logPath: string;
	udid: string;
	isAvailable: boolean;
	availability: string; // legacy
	deviceTypeIdentifier: string;
	state: string;
	name: string;
};

type SimctlPairDevice = {
	name: string;
	state: string;
	udid: string;
};

type SimctlPair = {
	phone: SimctlPairDevice;
	watch: SimctlPairDevice;
	state: string;
};

type SimctlDeviceType = {
	productFamily: string;
	bundlePath: string;
	maxRuntimeVersion: number;
	maxRuntimeVersionString: string;
	identifier: string;
	modelIdentifier: string;
	minRuntimeVersionString: string;
	minRuntimeVersion: number;
	name: string;
};

type SimctlSupportedDeviceType = {
	bundlePath: string;
	name: string;
	productFamily: string;
	identifier: string;
};

type SimctlRuntime = {
	isAvailable: boolean;
	version: string;
	isInternal: boolean;
	buildversion: string;
	supportedArchitectures: string[];
	supportedDeviceTypes: SimctlSupportedDeviceType[];
	identifier: string;
	platform: string;
	bundlePath: string;
	runtimeRoot: string;
	lastUsage: Record<string, string>;
	name: string;
};

type SimctlListJson = {
	devices: Record<SimRuntimeName, SimctlDevice[]>;
	deviceTypes: SimctlDeviceType[];
	iosSimToWatchSimToPair: Record<string, Record<string, { udid: string; active: boolean }>>;
	pairs: Record<SimUdid, SimctlPair>;
	runtimes: SimctlRuntime[];
};

/**
 * Returns a list of all devices, runtimes, device types, and pairs.
 *
 * @param params - Various parameters.
 * @param params.simctl - The path to the `simctl` executable.
 * @param [params.tries] - The max number of `simctl` tries.
 */
export async function list(params: TrySimctlParams): Promise<SimctlListJson> {
	let json: SimctlListJson | null = null;
	try {
		const output = await trySimctl(params, ['list', '--json']);
		json = JSON.parse(output.substring(output.indexOf('{'))) as SimctlListJson;
		if (!json) {
			throw new Error('simctl returned invalid JSON');
		}
	} catch (err) {
		throw new Error(
			`Failed to parse simctl list JSON: ${err instanceof Error ? err.message : String(err)}`
		);
	}

	// convert the pairs from <pair udid> -> (ios sim + watch sim) to <ios sim> -> <watch sims> -> <pair udid>
	json.iosSimToWatchSimToPair = {};
	for (const [pairUdid, pair] of Object.entries(json.pairs)) {
		const m = pair.state.match(/^\(((?:in)?active),/);
		if (m) {
			if (!json.iosSimToWatchSimToPair[pair.phone.udid]) {
				json.iosSimToWatchSimToPair[pair.phone.udid] = {};
			}
			json.iosSimToWatchSimToPair[pair.phone.udid][pair.watch.udid] = {
				udid: pairUdid,
				active: m[1] === 'active',
			};
		}
	}
	return json;
}

/**
 * Returns a list of all devices.
 *
 * @param params - Various parameters.
 * @param params.simctl - The path to the `simctl` executable.
 * @param [params.tries] - The max number of `simctl` tries.
 */
export async function listDevices(
	params: TrySimctlParams
): Promise<Record<SimRuntimeName, SimctlDevice[]>> {
	try {
		const output = await trySimctl(params, ['list', 'devices', '--json']);
		const json = JSON.parse(output.substring(output.indexOf('{'))) as SimctlListJson;
		if (!json) {
			throw new Error('simctl returned invalid JSON');
		}
		return json.devices;
	} catch (err) {
		throw new Error(
			`Failed to parse simctl list JSON: ${err instanceof Error ? err.message : String(err)}`
		);
	}
}

/**
 * Pairs a iOS Simulator with a watchOS Simulator.
 *
 * @param params - Various parameters.
 * @param params.simctl - The path to the `simctl` executable.
 * @param params.simUdid - The udid of the iOS Simulator.
 * @param [params.tries] - The max number of `simctl` tries.
 * @param params.watchSimUdid - The udid of the watchOS Simulator.
 */
export async function pair(
	params: TrySimctlParams & { simUdid: string; watchSimUdid: string }
): Promise<string> {
	if (!params || typeof params !== 'object') {
		throw new TypeError('Expected params to be an object');
	}
	if (!params.simUdid || typeof params.simUdid !== 'string') {
		throw new TypeError('Expected simUdid to be a string');
	}
	if (!params.watchSimUdid || typeof params.watchSimUdid !== 'string') {
		throw new TypeError('Expected watchSimUdid to be a string');
	}

	return 'some udid';

	// await trySimctl(params, ['pair', params.watchSimUdid, params.simUdid], function (err, output) {
	// 	if (err) {
	// 		var alreadyPaired =
	// 			err.message.indexOf('The selected devices are already paired with each other') !== -1;
	// 		if (err.code !== 161 || !alreadyPaired) {
	// 			return callback(err);
	// 		}
	// 	} else {
	// 		return callback(null, output.split('\n').shift().trim());
	// 	}

	// 	// already paired, get the udid
	// 	log('Already paired, getting pair id');
	// 	list(params, function (err, info) {
	// 		if (err) {
	// 			return callback(err);
	// 		}

	// 		if (!info.iosSimToWatchSimToPair[params.simUdid]) {
	// 			return callback(
	// 				new Error(
	// 					`iOS Simulator ${params.simUdid} doesn't have any paired watchOS Simulators!`
	// 				)
	// 			);
	// 		}

	// 		var watchSim = info.iosSimToWatchSimToPair[params.simUdid][params.watchSimUdid];
	// 		if (!watchSim) {
	// 			return callback(
	// 				new Error(
	// 					`Failed to find device pair for iOS Simulator ${params.simUdid} and watchOS Simulator ${params.watchSimUdid}.`
	// 				)
	// 			);
	// 		}

	// 		var udid = watchSim.udid;
	// 		log('Found pair id: ' + udid);
	// 		callback(null, udid);
	// 	});
	// });
}

/**
 * Pairs a iOS Simulator with a watchOS Simulator, then activates it.
 *
 * @param params - Various parameters.
 * @param params.simctl - The path to the `simctl` executable.
 * @param params.simUdid - The udid of the iOS Simulator.
 * @param [params.tries] - The max number of `simctl` tries.
 * @param params.watchSimUdid - The udid of the watchOS Simulator.
 */
export async function pairAndActivate(
	params: TrySimctlParams & { simUdid: string; watchSimUdid: string }
): Promise<void> {
	await activatePair({
		...params,
		udid: await pair(params),
	});
}

/**
 * Shuts down the simulator.
 *
 * @param params - Various parameters.
 * @param params.simctl - The path to the `simctl` executable.
 * @param params.udid - The udid of the simulator to shutdown.
 */
export async function shutdown(params: TrySimctlParams & { udid: string }): Promise<void> {
	if (!params || typeof params !== 'object') {
		throw new TypeError('Expected params to be an object');
	}
	if (!params.udid || typeof params.udid !== 'string') {
		throw new TypeError('Expected udid to be a string');
	}

	const sim = await getSim(params);
	if (!sim) {
		throw new Error(`Unable to find Simulator ${params.udid}`);
	}

	if (sim.isAvailable === false && sim.availability !== '(available)') {
		throw new Error('Simulator is not available');
	}

	log(`Sim state: ${sim.state}`);
	if (/^shutdown|creating$/i.test(sim.state)) {
		return;
	}

	await trySimctl(params, ['shutdown', params.udid]);
}

/**
 * Uninstalls an app from the specified simulator. Simulator must be running.
 *
 * @param params - Various parameters.
 * @param params.simctl - The path to the `simctl` executable.
 * @param params.udid - The udid of the simulator.
 * @param params.appId - The app id to uninstall.
 */
export async function uninstall(params) {
	if (!params || typeof params !== 'object') {
		throw new TypeError('Expected params to be an object');
	}
	if (!params.simctl || typeof params.simctl !== 'string') {
		throw new TypeError('Expected simctl to be a string');
	}
	if (!params.udid || typeof params.udid !== 'string') {
		throw new TypeError('Expected udid to be a string');
	}
	if (!params.appId || typeof params.appId !== 'string') {
		throw new TypeError('Expected appId to be a string');
	}

	try {
		await trySimctl(params, ['uninstall', params.udid, params.appId]);
	} catch (err) {
		if (err instanceof ErrorWithCode && err.code === 1) {
			// app wasn't installed
			return;
		}
		throw new Error('Failed to uninstall app');
	}
}

/**
 * Unpairs a iOS Simulator from a watchOS Simulator.
 *
 * @param params - Various parameters.
 * @param params.simctl - The path to the `simctl` executable.
 * @param [params.tries] - The max number of `simctl` tries.
 * @param params.udid - The pair udid.
 */
export async function unpair(params) {
	if (!params || typeof params !== 'object') {
		throw new TypeError('Expected params to be an object');
	}
	if (!params.simctl || typeof params.simctl !== 'string') {
		throw new TypeError('Expected simctl to be a string');
	}
	if (!params.udid || typeof params.udid !== 'string') {
		throw new TypeError('Expected udid to be a string');
	}

	let info = await list(params);
	const pair = info.pairs[params.udid];
	if (!pair) {
		// already unpaired... or invalid udid
		return;
	}

	await trySimctl(params, ['unpair', params.udid]);

	// check if the unpair was successful
	info = await list(params);

	if (
		info.iosSimToWatchSimToPair[pair.phone.udid] &&
		info.iosSimToWatchSimToPair[pair.phone.udid][pair.watch.udid]
	) {
		log('Unpair failed');
		throw new Error('Unable to unpair');
	}
}

/**
 * Finds the specified simulator and returns it's state and availability.
 *
 * @param params - Various parameters.
 * @param params.simctl - The path to the `simctl` executable.
 * @param [params.tries] - The max number of `simctl` tries.
 * @param params.udid - The pair udid.
 */
export async function getSim(params) {
	if (!params || typeof params !== 'object') {
		throw new TypeError('Expected params to be an object');
	}
	if (!params.simctl || typeof params.simctl !== 'string') {
		throw new TypeError('Expected simctl to be a string');
	}
	if (!params.udid || typeof params.udid !== 'string') {
		throw new TypeError('Expected udid to be a string');
	}

	const info = await list(params);

	for (const sims of Object.values(info.devices)) {
		const sim = sims.find((sim) => sim.udid === params.udid);
		if (sim) {
			return sim;
		}
	}
}

/**
 * Waits for the simulator to boot.
 *
 * @param params - Various parameters.
 * @param params.simctl - The path to the `simctl` executable.
 * @param [params.timeout] - A number of milliseconds to wait before timing out
 * and aborting.
 * @param [params.tries] - The max number of `simctl` tries.
 * @param params.udid - The pair udid.
 */
export async function waitUntilBooted(params) {
	if (!params || typeof params !== 'object') {
		throw new TypeError('Expected params to be an object');
	}
	if (!params.simctl || typeof params.simctl !== 'string') {
		throw new TypeError('Expected simctl to be a string');
	}
	if (!params.udid || typeof params.udid !== 'string') {
		throw new TypeError('Expected udid to be a string');
	}
	if (params.tries !== undefined) {
		if (typeof params.tries !== 'number') {
			throw new TypeError('Expected tries to be a number');
		}
		if (params.tries < 1) {
			throw new RangeError('Expected tries to be a positive number');
		}
	}

	let timer: NodeJS.Timeout | undefined;
	const tasks: Promise<void>[] = [];

	if (params.timeout !== undefined) {
		if (typeof params.timeout !== 'number') {
			throw new TypeError('Expected timeout to be a number');
		}
		if (params.timeout < 1) {
			throw new RangeError('Expected timeout to be a positive number');
		}
		tasks.push(
			new Promise((_resolve, reject) => {
				timer = setTimeout(() => {
					log('Timed out waiting for the Simulator to boot');
					reject(new Error('Timed out waiting for the Simulator to boot'));
				}, params.timeout).unref();
			})
		);
	}

	let booted = false;
	log(`Waiting for simulator ${params.udid} to boot`);

	tasks.push(
		getSim(params).then((sim) => {
			if (!sim) {
				throw new Error(`Unable to find Simulator ${params.udid}`);
			}
			if (sim.isAvailable === false && sim.availability !== '(available)') {
				throw new Error('Simulator is not available');
			}
			log(`Sim state: ${sim.state}`);
			booted = /^booted$/i.test(sim.state);
		})
	);

	try {
		await Promise.race(tasks);
		return booted;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Calls `simctl` in an async loop until it succeeds or hits the max number of
 * tries.
 *
 * @param params - Various parameters.
 * @param params.simctl - The path to the `simctl` executable.
 * @param [params.tries] - The max number of `simctl` tries.
 * @param args - The args to pass directly into `simctl`.
 */
export async function trySimctl(params: TrySimctlParams, args: string[]): Promise<string> {
	if (!params || typeof params !== 'object') {
		throw new TypeError('Expected params to be an object');
	}
	if (!params.simctl || typeof params.simctl !== 'string') {
		throw new TypeError('Expected simctl to be a string');
	}
	if (params.tries !== undefined) {
		if (typeof params.tries !== 'number') {
			throw new TypeError('Expected tries to be a number');
		}
		if (params.tries < 1) {
			throw new RangeError('Expected tries to be a positive number');
		}
	}

	const maxTries = params.tries ?? 4;
	let timeout = 100;

	for (let i = 0; i < maxTries; i++) {
		try {
			log(
				`Running: ${params.simctl} ${
					Array.isArray(args)
						? ` ${args.map((s) => (s.includes(' ') ? `"${s}"` : s)).join(' ')}`
						: ''
				} (attempt ${i + 1} of ${maxTries})`
			);

			let stdout = '';
			let stderr = '';
			return await new Promise((resolve, reject) => {
				const child = spawn(params.simctl, args, { stdio: 'pipe' });
				child.stdout.on('data', (data) => {
					stdout += data.toString();
				});
				child.stderr.on('data', (data) => {
					stderr += data.toString();
				});
				child.on('error', reject);
				child.on('close', (code: number) => {
					if (code === 0) {
						resolve(stdout.trim());
					} else {
						reject(new ErrorWithCode(`simctl failed: ${stderr.trim()}`, code));
					}
				});
			});
		} catch (err) {
			if (i >= maxTries) {
				break;
			}

			const isPairError =
				(err instanceof ErrorWithCode &&
					(err.code === 161 ||
						(err.code === 37 && err.message.includes('This pair is already active')))) ||
				(err instanceof ErrorWithCode &&
					err.code === 3 &&
					err.message.includes('did not return a valid pid'));
			const isPidError =
				err instanceof ErrorWithCode &&
				err.code === 3 &&
				err.message.includes('did not return a valid pid');

			if (isPairError || isPidError) {
				// no need to retry
				throw err;
			}

			if (
				err instanceof ErrorWithCode &&
				err.message.includes('Failed to load CoreSimulatorService')
			) {
				log(
					`simctl needs to switch the CoreSimulatorService, waiting a couple seconds (code ${err.code})`
				);
				await new Promise((resolve) => setTimeout(resolve, 2000));
				continue;
			}

			// other error, retry
			await new Promise((resolve) => setTimeout(resolve, timeout));
			timeout *= 2;
		}
	}

	throw new Error(`simctl failed after ${maxTries} tries`);
}
