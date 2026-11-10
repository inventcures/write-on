import { describe, expect, it } from 'vitest';
import { fitDictated, spokenPunctuation } from '../../src/core/dictation';

describe('dictation', () => {
  it('turns spoken punctuation into marks', () => {
    expect(spokenPunctuation('so comma what now question mark')).toBe('so, what now?');
    expect(spokenPunctuation('it ended full stop new paragraph then')).toBe('it ended.\n\nthen');
    expect(spokenPunctuation('wait exclamation mark')).toBe('wait!');
  });

  it('leaves the words alone when nothing was punctuation', () => {
    expect(spokenPunctuation('the period of the war')).toBe('the period of the war');
    expect(spokenPunctuation('a long period')).toBe('a long.');
    expect(spokenPunctuation('it was over period')).toBe('it was over.');
  });

  it('spaces and capitalises like a typist would', () => {
    expect(fitDictated('', 'hello there')).toBe('Hello there');
    expect(fitDictated('It rained.', 'we stayed in')).toBe(' We stayed in');
    expect(fitDictated('It rained and', 'we stayed in')).toBe(' we stayed in');
    expect(fitDictated('It rained ', 'so comma we stayed')).toBe('so, we stayed');
    expect(fitDictated('Then', 'comma later')).toBe(', later');
    expect(fitDictated('', 'one full stop two')).toBe('One. Two');
    expect(fitDictated('x', '   ')).toBe('');
  });
});
