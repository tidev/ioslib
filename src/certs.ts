/**
 * Detects iOS developer and distribution certificates and the WWDR certificate.
 *
 * @module certs
 */

import * as env from './env.ts';
import { Issue } from './util/issue.ts';
import { spawn, spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';

/**
 * An installed code signing certificate.
 */
export type Certificate = {
	/** The certificate name with the type prefix removed. */
	name: string;
	/** The full decoded common name from the certificate subject. */
	fullname: string;
	/** The PEM-encoded certificate. */
	pem: string;
	/** The date the certificate becomes valid. */
	before: Date;
	/** The date the certificate expires. */
	after: Date;
	/** `true` if the certificate is past its expiration date. */
	expired: boolean;
	/** `true` if the certificate is expired or not yet valid. */
	invalid: boolean;
	/** The Apple Developer team ID from the certificate subject. */
	teamId?: string;
};

/**
 * Certificates grouped by keychain path.
 */
export type Keychains = {
	[key: string]: {
		developer: Certificate[];
		distribution: Certificate[];
	};
};

/**
 * Detected certificate information.
 */
export type Certs = {
	keychains: Keychains;
	/** `true` if a valid WWDR intermediate certificate is installed. */
	wwdr: boolean;
};

/**
 * The result of a certificate detection run.
 */
export type CertResults = {
	certs: Certs;
	issues: Issue[];
};

type SearchKeychainResult = {
	certs: Certificate[];
	keychain: string;
	type: string;
};

let cache: CertResults | null = null;
let cacheValidOnly: boolean | null = null;

// const watchers = {};
// let watchResults = null;
// let watchInterval = 60000;
// let watchTimer = null;

/**
 * Detects installed certificates.
 *
 * @param [options] - An object containing various settings.
 * @param [options.bypassCache=false] - When `true`, re-detects all certificates.
 * @param [options.validOnly=true] - When `true`, only returns non-expired, valid certificates.
 * @returns The detected certificates and any issues found.
 */
export async function detect(options?: { bypassCache?: boolean; validOnly?: boolean }) {
	if (cache && options?.bypassCache === true && cacheValidOnly === options?.validOnly) {
		return cache;
	}

	const validOnly = options?.validOnly !== false;
	const { executables } = await env.detect();
	const security = executables.security;
	const keychains: Keychains = {};
	let wwdr = false;
	const issues: Issue[] = [];

	if (security) {
		const pending: Promise<SearchKeychainResult>[] = [];
		const keychainPaths = await listKeychainPaths(security);
		for (const keychainPath of keychainPaths) {
			pending.push(
				searchKeychain(security, keychainPath, 'iPhone Developer:', 'developer', validOnly),
				searchKeychain(security, keychainPath, 'Development:', 'developer', validOnly),
				searchKeychain(security, keychainPath, 'Distribution:', 'distribution', validOnly),
				searchKeychain(
					security,
					keychainPath,
					'Apple Worldwide Developer Relations Certification Authority',
					'wwdr',
					validOnly
				)
			);
		}
		const results = await Promise.allSettled(pending);
		for (const result of results) {
			if (result.status === 'fulfilled' && result.value) {
				const { keychain, type, certs } = result.value;
				if (type === 'wwdr') {
					wwdr = true;
					continue;
				}
				if (!keychains[keychain]) {
					keychains[keychain] = {
						developer: [],
						distribution: [],
					};
				}
				keychains[keychain][type] = certs;
			}
		}
	}

	cache = {
		certs: {
			keychains,
			wwdr,
		},
		issues,
	};
	cacheValidOnly = validOnly;
	return cache;
}

const keychainNameRegExp = /[^"]*"([^"]*)"/;

/**
 * Returns the paths of all configured keychains.
 *
 * @param security - Path to the `security` executable.
 */
async function listKeychainPaths(security: string) {
	const { stdout, stderr, status } = spawnSync(security, ['list-keychains'], { encoding: 'utf-8' });
	if (status !== 0) {
		throw new Issue('Failed to list keychains', {
			id: 'FAILED_TO_LIST_KEYCHAINS',
			type: 'error',
			details: stderr.toString(),
		});
	}

	const lines = stdout.split('\n');
	const keychains: string[] = [];
	for (const line of lines) {
		const m = line.match(keychainNameRegExp);
		const keychain = m?.[1]?.trim();
		if (keychain) {
			keychains.push(keychain);
		}
	}

	return keychains;
}

const certRegExp = /^(?:((?:Apple|iOS) Development)|((?:iOS|Apple|iPhone) Distribution)): (.+)$/;

/**
 * Searches a keychain for certificates matching the given name.
 *
 * @param security - Path to the `security` executable.
 * @param keychain - Path to the keychain to search.
 * @param name - The `-c` name filter passed to `find-certificate`.
 * @param type - The certificate category (`developer`, `distribution`, or `wwdr`).
 * @param validOnly - When `true`, omits expired and not-yet-valid certificates.
 */
async function searchKeychain(
	security: string,
	keychain: string,
	name: string,
	type: string,
	validOnly: boolean
) {
	const out = await new Promise<string>((resolve, reject) => {
		const child = spawn(security, ['find-certificate', '-c', name, '-a', '-p', keychain], {
			stdio: 'pipe',
		});
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (data) => {
			stdout += data;
		});
		child.stderr.on('data', (data) => {
			stderr += data;
		});
		child.on('error', reject);
		child.on('close', (code) => {
			if (code !== 0) {
				reject(
					new Issue('Failed to search keychain', {
						id: 'FAILED_TO_SEARCH_KEYCHAIN',
						type: 'error',
						details: stderr.toString(),
					})
				);
			} else {
				resolve(stdout);
			}
		});
	});

	return {
		certs: parseCerts(out, {
			prefix: name === 'iPhone Developer:' ? name : undefined,
			validOnly,
		}),
		keychain,
		type,
	};
}

const pemRegExp = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;

/**
 * Decodes a string containing octal UTF-8 escape sequences (e.g. `\320\227`) to UTF-8.
 *
 * @param input - The encoded common name from a certificate subject.
 */
function decodeOctalUtf8(input: string): string {
	const bytes: number[] = [];

	for (let i = 0; i < input.length; i++) {
		const c = input[i];
		if (c === '\\' && i + 3 < input.length) {
			const octByte = input.slice(i + 1, i + 4);
			const parsed = Number.parseInt(octByte, 8);
			if (!Number.isNaN(parsed)) {
				bytes.push(parsed);
				i += 3;
				continue;
			}
		}
		bytes.push(input.charCodeAt(i));
	}

	return Buffer.from(bytes).toString('utf8');
}

/**
 * Extracts a subject attribute value from an `X509Certificate` subject string.
 *
 * @param subject - The certificate subject (newline-separated `KEY=value` pairs).
 * @param key - The attribute key to look up (e.g. `CN`, `OU`).
 */
function parseSubjectAttribute(subject: string, key: string): string | undefined {
	for (const line of subject.split('\n')) {
		const idx = line.indexOf('=');
		if (idx === -1) {
			continue;
		}
		if (line.slice(0, idx) === key) {
			return line.slice(idx + 1);
		}
	}
}

/**
 * Parses a PEM-encoded X.509 certificate.
 *
 * @param pem - The PEM-encoded certificate.
 */
function decodeCert(pem: string) {
	const x509 = new X509Certificate(pem);
	const commonName = parseSubjectAttribute(x509.subject, 'CN');
	if (!commonName) {
		throw new Error('Certificate is missing a common name');
	}

	const teamId = parseSubjectAttribute(x509.subject, 'OU');

	return {
		commonName,
		teamId,
		notBefore: new Date(x509.validFrom),
		notAfter: new Date(x509.validTo),
	};
}

/**
 * Parses PEM-encoded certificates from `security find-certificate` output.
 *
 * @param text - The stdout from `security find-certificate`.
 * @param [options] - Parsing options.
 * @param [options.prefix] - When set, strips this prefix from the common name to derive `name`.
 * @param [options.validOnly=true] - When `true`, omits expired and not-yet-valid certificates.
 */
function parseCerts(
	text: string,
	options?: {
		prefix?: string;
		validOnly?: boolean;
	}
): Certificate[] {
	const now = new Date();
	const validOnly = options?.validOnly !== false;
	const prefix = options?.prefix;
	const certs: Certificate[] = [];

	for (const pem of text.match(pemRegExp) ?? []) {
		try {
			const cert = decodeCert(pem);
			const expired = cert.notAfter < now;
			const invalid = expired || cert.notBefore > now;
			const fullname = decodeOctalUtf8(cert.commonName).trim();
			let name: string | undefined;

			if (!prefix) {
				if (fullname === 'Apple Worldwide Developer Relations Certification Authority') {
					name = cert.commonName;
				} else {
					const match = fullname.match(certRegExp);
					if (match) {
						name = match[3];
					}
				}
			} else {
				name = decodeOctalUtf8(cert.commonName.slice(prefix.length)).trim();
			}

			if (!validOnly || !invalid) {
				certs.push({
					name: name ?? '',
					fullname,
					pem,
					before: cert.notBefore,
					after: cert.notAfter,
					expired,
					invalid,
					teamId: cert.teamId,
				});
			}
		} catch {
			// skip malformed certificates
		}
	}

	return certs;
}

/**
 * Populates `dest.issues` with warnings and errors based on detected certificates.
 *
 * @param dest - The certificate detection results to inspect.
 */
function detectIssues(dest) {
	dest.issues = [];

	if (!dest.certs.wwdr) {
		dest.issues.push({
			id: 'IOS_NO_WWDR_CERT_FOUND',
			type: 'error',
			message:
				__(
					'Apple’s World Wide Developer Relations (WWDR) intermediate certificate is not installed.'
				) +
				'\n' +
				__('This will prevent you from building apps for iOS devices or package for distribution.'),
		});
	}

	if (!Object.keys(dest.certs.keychains).length) {
		// I don't think this is even possible
		dest.issues.push({
			id: 'IOS_NO_KEYCHAINS_FOUND',
			type: 'warning',
			message: __('Unable to find any keychains found.'),
		});
	}

	var validDevCerts = 0,
		validDistCerts = 0;

	Object.keys(dest.certs.keychains).forEach(function (keychain) {
		validDevCerts += (dest.certs.keychains[keychain].developer || []).filter(function (c) {
			return !c.invalid;
		}).length;

		validDistCerts += (dest.certs.keychains[keychain].distribution || []).filter(function (c) {
			return !c.invalid;
		}).length;
	});

	if (!validDevCerts) {
		dest.issues.push({
			id: 'IOS_NO_VALID_DEV_CERTS_FOUND',
			type: 'warning',
			message:
				__('Unable to find any valid iOS developer certificates.') +
				'\n' +
				__('This will prevent you from building apps for iOS devices.'),
		});
	}

	if (!validDistCerts) {
		dest.issues.push({
			id: 'IOS_NO_VALID_DIST_CERTS_FOUND',
			type: 'warning',
			message:
				__('Unable to find any valid iOS production distribution certificates.') +
				'\n' +
				__('This will prevent you from packaging apps for distribution.'),
		});
	}
}
