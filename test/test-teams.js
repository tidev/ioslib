import path from 'path';

import * as ioslib from '../dist/index';

describe('Teams', () => {
	it('should get all teams from the system provisioning profiles', async () => {
		const teams = await ioslib.teams.getTeams();

		expect(teams).to.be.an('object');
		for (const id of Object.keys(teams)) {
			expect(teams[id]).to.be.a('string');
		}
	});

	it('should get all teams from the mock provisioning profiles', async () => {
		const dir = path.join(__dirname, 'fixtures', 'Provisioning Profiles');
		const teams = await ioslib.teams.getTeams(dir);

		expect(teams).to.deep.equal({
			WP12345678: 'Testco'
		});
	});

	it('should fail to build teams from profiles if profiles is not valid', () => {
		expect(() => {
			ioslib.teams.buildTeamsFromProvisioningProfiles();
		}).to.throw(TypeError, 'Expected profiles list to be an object');

		expect(() => {
			ioslib.teams.buildTeamsFromProvisioningProfiles(123);
		}).to.throw(TypeError, 'Expected profiles list to be an object');
	});
});
