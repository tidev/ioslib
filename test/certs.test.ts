import { certs } from '../src/index.ts';
import { describe, expect, it } from 'vitest';

describe('certs', () => {
	it('detect certs', async () => {
		const results = await certs.detect();
		assertCertResults(results);
	});

	it('return results from cache', async () => {
		const results = await certs.detect({ bypassCache: false });
		assertCertResults(results);
	});

	// it('watch for changes for 10 seconds', async () => {
	// 	const watcher = ioslib.certs.watch({ watchInterval: 1000 });

	// 	return Promise.race([
	// 		new Promise((resolve) => setTimeout(resolve, 10000)),
	// 		new Promise((resolve) => watcher.on('detected', resolve)),
	// 	]).finally(() => watcher.unwatch());
	// });
});

function assertCertResults(results: certs.CertResults) {
	expect(results).toBeTypeOf('object');
	expect(results).toHaveProperty('certs');
	expect(results).toHaveProperty('issues');

	expect(results.certs).toHaveProperty('keychains');
	expect(results.certs).toHaveProperty('wwdr');
	expect(results.certs.keychains).toBeTypeOf('object');
	expect(results.certs.wwdr).toBeTypeOf('boolean');

	for (const keychainCert of Object.values(results.certs.keychains)) {
		expect(keychainCert).toBeTypeOf('object');
		expect(keychainCert).toHaveProperty('developer');
		expect(keychainCert).toHaveProperty('distribution');
		expect(Array.isArray(keychainCert.developer)).toBe(true);
		expect(Array.isArray(keychainCert.distribution)).toBe(true);

		for (const cert of keychainCert.developer) {
			expect(cert).toBeTypeOf('object');
			expect(cert).toHaveProperty('name');
			expect(cert).toHaveProperty('fullname');
			expect(cert).toHaveProperty('pem');
			expect(cert).toHaveProperty('before');
			expect(cert).toHaveProperty('after');
			expect(cert).toHaveProperty('expired');
			expect(cert).toHaveProperty('invalid');
		}

		for (const cert of keychainCert.distribution) {
			expect(cert).toBeTypeOf('object');
			expect(cert).toHaveProperty('name');
			expect(cert).toHaveProperty('fullname');
			expect(cert).toHaveProperty('pem');
			expect(cert).toHaveProperty('before');
			expect(cert).toHaveProperty('after');
			expect(cert).toHaveProperty('expired');
			expect(cert).toHaveProperty('invalid');
		}
	}

	expect(Array.isArray(results.issues)).toBe(true);
	for (const issue of results.issues) {
		expect(issue).toBeTypeOf('object');
		expect(issue).toHaveProperty('id');
		expect(issue).toHaveProperty('type');
		expect(issue).toHaveProperty('message');
		expect(issue.id).toBeTypeOf('string');
		expect(issue.type).toBeTypeOf('string');
		expect(issue.type).toMatch(/^info|warning|error$/);
		expect(issue.message).toBeTypeOf('string');
	}
}
