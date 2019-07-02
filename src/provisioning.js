import fs from 'fs';
import options from './options';
import path from 'path';
import plist from 'simple-plist';

import { cache, get, sha1 } from 'appcd-util';
import { expandPath } from 'appcd-path';
import { isFile } from 'appcd-fs';

const ppRegExp = /\.mobileprovision$/;

/**
 * The default provisioning profile directory.
 * @type {String}
 */
const defaultProvisioningProfileDir = '~/Library/MobileDevice/Provisioning Profiles';

/**
 * Returns the path to the provisioning profiles directory.
 *
 * @returns {String}
 */
export function getProvisioningProfileDir() {
	return get(options, 'provisioning.path') || defaultProvisioningProfileDir;
}

/**
 * Detects all provisioning profiles and sorts them into an object by type.
 *
 * @param {Boolean} [force=false] - When `true`, bypasses cache and forces redetection.
 * @param {String} [dir] - The directory to scan for provisioning profiles.
 * @returns {Promise<Object>}
 */
export async function getProvisioningProfiles(force, dir) {
	return cache('ioslib:provisioning', force, async () => {
		const profiles = {
			adhoc:        [],
			development:  [],
			distribution: [],
			enterprise:   []
		};

		try {
			const files = await findProvisioningProfileFiles(dir);

			await Promise.all(files.map(async (file) => {
				try {
					const profile = await parseProvisioningProfileFile(file);
					profiles[profile.type].push(profile);
				} catch (e) {
					// ignore
				}
			}));
		} catch (e) {
			// squelch
		}

		return profiles;
	});
}

/**
 * Finds all provisioning profiles in the specified directory.
 *
 * @param {String} [provisioningProfileDir] - The directory to scan for provisioning profiles.
 * Defaults to the user's default provisioning profiles directory.
 * @returns {Promise<Array.<String>>}
 */
export function findProvisioningProfileFiles(provisioningProfileDir) {
	return new Promise((resolve, reject) => {
		const dir = expandPath(provisioningProfileDir || getProvisioningProfileDir());

		fs.readdir(dir, (err, filenames) => {
			if (err && err.code === 'ENOENT') {
				return reject(new Error(`Provisioning profile directory does not exist: ${dir}`));
			} else if (err) {
				return reject(err);
			}

			const files = [];
			for (const filename of filenames) {
				if (ppRegExp.test(filename)) {
					const file = path.join(dir, filename);
					if (isFile(file)) {
						files.push(file);
					}
				}
			}

			resolve(files);
		});
	});
}

/**
 * Parses the specified provisioining profile and returns the information. Note that not all data in
 * the provisioning profile is returned.
 *
 * @param {String} file - The full path to the provisioning profile to parse.
 * @returns {Promise<Object>}
 */
export function parseProvisioningProfileFile(file) {
	return new Promise((resolve, reject) => {
		fs.readFile(file, 'utf8', (err, contents) => {
			if (err && err.code === 'ENOENT') {
				return reject(new Error(`Provisioning profile does not exist: ${file}`));
			} else if (err) {
				return reject(err);
			}

			const i = contents.indexOf('<?xml');
			const j = i === -1 ? i : contents.lastIndexOf('</plist>');

			if (j === -1) {
				return reject(new Error('Failed to parse provisioning profile: no plist found'));
			}

			let data;
			const write = console._stderr && console._stderr.write;
			if (write) {
				console._stderr.write = () => {};
			}
			try {
				data = plist.parse(contents.substring(i, j + 8), path.basename(file));
			} catch (e) {
				return reject(new Error(`Unable to parse provisioning profile: ${e.message}`));
			} finally {
				if (write) {
					console._stderr.write = write;
				}
			}

			const entitlements = data.Entitlements || {};
			const teamIds = Array.isArray(data.TeamIdentifier) ? data.TeamIdentifier : null;

			let type = 'development';
			if (data.ProvisionedDevices) {
				if (!entitlements['get-task-allow']) {
					// ad hoc
					type = 'adhoc';
				}
			} else if (data.ProvisionsAllDevices) {
				// enterprise ad hoc
				type = 'enterprise';
			} else {
				// app store
				type = 'distribution';
			}

			let expired = false;
			try {
				if (data.ExpirationDate) {
					expired = new Date(data.ExpirationDate) < new Date();
				}
			} catch (e) {
				// assume bad date is valid
			}

			const certs = {};
			if (Array.isArray(data.DeveloperCertificates)) {
				for (const cert of data.DeveloperCertificates) {
					const value = cert.toString('base64');
					const hash = sha1(value);
					certs[hash] = value;
				}
			}

			resolve({
				file,
				name:           data.Name,
				uuid:           data.UUID,
				type,
				creationDate:   data.CreationDate,
				expirationDate: data.ExpirationDate,
				expired,
				managed:        data.Name.indexOf('iOS Team Provisioning Profile') !== -1,
				certs,
				devices:        data.ProvisionedDevices || null,
				entitlements,
				teamIds,
				teamId:         teamIds && teamIds[0] || null,
				teamName:       data.TeamName || null
			});
		});
	});
}
