import * as ioslib from '../dist/index';

describe('Simulators', () => {
	it('should get simualators', async function () {
		this.timeout(60000);
		this.slow(10000);

		const simulators = await ioslib.simulator.getSimulators();
		expect(simulators).to.be.an('object');
		expect(simulators).to.have.keys('ios', 'watchos');

		for (const sims of Object.values(simulators.ios)) {
			for (const sim of sims) {
				expect(sim).to.be.instanceof(ioslib.simulator.Simulator);
			}
		}
	});
});
