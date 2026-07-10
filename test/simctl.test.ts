import * as simctl from '../src/simctl.ts';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDir = fileURLToPath(new URL('.', import.meta.url));
const TEST_APP_PATH = join(
	testDir,
	'TestApp/build/Build/Products/Debug-iphonesimulator/TestApp.app'
);
const TEST_APP_ID = 'com.appcelerator.testapp3';
const SIM_NAME_PREFIX = 'ioslib-simctl-test-';
const SIMCTL = { simctl: 'xcrun' } as const;

type DeviceState = { state: string; name: string };
type SimctlSnapshot = {
	devices: Map<string, DeviceState>;
	pairUdids: Set<string>;
};

let initialSnapshot: SimctlSnapshot;
let iosRuntime: string;
let iosDeviceType: string;
const createdUdids = new Set<string>();
const bootedDuringTest = new Map<string, string>();

async function captureSnapshot(): Promise<SimctlSnapshot> {
	const info = await simctl.list(SIMCTL);
	const devices = new Map<string, DeviceState>();
	for (const sims of Object.values(info.devices)) {
		for (const sim of sims) {
			devices.set(sim.udid, { state: sim.state, name: sim.name });
		}
	}
	return { devices, pairUdids: new Set(Object.keys(info.pairs)) };
}

async function deleteSimulator(udid: string): Promise<void> {
	try {
		await simctl.shutdown({ ...SIMCTL, udid });
	} catch {
		// already shutdown or missing
	}
	try {
		await simctl.trySimctl(SIMCTL, ['delete', udid]);
	} catch {
		// already deleted
	}
}

async function cleanupOrphanedTestSimulators(): Promise<void> {
	const info = await simctl.list(SIMCTL);
	for (const sims of Object.values(info.devices)) {
		for (const sim of sims) {
			if (sim.name.startsWith(SIM_NAME_PREFIX)) {
				await deleteSimulator(sim.udid);
			}
		}
	}
}

function assertSnapshotsEqual(before: SimctlSnapshot, after: SimctlSnapshot): void {
	for (const [udid, device] of before.devices) {
		const afterDevice = after.devices.get(udid);
		expect(afterDevice, `device ${udid} missing after tests`).toBeDefined();
		expect(afterDevice!.state).toBe(device.state);
		expect(afterDevice!.name).toBe(device.name);
	}

	for (const [udid, device] of after.devices) {
		expect(
			before.devices.has(udid),
			`unexpected simulator ${udid} (${device.name}) after tests`
		).toBe(true);
	}

	expect([...after.pairUdids].sort()).toEqual([...before.pairUdids].sort());
}

async function restoreSimulatorState(): Promise<void> {
	for (const udid of createdUdids) {
		await deleteSimulator(udid);
	}
	createdUdids.clear();

	for (const [udid, originalState] of bootedDuringTest) {
		const currentSim = await simctl.getSim({ ...SIMCTL, udid });
		if (!currentSim) {
			continue;
		}

		const currentState = currentSim.state;
		if (/^booted$/i.test(originalState) && /^shutdown/i.test(currentState)) {
			await simctl.boot({ ...SIMCTL, udid });
		} else if (/^shutdown/i.test(originalState) && /^booted$/i.test(currentState)) {
			await simctl.shutdown({ ...SIMCTL, udid });
		}
	}
	bootedDuringTest.clear();

	// allow CoreSimulatorService to settle before comparing state
	await new Promise((resolve) => setTimeout(resolve, 1000));

	const finalSnapshot = await captureSnapshot();
	assertSnapshotsEqual(initialSnapshot, finalSnapshot);
}

async function createTestSimulator(name?: string): Promise<string> {
	const udid = await simctl.create({
		...SIMCTL,
		name: name ?? `${SIM_NAME_PREFIX}${Date.now()}`,
		deviceType: iosDeviceType,
		runtime: iosRuntime,
	});
	expect(udid).toBeTruthy();
	createdUdids.add(udid!);
	return udid!;
}

async function ensureBooted(udid: string): Promise<void> {
	const sim = await simctl.getSim({ ...SIMCTL, udid });
	if (!sim) {
		throw new Error(`Simulator ${udid} not found`);
	}

	if (!/^booted$/i.test(sim.state)) {
		if (!bootedDuringTest.has(udid) && !createdUdids.has(udid)) {
			bootedDuringTest.set(udid, sim.state);
		}
		await simctl.boot({ ...SIMCTL, udid });

		for (let attempt = 0; attempt < 60; attempt++) {
			const current = await simctl.getSim({ ...SIMCTL, udid });
			if (current && /^booted$/i.test(current.state)) {
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		throw new Error(`Timed out booting simulator ${udid}`);
	}
}

async function ensureTestAppBuilt(): Promise<void> {
	if (existsSync(TEST_APP_PATH)) {
		return;
	}

	const testAppDir = join(testDir, 'TestApp');
	await new Promise<void>((resolve, reject) => {
		const child = spawn(
			'xcodebuild',
			[
				'-scheme',
				'TestApp',
				'-configuration',
				'Debug',
				'-destination',
				'platform=iOS Simulator,name=iPhone 17',
				'-derivedDataPath',
				'./build',
				'IPHONEOS_DEPLOYMENT_TARGET=15.0',
				'build',
			],
			{ cwd: testAppDir, stdio: 'pipe' }
		);

		let stderr = '';
		child.stderr.on('data', (data) => {
			stderr += data.toString();
		});
		child.on('error', reject);
		child.on('close', (code) => {
			if (code === 0 && existsSync(TEST_APP_PATH)) {
				resolve();
			} else {
				reject(new Error(`Failed to build TestApp (exit ${code}): ${stderr}`));
			}
		});
	});
}

function findAvailableIosRuntimeAndDeviceType(info: Awaited<ReturnType<typeof simctl.list>>): {
	runtime: string;
	deviceType: string;
} {
	const runtime = info.runtimes.find((rt) => rt.isAvailable && rt.platform === 'iOS');
	if (!runtime) {
		throw new Error('No available iOS simulator runtime found');
	}

	const deviceType =
		runtime.supportedDeviceTypes.find(
			(dt) => dt.identifier.includes('iPhone-17') && !dt.identifier.includes('Pro')
		) ??
		runtime.supportedDeviceTypes.find((dt) => dt.productFamily === 'iPhone') ??
		runtime.supportedDeviceTypes[0];

	if (!deviceType) {
		throw new Error('No suitable iPhone simulator device type found');
	}

	return { runtime: runtime.identifier, deviceType: deviceType.identifier };
}

beforeAll(async () => {
	await cleanupOrphanedTestSimulators();
	initialSnapshot = await captureSnapshot();

	const info = await simctl.list(SIMCTL);
	({ runtime: iosRuntime, deviceType: iosDeviceType } = findAvailableIosRuntimeAndDeviceType(info));

	await ensureTestAppBuilt();
}, 180_000);

afterAll(async () => {
	await restoreSimulatorState();
}, 120_000);

describe('simctl', () => {
	describe('parameter validation', () => {
		it('create rejects invalid params', async () => {
			await expect(simctl.create(null as never)).rejects.toThrow(TypeError);
			await expect(
				simctl.create({ ...SIMCTL, name: '', deviceType: 'x', runtime: 'y' })
			).rejects.toThrow('Expected name to be a string');
			await expect(
				simctl.create({ ...SIMCTL, name: 'test', deviceType: '', runtime: 'y' })
			).rejects.toThrow('Expected deviceType to be a string');
			await expect(
				simctl.create({ ...SIMCTL, name: 'test', deviceType: 'x', runtime: '' })
			).rejects.toThrow('Expected runtime to be a string');
		});

		it('install rejects invalid params', async () => {
			await expect(simctl.install(null as never)).rejects.toThrow(TypeError);
			await expect(simctl.install({ ...SIMCTL, appPath: '', udid: 'x' })).rejects.toThrow(
				'Expected appPath to be a string'
			);
			await expect(simctl.install({ ...SIMCTL, appPath: '/tmp', udid: '' })).rejects.toThrow(
				'Expected udid to be a string'
			);
		});

		it('launch rejects invalid params', async () => {
			await expect(simctl.launch(null as never)).rejects.toThrow(TypeError);
			await expect(simctl.launch({ ...SIMCTL, appId: '', udid: 'x' })).rejects.toThrow(
				'Expected appId to be a string'
			);
			await expect(simctl.launch({ ...SIMCTL, appId: 'x', udid: '' })).rejects.toThrow(
				'Expected udid to be a string'
			);
		});

		it('boot rejects invalid params', async () => {
			await expect(simctl.boot(null as never)).rejects.toThrow(TypeError);
			await expect(simctl.boot({ ...SIMCTL, udid: '' })).rejects.toThrow(
				'Expected udid to be a string'
			);
		});

		it('shutdown rejects invalid params', async () => {
			await expect(simctl.shutdown(null as never)).rejects.toThrow(TypeError);
			await expect(simctl.shutdown({ ...SIMCTL, udid: '' })).rejects.toThrow(
				'Expected udid to be a string'
			);
		});

		it('uninstall rejects invalid params', async () => {
			await expect(simctl.uninstall(null as never)).rejects.toThrow(TypeError);
			await expect(simctl.uninstall({ simctl: '', udid: 'x', appId: 'y' })).rejects.toThrow(
				'Expected simctl to be a string'
			);
			await expect(simctl.uninstall({ ...SIMCTL, udid: '', appId: 'y' })).rejects.toThrow(
				'Expected udid to be a string'
			);
			await expect(simctl.uninstall({ ...SIMCTL, udid: 'x', appId: '' })).rejects.toThrow(
				'Expected appId to be a string'
			);
		});

		it('pair rejects invalid params', async () => {
			await expect(simctl.pair(null as never)).rejects.toThrow(TypeError);
			await expect(simctl.pair({ ...SIMCTL, simUdid: '', watchSimUdid: 'x' })).rejects.toThrow(
				'Expected simUdid to be a string'
			);
			await expect(simctl.pair({ ...SIMCTL, simUdid: 'x', watchSimUdid: '' })).rejects.toThrow(
				'Expected watchSimUdid to be a string'
			);
		});

		it('unpair rejects invalid params', async () => {
			await expect(simctl.unpair(null as never)).rejects.toThrow(TypeError);
			await expect(simctl.unpair({ ...SIMCTL, udid: '' })).rejects.toThrow(
				'Expected udid to be a string'
			);
		});

		it('getSim rejects invalid params', async () => {
			await expect(simctl.getSim(null as never)).rejects.toThrow(TypeError);
			await expect(simctl.getSim({ ...SIMCTL, udid: '' })).rejects.toThrow(
				'Expected udid to be a string'
			);
		});

		it('waitUntilBooted rejects invalid params', async () => {
			await expect(simctl.waitUntilBooted(null as never)).rejects.toThrow(TypeError);
			await expect(simctl.waitUntilBooted({ ...SIMCTL, udid: '' })).rejects.toThrow(
				'Expected udid to be a string'
			);
			await expect(simctl.waitUntilBooted({ ...SIMCTL, udid: 'x', tries: 0 })).rejects.toThrow(
				RangeError
			);
			await expect(
				simctl.waitUntilBooted({ ...SIMCTL, udid: 'x', tries: 'bad' as never })
			).rejects.toThrow(TypeError);
			await expect(simctl.waitUntilBooted({ ...SIMCTL, udid: 'x', timeout: 0 })).rejects.toThrow(
				RangeError
			);
			await expect(
				simctl.waitUntilBooted({ ...SIMCTL, udid: 'x', timeout: 'bad' as never })
			).rejects.toThrow(TypeError);
		});

		it('trySimctl rejects invalid params', async () => {
			await expect(simctl.trySimctl('bad' as never)).rejects.toThrow(TypeError);
			await expect(simctl.trySimctl({ simctl: 1 as never })).rejects.toThrow(TypeError);
			await expect(simctl.trySimctl({ ...SIMCTL, tries: 0 })).rejects.toThrow(RangeError);
			await expect(simctl.trySimctl({ ...SIMCTL, tries: 'bad' as never })).rejects.toThrow(
				TypeError
			);
		});
	});

	describe('trySimctl', () => {
		it('returns simctl help output by default', async () => {
			const result = await simctl.trySimctl();
			expect(result).toBeTypeOf('string');
			expect(result.length).toBeGreaterThan(0);
		});

		it('lists devices via explicit args', async () => {
			const result = await simctl.trySimctl(SIMCTL, ['list', 'devices', '--json']);
			expect(result).toContain('"devices"');
		});

		it('fails for invalid commands', async () => {
			await expect(
				simctl.trySimctl({ ...SIMCTL, tries: 1 }, ['definitely-not-a-command'])
			).rejects.toThrow('simctl failed after 1 tries');
		});

		it('fails for invalid executable', async () => {
			await expect(
				simctl.trySimctl({ simctl: '/definitely/not/simctl', tries: 1 }, ['list'])
			).rejects.toThrow();
		});
	});

	describe('list', () => {
		it('returns simulators, runtimes, device types, and pairs', async () => {
			const info = await simctl.list(SIMCTL);
			expect(info.devices).toBeTypeOf('object');
			expect(Array.isArray(info.runtimes)).toBe(true);
			expect(info.runtimes.length).toBeGreaterThan(0);
			expect(info.pairs).toBeTypeOf('object');
			expect(info.iosSimToWatchSimToPair).toBeTypeOf('object');
		});

		it('builds iosSimToWatchSimToPair from pair state', async () => {
			const info = await simctl.list(SIMCTL);
			for (const [phoneUdid, watches] of Object.entries(info.iosSimToWatchSimToPair)) {
				expect(phoneUdid).toBeTypeOf('string');
				for (const [watchUdid, pair] of Object.entries(watches)) {
					expect(watchUdid).toBeTypeOf('string');
					expect(pair.udid).toBeTypeOf('string');
					expect(pair.active).toBeTypeOf('boolean');
					expect(info.pairs[pair.udid]).toBeDefined();
				}
			}
		});
	});

	describe('listDevices', () => {
		it('returns devices with no params', async () => {
			const devices = await simctl.listDevices();
			expect(devices).toBeTypeOf('object');
		});

		it('returns the same devices as list().devices', async () => {
			const [devices, info] = await Promise.all([simctl.listDevices(SIMCTL), simctl.list(SIMCTL)]);
			expect(devices).toEqual(info.devices);
		});
	});

	describe('getSim', () => {
		it('returns undefined for unknown simulators', async () => {
			const sim = await simctl.getSim({ ...SIMCTL, udid: '00000000-0000-0000-0000-000000000000' });
			expect(sim).toBeUndefined();
		});

		it('returns an existing simulator', async () => {
			const [udid] = initialSnapshot.devices.keys();
			expect(udid).toBeDefined();

			const sim = await simctl.getSim({ ...SIMCTL, udid: udid! });
			expect(sim).toBeDefined();
			expect(sim!.udid).toBe(udid);
		});
	});

	describe.sequential('simulator lifecycle', () => {
		it('create returns a new simulator udid', async () => {
			const udid = await createTestSimulator();
			const sim = await simctl.getSim({ ...SIMCTL, udid });
			expect(sim).toBeDefined();
			expect(sim!.name.startsWith(SIM_NAME_PREFIX)).toBe(true);
		});

		it('create fails with invalid runtime and device type', async () => {
			await expect(
				simctl.create({
					...SIMCTL,
					name: `${SIM_NAME_PREFIX}invalid`,
					deviceType: 'invalid-device-type',
					runtime: 'invalid-runtime',
				})
			).rejects.toThrow();
		});

		it('shutdown is a no-op for an already shutdown simulator', async () => {
			const udid = await createTestSimulator();
			await expect(simctl.shutdown({ ...SIMCTL, udid })).resolves.toBeUndefined();
		});

		it('shutdown fails for an unknown simulator', async () => {
			await expect(
				simctl.shutdown({ ...SIMCTL, udid: '00000000-0000-0000-0000-000000000000' })
			).rejects.toThrow('Unable to find Simulator');
		});

		it('boot starts a created simulator', async () => {
			const udid = await createTestSimulator();
			await simctl.boot({ ...SIMCTL, udid });
			await ensureBooted(udid);

			const sim = await simctl.getSim({ ...SIMCTL, udid });
			expect(sim?.state).toMatch(/^booted$/i);
		});

		it('boot fails for an unknown simulator', async () => {
			await expect(
				simctl.boot({ ...SIMCTL, udid: '00000000-0000-0000-0000-000000000000' })
			).rejects.toThrow();
		});

		it('waitUntilBooted returns true for a booted simulator', async () => {
			const udid = await createTestSimulator();
			await ensureBooted(udid);

			const booted = await simctl.waitUntilBooted({ ...SIMCTL, udid, timeout: 5000 });
			expect(booted).toBe(true);
		});

		it('waitUntilBooted returns false for a shutdown simulator', async () => {
			const udid = await createTestSimulator();
			const booted = await simctl.waitUntilBooted({ ...SIMCTL, udid, timeout: 1000 });
			expect(booted).toBe(false);
		});

		it('waitUntilBooted fails for an unknown simulator', async () => {
			await expect(
				simctl.waitUntilBooted({
					...SIMCTL,
					udid: '00000000-0000-0000-0000-000000000000',
					timeout: 1000,
				})
			).rejects.toThrow('Unable to find Simulator');
		});

		it('shutdown stops a booted simulator', async () => {
			const udid = await createTestSimulator();
			await ensureBooted(udid);
			await simctl.shutdown({ ...SIMCTL, udid });

			const sim = await simctl.getSim({ ...SIMCTL, udid });
			expect(sim?.state).toMatch(/^shutdown/i);
		});
	}, 120_000);

	describe.sequential('app install and launch', () => {
		it('install fails on a shutdown simulator', async () => {
			const udid = await createTestSimulator();
			await expect(simctl.install({ ...SIMCTL, udid, appPath: TEST_APP_PATH })).rejects.toThrow();
		});

		it('install fails with a missing app path on a booted simulator', async () => {
			const udid = await createTestSimulator();
			await ensureBooted(udid);
			await expect(
				simctl.install({ ...SIMCTL, udid, appPath: '/definitely/not/an/app.app' })
			).rejects.toThrow();
		});

		it('installs, launches, and uninstalls an app on a booted simulator', async () => {
			const udid = await createTestSimulator();
			await ensureBooted(udid);

			await expect(
				simctl.install({ ...SIMCTL, udid, appPath: TEST_APP_PATH })
			).resolves.toBeUndefined();
			await expect(simctl.launch({ ...SIMCTL, udid, appId: TEST_APP_ID })).resolves.toBeUndefined();
			await expect(
				simctl.uninstall({ ...SIMCTL, udid, appId: TEST_APP_ID })
			).resolves.toBeUndefined();
		});

		it('launch fails with an unknown app id on a booted simulator', async () => {
			const udid = await createTestSimulator();
			await ensureBooted(udid);
			await expect(
				simctl.launch({ ...SIMCTL, udid, appId: 'com.definitely.not.installed' })
			).rejects.toThrow();
		});

		it('uninstall ignores apps that are not installed', async () => {
			const udid = await createTestSimulator();
			await ensureBooted(udid);
			await expect(
				simctl.uninstall({ ...SIMCTL, udid, appId: 'com.definitely.not.installed' })
			).resolves.toBeUndefined();
		});
	}, 180_000);

	describe('pairing helpers', () => {
		it('pair currently returns the stubbed pair id', async () => {
			const pairId = await simctl.pair({
				...SIMCTL,
				simUdid: '00000000-0000-0000-0000-000000000001',
				watchSimUdid: '00000000-0000-0000-0000-000000000002',
			});
			expect(pairId).toBe('some udid');
		});

		it('activatePair ignores invalid pair ids after retry exhaustion', async () => {
			await expect(
				simctl.activatePair({ ...SIMCTL, udid: '00000000-0000-0000-0000-000000000099' })
			).resolves.toBeUndefined();
		});

		it('pairAndActivate ignores activation failures after retry exhaustion', async () => {
			await expect(
				simctl.pairAndActivate({
					...SIMCTL,
					simUdid: '00000000-0000-0000-0000-000000000001',
					watchSimUdid: '00000000-0000-0000-0000-000000000002',
				})
			).resolves.toBeUndefined();
		});

		it('activatePair ignores an already-active pair', async () => {
			const info = await simctl.list(SIMCTL);
			const activePair = Object.entries(info.pairs).find(([, pair]) =>
				pair.state.startsWith('(active,')
			)?.[0];

			if (!activePair) {
				return;
			}

			await expect(simctl.activatePair({ ...SIMCTL, udid: activePair })).resolves.toBeUndefined();
		});

		it('unpair is a no-op for an unknown pair id', async () => {
			await expect(
				simctl.unpair({ ...SIMCTL, udid: '00000000-0000-0000-0000-000000000099' })
			).resolves.toBeUndefined();
		});
	});
});
