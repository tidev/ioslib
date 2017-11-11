import { getProvisioningProfiles } from './provisioning';
import { cache } from 'appcd-util';

/**
 * Aggregates all teams found in the provisioning profiles.
 *
 * @param {Boolean} [force=false] - When `true`, bypasses cache and forces redetection.
 * @param {String} [dir] - The directory to scan for provisioning profiles.
 * @returns {Promise<Object>}
 */
export function getTeams(force, dir) {
	return cache('ioslib:teams', force, async () => {
		const profiles = await getProvisioningProfiles(force, dir);
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
