import * as ioslib from '../dist/index';

describe('Simulators', () => {
	it('should get simualators', async function () {
		this.timeout(60000);
		this.slow(10000);

		const simulators = await ioslib.simulator.getSimulators({ force: true });
		expect(simulators).to.be.an('array');

		for (const sim of simulators) {
			expect(sim).to.be.instanceof(ioslib.simulator.Simulator);
		}
	});

	it('should generate a simulator registry', async function () {
		this.timeout(60000);
		this.slow(10000);

		const simulators = await ioslib.simulator.getSimulators({ force: true });
		const xcodes = await ioslib.xcode.getXcodes({ force: true });
		const registry = ioslib.simulator.generateSimulatorRegistry({ simulators, xcodes });

		expect(registry).to.be.an('object');
		expect(registry).to.have.keys('ios', 'watchos');

		for (const version of Object.keys(registry.ios)) {
			for (const sim of registry.ios[version]) {
				expect(sim).to.be.instanceof(ioslib.simulator.iOSSimulator);
			}
		}

		for (const version of Object.keys(registry.watchos)) {
			for (const sim of registry.watchos[version]) {
				expect(sim).to.be.instanceof(ioslib.simulator.watchOSSimulator);
			}
		}
	});
});
