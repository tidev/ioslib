import { run } from 'appcd-subprocess';
import { sleep } from 'appcd-util';

/**
 * Wrapper around executing the `simctl` utility that ships with Xcode.
 */
export default class Simctl {
	/**
	 * Sets the simctl executable path.
	 *
	 * @param {String} bin - The path to the `simctl` executable.
	 * @access public
	 */
	constructor(bin) {
		this.bin = bin;
	}

	/**
	 * Lists all simulator runtimes, device types, devices, and device pairs.
	 *
	 * @param {Number} [maxTries] - The maximum number of times to retry the "list" command before
	 * giving up.
	 * @returns {Promise}
	 * @access public
	 */
	list(maxTries) {
		return this.trySimctl([ 'list', '--json' ], maxTries)
			.then(output => {
				// we trim off everything before the first '{' just in case simctl outputs some
				// garbage
				const json = JSON.parse(output.substring(output.indexOf('{')));

				// convert the pairs from <pair udid> -> (ios sim + watch sim) to
				// <ios sim> -> <watch sims> -> <pair udid>
				const stateRegExp = /^\(((?:in)?active),/;
				json.iosSimToWatchSimToPair = {};
				Object.keys(json.pairs).forEach(function (pairUdid) {
					var pair = json.pairs[pairUdid];
					var m = pair.state.match(stateRegExp);
					if (m) {
						if (!json.iosSimToWatchSimToPair[pair.phone.udid]) {
							json.iosSimToWatchSimToPair[pair.phone.udid] = {};
						}
						json.iosSimToWatchSimToPair[pair.phone.udid][pair.watch.udid] = {
							udid: pairUdid,
							active: m[1] === 'active'
						};
					}
				});

				return json;
			});
	}

	/**
	 * Attempts to run `simctl`.
	 *
	 * @param {Array.<String>} args - The arguments to pass to the `simctl` command.
	 * @param {Number} [maxTries=4] - The maximum number of times to retry the `simctl` command
	 * before giving up. We need this because if we call a `simctl` for a different Xcode than the
	 * last time, it needs to shutdown the old CoreSimulatorService and start the new one which can
	 * cause `simctl` to fail.
	 * @returns {Promise<String>} Resolves the output from the `simctl` command.
	 * @access private
	 */
	trySimctl(args, maxTries) {
		let timeout = 100;

		const attempt = async (remainingTries) => {
			if (remainingTries < 0) {
				throw new Error('Failed to run simctl');
			}

			try {
				const { stdout } = await run(this.bin, args);
				return stdout.trim();
			} catch (e) {
				if (e.code === 161 || e.code === 37 && /This pair is already active/i.test(e.message)) {
					throw e;
				}

				if (/Failed to load CoreSimulatorService/i.test(e.message)) {
					// simctl needs to switch the CoreSimulatorService, waiting a couple seconds
					await sleep(2000);
					return attempt(remainingTries - 1);
				}

				await sleep(timeout);
				timeout *= 2;

				return attempt(remainingTries - 1);
			}
		};

		return attempt(Math.max(maxTries || 4, 1));
	}
}
