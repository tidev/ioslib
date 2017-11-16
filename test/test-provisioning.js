import path from 'path';

import { isFile } from 'appcd-fs';

import * as ioslib from '../dist/index';

describe('Provisioning Profiles', () => {
	it('should find provisioning profile files in default path', async () => {
		let files;
		try {
			files = await ioslib.provisioning.findProvisioningProfileFiles();
		} catch (e) {
			if (e.message.startsWith('Provisioning profile directory does not exist:')) {
				return;
			}
		}

		expect(files).to.be.an('array');

		for (const file of files) {
			expect(isFile(file)).to.be.true;
		}
	});

	it('should find provisioning profiles in custom path', async () => {
		const dir = path.join(__dirname, 'fixtures', 'Provisioning Profiles');
		const files = await ioslib.provisioning.findProvisioningProfileFiles(dir);

		expect(files).to.be.an('array');
		expect(files).to.have.lengthOf(2);

		for (const file of files) {
			expect(isFile(file)).to.be.true;
		}
	});

	it('should fail if provisioning profile director does not exist', done => {
		const dir = path.join(__dirname, 'fixtures', 'does_not_exist');
		ioslib.provisioning.findProvisioningProfileFiles(dir)
			.then(() => {
				done(new Error('Expected error'));
			})
			.catch(err => {
				expect(err).to.be.instanceof(Error);
				expect(err.message).to.equal(`Provisioning profile directory does not exist: ${dir}`);
				done();
			})
			.catch(done);
	});

	it('should read a provisioning profile file', async () => {
		const uuid = '11111111-1111-1111-1111-111111111111';
		const file = path.join(__dirname, 'fixtures', 'Provisioning Profiles', `${uuid}.mobileprovision`);
		const profile = await ioslib.provisioning.parseProvisioningProfileFile(file);

		expect(profile).to.be.an('object');
		expect(profile.file).to.equal(file);
		expect(profile.name).to.equal('Test App');
		expect(profile.uuid).to.equal(uuid);
		expect(profile.type).to.equal('distribution');
		if (profile.creationDate) {
			expect(profile.creationDate).to.be.a('date');
		}
		if (profile.expirationDate) {
			expect(profile.expirationDate).to.be.a('date');
		}
		expect(profile.expired).to.be.a('boolean');
		expect(profile.managed).to.equal(false);
		expect(profile.certs).to.have.property('6bf1be1240bbc6ceb7d43f9560235e6053aa6f3a', new Buffer('DEVELOPER_CERT_GOES_HERE').toString('base64'));
		expect(profile.devices).to.be.null;
		expect(profile.entitlements).to.be.an('object');
		expect(profile.teamIds).to.deep.equal([ 'WP12345678' ]);
		expect(profile.teamId).to.equal('WP12345678');
		expect(profile.teamName).to.be.equal('Testco');
	});

	it('should fail if provisioning profile does not exist', done => {
		const file = path.join(__dirname, 'fixtures', 'does_not_exist');
		ioslib.provisioning.parseProvisioningProfileFile(file)
			.then(() => {
				done(new Error('Expected error'));
			})
			.catch(err => {
				expect(err).to.be.instanceof(Error);
				expect(err.message).to.equal(`Provisioning profile does not exist: ${file}`);
				done();
			})
			.catch(done);
	});

	it('should fail if provisioning profile does not contain a plist', done => {
		const file = path.join(__dirname, 'fixtures', 'Bad Provisioning Profiles', 'no_plist.mobileprovision');
		ioslib.provisioning.parseProvisioningProfileFile(file)
			.then(() => {
				done(new Error('Expected error'));
			})
			.catch(err => {
				expect(err).to.be.instanceof(Error);
				expect(err.message).to.equal('Failed to parse provisioning profile: no plist found');
				done();
			})
			.catch(done);
	});

	it('should fail if provisioning profile contains a bad plist', done => {
		const file = path.join(__dirname, 'fixtures', 'Bad Provisioning Profiles', 'bad_plist.mobileprovision');
		ioslib.provisioning.parseProvisioningProfileFile(file)
			.then(() => {
				done(new Error('Expected error'));
			})
			.catch(err => {
				expect(err).to.be.instanceof(Error);
				expect(err.message).to.equal('Unable to parse provisioning profile: bad_plist.mobileprovision has errors');
				done();
			})
			.catch(done);
	});

	it('should get all provisioning profiles', async () => {
		const dir = path.join(__dirname, 'fixtures', 'Provisioning Profiles');
		const profiles = await ioslib.provisioning.getProvisioningProfiles(true, dir);

		expect(profiles).to.be.an('object');

		expect(profiles.adhoc).to.be.an('array');
		expect(profiles.development).to.be.an('array');
		expect(profiles.distribution).to.be.an('array');
		expect(profiles.enterprise).to.be.an('array');

		expect(profiles.adhoc).to.have.lengthOf(0);
		expect(profiles.development).to.have.lengthOf(1);
		expect(profiles.distribution).to.have.lengthOf(1);
		expect(profiles.enterprise).to.have.lengthOf(0);

		let profile = profiles.distribution[0];
		let uuid = '11111111-1111-1111-1111-111111111111';
		let file = path.join(__dirname, 'fixtures', 'Provisioning Profiles', `${uuid}.mobileprovision`);

		expect(profile).to.be.an('object');
		expect(profile.file).to.equal(file);
		expect(profile.name).to.equal('Test App');
		expect(profile.uuid).to.equal(uuid);
		expect(profile.type).to.equal('distribution');
		if (profile.creationDate) {
			expect(profile.creationDate).to.be.a('date');
		}
		if (profile.expirationDate) {
			expect(profile.expirationDate).to.be.a('date');
		}
		expect(profile.expired).to.be.a('boolean');
		expect(profile.managed).to.equal(false);
		expect(profile.certs).to.have.property('6bf1be1240bbc6ceb7d43f9560235e6053aa6f3a', new Buffer('DEVELOPER_CERT_GOES_HERE').toString('base64'));
		expect(profile.devices).to.be.null;
		expect(profile.entitlements).to.be.an('object');
		expect(profile.teamIds).to.deep.equal([ 'WP12345678' ]);
		expect(profile.teamId).to.equal('WP12345678');
		expect(profile.teamName).to.be.equal('Testco');

		profile = profiles.development[0];
		uuid = '22222222-2222-2222-2222-222222222222';
		file = path.join(__dirname, 'fixtures', 'Provisioning Profiles', `${uuid}.mobileprovision`);

		expect(profile).to.be.an('object');
		expect(profile.file).to.equal(file);
		expect(profile.name).to.equal('Test App');
		expect(profile.uuid).to.equal(uuid);
		expect(profile.type).to.equal('development');
		if (profile.creationDate) {
			expect(profile.creationDate).to.be.a('date');
		}
		if (profile.expirationDate) {
			expect(profile.expirationDate).to.be.a('date');
		}
		expect(profile.expired).to.be.a('boolean');
		expect(profile.managed).to.equal(false);
		expect(profile.certs).to.have.property('6bf1be1240bbc6ceb7d43f9560235e6053aa6f3a', new Buffer('DEVELOPER_CERT_GOES_HERE').toString('base64'));
		expect(profile.devices).to.be.an('array');
		expect(profile.devices).to.have.lengthOf(1);
		expect(profile.devices[0]).to.equal('UDID_GOES_HERE');
		expect(profile.entitlements).to.be.an('object');
		expect(profile.teamIds).to.deep.equal([ 'WP12345678' ]);
		expect(profile.teamId).to.equal('WP12345678');
		expect(profile.teamName).to.be.equal('Testco');
	});
});
