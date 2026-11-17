import { assertResettable } from './reset.js';

describe('assertResettable', () => {
  it('recusa limpar o banco em produção', () => {
    expect(() => assertResettable('production')).toThrow(/production/);
  });

  it.each(['development', 'test', undefined])(
    'permite limpar o banco com NODE_ENV=%s',
    (nodeEnv) => {
      expect(() => assertResettable(nodeEnv)).not.toThrow();
    },
  );
});
