// @prisma/generator-helper is CommonJS and Node cannot see its named exports from an ES module.
import helper from '@prisma/generator-helper';
import { generate } from './generator.js';

helper.generatorHandler({
  onManifest: () => ({ prettyName: 'Prisma Go Generator', defaultOutput: './models' }),
  onGenerate: async (options) => generate(options),
});
