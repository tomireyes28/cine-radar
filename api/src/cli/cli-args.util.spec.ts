import { ALLOWED_CHAIN_KEYS, parseCliChainArg } from './cli-args.util';

describe('parseCliChainArg', () => {
  it('returns null when no argument or "all" is provided', () => {
    expect(parseCliChainArg([])).toBeNull();
    expect(parseCliChainArg([''])).toBeNull();
    expect(parseCliChainArg(['   '])).toBeNull();
    expect(parseCliChainArg(['all'])).toBeNull();
    expect(parseCliChainArg(['ALL'])).toBeNull();
    expect(parseCliChainArg([], 'all')).toBeNull();
  });

  it.each(ALLOWED_CHAIN_KEYS)(
    'accepts valid chain key "%s" case-insensitively',
    (key) => {
      expect(parseCliChainArg([key])).toBe(key);
      expect(parseCliChainArg([`  ${key.toUpperCase()}  `])).toBe(key);
    },
  );

  it('rejects multiple positional arguments', () => {
    expect(() => parseCliChainArg(['cinemark', 'showcase'])).toThrow(
      /Se esperaba como máximo 1 argumento/,
    );
  });

  it.each([
    'cinemark; echo pwned',
    '$(whoami)',
    '`id`',
    'cinemark && ls -la',
    'cinemark | cat /etc/passwd',
    'cine polis',
    'unknownchain',
    '../cinemark',
  ])('rejects unsafe or unknown input %p as a literal invalid key', (input) => {
    expect(() => parseCliChainArg([input])).toThrow(/Clave de cadena inválida/);
  });
});
