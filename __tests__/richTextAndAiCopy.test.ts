import { htmlToEditableText } from '../src/utils/richText';
import { aiCopyToast, toProductCopy } from '../src/utils/aiCopy';

describe('htmlToEditableText', () => {
  test('inverts the backend plainTextToHtml subset', () => {
    expect(htmlToEditableText('<p>Intro &amp; more</p><ul><li>a</li><li>b</li></ul><p>After</p>')).toEqual({
      text: 'Intro & more\n\n• a\n• b\n\nAfter',
      editable: true,
    });
    expect(htmlToEditableText('<p>Line one<br>Line two</p>')).toEqual({
      text: 'Line one\nLine two',
      editable: true,
    });
  });

  test('empty / legacy plain text stay editable as-is', () => {
    expect(htmlToEditableText(null)).toEqual({ text: '', editable: true });
    expect(htmlToEditableText('Old plain\n\n• x')).toEqual({ text: 'Old plain\n\n• x', editable: true });
    expect(htmlToEditableText('Sizes < 40')).toEqual({ text: 'Sizes < 40', editable: true });
  });

  test('richer HTML is read-only with a readable preview', () => {
    expect(htmlToEditableText('<h2>Title</h2><p><strong>Bold</strong> text</p>')).toEqual({
      text: 'Title\n\nBold text',
      editable: false,
    });
    expect(htmlToEditableText('<p style="color:red">x</p>').editable).toBe(false);
    expect(htmlToEditableText('<ol><li>one</li></ol>').editable).toBe(false);
  });
});

describe('toProductCopy', () => {
  test('accepts the server shape and rejects junk', () => {
    expect(toProductCopy({ name: 'N', description: 'D', descriptionLong: 'L', model: 'm' })).toEqual({
      name: 'N',
      description: 'D',
      descriptionLong: 'L',
    });
    expect(toProductCopy(null)).toBeNull();
    expect(toProductCopy('x')).toBeNull();
    expect(toProductCopy({ name: 1, description: '' })).toBeNull();
  });
});

describe('aiCopyToast', () => {
  test('describes only what was filled', () => {
    expect(aiCopyToast('3 images added', [])).toBe('3 images added - add product details');
    expect(aiCopyToast('Images added', ['name'])).toContain('name drafted');
    expect(aiCopyToast('Images added', ['description', 'descriptionLong'])).toContain('description drafted');
    expect(aiCopyToast('Images added', ['name', 'descriptionLong'])).toContain('name & description drafted');
  });
});
