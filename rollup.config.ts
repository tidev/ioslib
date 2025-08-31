import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';
import { minify as esbuildMinifyPlugin } from 'rollup-plugin-esbuild';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';

function generateConfig(format: 'es' | 'cjs') {
	return {
		input: './src/index.ts',
		output: {
			dir: './dist',
			externalLiveBindings: false,
			format: format,
			freeze: false,
			preserveModules: false,
			sourcemap: true
		},
		plugins: [
			esbuildMinifyPlugin({
				minify: true,
				minifySyntax: true
			}),
			typescript({
				tsconfig: './tsconfig.build.json'
			}),
			nodeResolve(),
			commonjs()
		]
	}
};

export default defineConfig([
	generateConfig('es'),
	generateConfig('cjs')
]);
