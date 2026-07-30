import * as xcode from '../src/xcode.ts';
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

function checkXcode(xcode) {
	expect(xcode).toBeTypeOf('object');
	expect(Object.keys(xcode)).toEqual([
		'xcodeapp',
		'path',
		'selected',
		'version',
		'build',
		'supported',
		'eulaAccepted',
		'sdks',
		'sims',
		'simDeviceTypes',
		'simRuntimes',
		'simDevicePairs',
		'watchos',
		'tvos',
		'teams',
		'executables',
	]);

	expect(xcode.xcodeapp).toBeTypeOf('string');
	expect(xcode.xcodeapp).not.toBe('');
	expect(fs.existsSync(xcode.xcodeapp)).toBe(true);
	expect(fs.statSync(xcode.xcodeapp).isDirectory()).toBe(true);

	expect(xcode.path).toBeTypeOf('string');
	expect(xcode.path).not.toBe('');
	expect(fs.existsSync(xcode.path)).toBe(true);
	expect(fs.statSync(xcode.path).isDirectory()).toBe(true);

	expect(xcode.build).toBeTypeOf('string');
	expect(xcode.build).not.toBe('');

	expect([null, true, false, 'maybe']).toContain(xcode.supported);

	expect(Array.isArray(xcode.sdks)).toBe(true);
	for (const sdk of xcode.sdks) {
		expect(sdk).toBeTypeOf('string');
		expect(sdk).not.toBe('');
	}

	expect(Array.isArray(xcode.sims)).toBe(true);
	for (const sim of xcode.sims) {
		expect(sim).toBeTypeOf('string');
		expect(sim).not.toBe('');
	}

	expect(xcode.simDeviceTypes).toBeTypeOf('object');
	for (const deviceType of Object.values(xcode.simDeviceTypes)) {
		expect(deviceType).toBeTypeOf('object');
		expect(Object.keys(deviceType)).toEqual(['name', 'model', 'supportsWatch']);
		expect(deviceType.name).toBeTypeOf('string');
		expect(deviceType.name).not.toBe('');
		expect(deviceType.model).toBeTypeOf('string');
		expect(deviceType.model).not.toBe('');
		expect(deviceType.supportsWatch).toBeTypeOf('boolean');
	}

	expect(xcode.simRuntimes).toBeTypeOf('object');
	for (const runtime of Object.values(xcode.simRuntimes)) {
		expect(runtime).toBeTypeOf('object');
		expect(Object.keys(runtime)).toEqual(['name', 'version']);
		expect(runtime.name).toBeTypeOf('string');
		expect(runtime.name).not.toBe('');
		expect(runtime.version).toBeTypeOf('string');
		expect(runtime.version).not.toBe('');
	}

	if (xcode.watchos !== null) {
		expect(Array.isArray(xcode.watchos.sdks)).toBe(true);
		for (const sdk of xcode.watchos.sdks) {
			expect(sdk).toBeTypeOf('string');
			expect(sdk).not.toBe('');
		}

		expect(Array.isArray(xcode.watchos.sims)).toBe(true);
		for (const sim of xcode.watchos.sims) {
			expect(sim).toBeTypeOf('string');
			expect(sim).not.toBe('');
		}
	}

	expect(xcode.teams).toBeTypeOf('object');
	for (const teamId of Object.keys(xcode.teams)) {
		expect(xcode.teams[teamId]).toBeTypeOf('object');
		expect(Object.keys(xcode.teams[teamId])).toEqual(['name', 'status', 'type']);
		expect(xcode.teams[teamId].name).toBeTypeOf('string');
		expect(xcode.teams[teamId].name).not.toBe('');
		expect(xcode.teams[teamId].status).toBeTypeOf('string');
		expect(xcode.teams[teamId].status).not.toBe('');
		expect(xcode.teams[teamId].type).toBeTypeOf('string');
		expect(xcode.teams[teamId].type).not.toBe('');
	}

	const keys = [
		'xcodebuild',
		'clang',
		'clang_xx',
		'libtool',
		'lipo',
		'otool',
		'pngcrush',
		'simulator',
		'watchsimulator',
		'simctl',
	];
	expect(xcode.executables).toBeTypeOf('object');
	for (const key of keys) {
		expect(xcode.executables).toHaveProperty(key);
		if (xcode.executables[key] !== null) {
			expect(xcode.executables[key]).toBeTypeOf('string');
			expect(xcode.executables[key]).not.toBe('');
			expect(fs.existsSync(xcode.executables[key])).toBe(true);
			expect(fs.statSync(xcode.executables[key]).isDirectory()).toBe(false);
		}
	}
}

describe('xcode', function () {
	it('namespace should be an object', function () {
		expect(xcode).toBeTypeOf('object');
	});

	it('detect should find Xcode installations', async () => {
		const results = await xcode.detect({ bypassCache: true });

		expect(results).toBeTypeOf('object');
		expect(Object.keys(results)).toEqual(['selectedXcode', 'xcode', 'issues']);
		expect(results.selectedXcode).toBeTypeOf('object');
		expect(results.xcode).toBeTypeOf('object');
		expect(results.issues).toBeTypeOf('array');
		expect(Object.keys(results)).toEqual(['selectedXcode', 'xcode', 'issues']);
		expect(results.selectedXcode).toBeTypeOf('object');
		expect(results.xcode).toBeTypeOf('object');
		expect(Array.isArray(results.issues)).toBe(true);

		if (results.selectedXcode !== null) {
			checkXcode(results.selectedXcode);
		}

		for (const xc of Object.values(results.xcode)) {
			checkXcode(xc);
		}

		for (const issue of results.issues) {
			expect(issue).toBeTypeOf('object');
			expect(issue).toHaveProperty('id');
			expect(issue).toHaveProperty('type');
			expect(issue).toHaveProperty('message');
			expect(issue.id).toBeTypeOf('string');
			expect(issue.type).toBeTypeOf('string');
			expect(issue.type).match(/^info|warning|error$/);
			expect(issue.message).toBeTypeOf('string');
		}
	});

	it('detect should map Xcode 27 simulator device pairs', async () => {
		const results = await xcode.detect({ bypassCache: true });
		const xcode27 = Object.values(results.xcode)
			.filter((xc) => xc.version.startsWith('27.'))
			.shift();

		if (!xcode27) {
			return;
		}

		expect(xcode27.simDevicePairs).toEqual({
			'26.x': {
				'26.x': true,
				'27.x': true,
			},
			'27.x': {
				'26.x': true,
				'27.x': true,
			},
		});
	});

	it('detect should use DeviceHub as the Xcode 27 simulator executable', async () => {
		const results = await xcode.detect({ bypassCache: true });
		const xcode27 = Object.values(results.xcode)
			.filter((xc) => xc.version.startsWith('27.'))
			.shift();

		if (!xcode27) {
			return;
		}

		const deviceHub = 'DeviceHub.app/Contents/MacOS/DeviceHub';
		expect(xcode27.executables.simulator).not.toBeNull();
		expect(xcode27.executables.simulator).toMatch(new RegExp(`${deviceHub}$`));
		expect(xcode27.executables.watchsimulator).toEqual(xcode27.executables.simulator);
	});
});
