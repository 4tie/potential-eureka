import {
  isValidStatusTransition,
  normalizeStrategies,
  parsePairUniverse,
} from './utils';

describe('autoquant utils', () => {
  test('normalizes strategy objects from backend and frontend shapes', () => {
    expect(
      normalizeStrategies([
        { strategy_name: 'BackendStrategy', file: 'backend.py' },
        { name: 'FrontendStrategy', file: 'frontend.py' },
        { strategy_name: '', name: '' },
      ])
    ).toEqual([
      {
        file: 'backend.py',
        name: 'BackendStrategy',
        strategy_name: 'BackendStrategy',
      },
      {
        file: 'frontend.py',
        name: 'FrontendStrategy',
        strategy_name: 'FrontendStrategy',
      },
    ]);
  });

  test('parses comma and newline separated pair universes', () => {
    expect(parsePairUniverse('BTC/USDT, ETH/USDT\nSOL/USDT')).toEqual([
      'BTC/USDT',
      'ETH/USDT',
      'SOL/USDT',
    ]);
  });

  test('validates legal AutoQuant status transitions', () => {
    expect(isValidStatusTransition('running', 'completed')).toBe(true);
    expect(isValidStatusTransition('completed', 'running')).toBe(false);
    expect(isValidStatusTransition(undefined, 'running')).toBe(true);
  });
});
