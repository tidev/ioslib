import options from './options';
import path from 'path';

import { mutex } from 'appcd-util';
import { run } from 'appcd-subprocess';

export const keychainMetaFile = '~/Library/Preferences/com.apple.security.plist';

/**
 * Returns a list of all keychains found.
 *
 * @returns {Promise}
 */
export function getKeychains() {
	return mutex('ioslib/keychains', async () => {
		const { stdout } = await run(options.executables.security, [ 'list-keychains' ]);
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
