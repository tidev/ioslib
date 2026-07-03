import { env } from '../src/index.ts';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('env', function () {
	it('detect should find dev environment dependencies', async () => {
		const results = await env.detect();

		expect(results).toBeTypeOf('object');
		expect(results).toHaveProperty('executables');
		expect(results).toHaveProperty('issues');
		expect(results.executables).toBeTypeOf('object');
		expect(results.executables).toHaveProperty('security');
		expect(results.executables).toHaveProperty('xcodeSelect');
		expect(Array.isArray(results.issues)).toBe(true);

		if (results.executables.security !== null) {
			expect(results.executables.security).toBeTypeOf('string');
			expect(existsSync(results.executables.security)).toBe(true);
		}

		if (results.executables.xcodeSelect !== null) {
			expect(results.executables.xcodeSelect).toBeTypeOf('string');
			expect(existsSync(results.executables.xcodeSelect)).toBe(true);
		}

		expect(Array.isArray(results.issues)).toBe(true);
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
});
