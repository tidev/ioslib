import { findExecutable } from './util/find-executable.ts';
import { Issue } from './util/issue.ts';

export type IosEnv = {
	executables: {
		xcodeSelect: string | null;
		security: string | null;
	};
	issues: Issue[];
};

let cache: IosEnv | null = null;

/**
 * Detects the iOS development enviroment dependencies.
 *
 * @param [options] - An object containing various settings
 * @param [options.bypassCache=false] - When `true`, re-detects the development
 * environment dependencies.
 * @param [options.security] - Path to the `security` executable
 * @param [options.xcodeSelect] - Path to the `xcode-select` executable
 */
export async function detect(options?: {
	bypassCache?: boolean;
	executables?: {
		security?: string | null;
		xcodeSelect?: string | null;
	};
}) {
	if (cache && !options?.bypassCache) {
		return cache;
	}

	const [security, xcodeSelect] = await Promise.all([
		findExecutable([options?.executables?.security, '/usr/bin/security', 'security']),
		findExecutable([options?.executables?.xcodeSelect, '/usr/bin/xcode-select', 'xcode-select']),
	]);

	let issues: Issue[] = [];
	if (!security) {
		issues.push(
			new Issue('Unable to find the "security" executable.', {
				id: 'IOS_SECURITY_EXECUTABLE_NOT_FOUND',
				type: 'error',
			})
		);
	}

	if (!xcodeSelect) {
		issues.push(
			new Issue('Unable to find the "xcode-select" executable.', {
				id: 'IOS_XCODE_SELECT_EXECUTABLE_NOT_FOUND',
				type: 'error',
			})
		);
	}

	cache = {
		executables: {
			xcodeSelect,
			security,
		},
		issues,
	};
	return cache;
}
