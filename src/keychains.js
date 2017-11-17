import options from './options';
import path from 'path';

import { cache, get } from 'appcd-util';
import { run } from 'appcd-subprocess';

export const keychainMetaFile = '~/Library/Preferences/com.apple.security.plist';

/**
 * Returns a list of all keychains found.
 *
 * @param {Boolean} [force=false] - When `true`, bypasses cache and forces redetection.
 * @returns {Promise}
 */
export function getKeychains(force) {
	return cache('ioslib:keychains', force, async () => {
		const { stdout } = await run(get(options, 'executables.security') || 'security', [ 'list-keychains' ]);
		const keychains = [];

		for (const line of stdout.split('\n')) {
			const m = line.match(/^\s*"(.+)"\s*$/);
			if (m) {
				keychains.push({
					path: m[1],
					name: path.basename(m[1]).replace(/\.keychain$/, '')
				});
			}
		}

		return keychains;
	});
}

export default getKeychains;
