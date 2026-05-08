import { describe, it, expect } from 'vitest';
import { render, escapeText } from '../../../prompts/loader';

describe('render', () => {
  it('replaces placeholders with values', () => {
    const result = render('Hello {{name}}!', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  it('keeps missing keys as-is', () => {
    const result = render('Hello {{missing}}!', {});
    expect(result).toBe('Hello {{missing}}!');
  });

  it('replaces multiple variables', () => {
    const result = render('{{greeting}} {{name}}', { greeting: 'Hi', name: 'Alice' });
    expect(result).toBe('Hi Alice');
  });
});

describe('escapeText', () => {
  it('escapes double-brace patterns', () => {
    const input = 'This has {{template}} syntax';
    const escaped = escapeText(input);
    const result = render(`Text: {{text}}`, { text: escaped });
    expect(result).toBe('Text: This has {\\{template}\\} syntax');
  });

  it('leaves normal text unchanged', () => {
    expect(escapeText('Normal text')).toBe('Normal text');
  });
});
