import { describe, expect, it } from 'vitest';
import { adaptationDirective, emotionTrend } from '../src/ai/emotion';

describe('adaptationDirective', () => {
  it('adapts to strong negative emotions', () => {
    const angry = adaptationDirective({ label: 'angry', intensity: 0.8, valence: -0.8, arousal: 0.9 });
    expect(angry?.directive).toContain('upset');
    const frustrated = adaptationDirective({
      label: 'frustrated',
      intensity: 0.6,
      valence: -0.5,
      arousal: 0.6,
    });
    expect(frustrated?.reason).toContain('frustrated');
  });

  it('ignores weak signals and neutral states', () => {
    expect(
      adaptationDirective({ label: 'angry', intensity: 0.3, valence: -0.3, arousal: 0.4 }),
    ).toBeNull();
    expect(
      adaptationDirective({ label: 'neutral', intensity: 0.9, valence: 0, arousal: 0.2 }),
    ).toBeNull();
  });

  it('matches high positive energy', () => {
    const excited = adaptationDirective({ label: 'excited', intensity: 0.85, valence: 0.8, arousal: 0.9 });
    expect(excited?.directive).toContain('match their energy');
  });
});

describe('emotionTrend', () => {
  it('needs at least 3 points', () => {
    expect(emotionTrend([{ valence: -1 }, { valence: 1 }])).toBe('steady');
  });

  it('detects improvement and decline', () => {
    expect(
      emotionTrend([{ valence: -0.6 }, { valence: -0.5 }, { valence: 0.2 }, { valence: 0.4 }]),
    ).toBe('improving');
    expect(
      emotionTrend([{ valence: 0.5 }, { valence: 0.4 }, { valence: -0.2 }, { valence: -0.4 }]),
    ).toBe('declining');
    expect(
      emotionTrend([{ valence: 0.1 }, { valence: 0.1 }, { valence: 0.12 }, { valence: 0.08 }]),
    ).toBe('steady');
  });
});
