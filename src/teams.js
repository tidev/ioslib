import { getProvisioningProfiles } from './provisioning';
import { mutex } from 'appcd-util';

/**
 * Aggregates all teams found in the provisioning profiles.
 *
 * @param {String} [dir] - The directory to scan for provisioning profiles.
 * @returns {Promise<Object>}
 */
export function getTeams(dir) {
	return mutex('ioslib/teams', async () => {
		const profiles = await getProvisioningProfiles(dir);
		return buildTeamsFromProvisioningProfiles(profiles);
	});
}

/**
 * Creates a map of team ids to the team name based on the list of provided provisioning profiles.
 *
 * @param {Object} profiles - An object of profile types to profile objects.
 * @returns {Object}
 */
export function buildTeamsFromProvisioningProfiles(profiles) {
	if (!profiles || typeof profiles !== 'object') {
		throw new TypeError('Expected profiles list to be an object');
	}

	const teams = {};

	for (const type of Object.keys(profiles)) {
		if (Array.isArray(profiles[type])) {
			for (const profile of profiles[type]) {
				for (const id of profile.teamIds) {
					if (id) {
						teams[id] = id;
					}
				}
				if (profile.teamId) {
					teams[profile.teamId] = profile.teamName || profile.teamId;
				}
			}
		}
	}

	return teams;
}
